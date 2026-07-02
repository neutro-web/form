# Benchmark: Array Operations at Scale (500+ item arrays)

**Date:** 2026-07-02
**Status:** Draft — pending user review
**Scope:** `bench/fixtures/`, `bench/suites/core/`, `bench/suites/browser/` (optional extension)

---

## Problem

The current `array-ops` surface uses different sizes at different layers: the **browser** surface (`bench/apps/*/src/*ArraySection.*`, `bench/suites/browser/array-ops.spec.ts`) uses a 10-item array; the **core** surface (`bench/suites/core/array-ops.bench.ts`) uses a 20-item array. Both are small enough that any O(n) behavior in `arrayRemove`/`arrayInsert`/`arrayMove` — including the just-shipped precision fix's own per-item notify loop, or the `shiftStateIndices`/`rekeyArrayState` state-map renaming — would be invisible. Neither can distinguish "O(shifted range)" (what we now believe we've achieved after this release's fix) from "O(n²)" or "O(total form size)" — the constant factors dominate at that size.

## Design

### New fixture: `bench/fixtures/large-array.ts`

```ts
export const largeArrayFixture: FormFixture = {
  initialValues: {
    items: Array.from({ length: 500 }, (_, i) => ({ name: `item${i}`, email: `item${i}@test.com` })),
  },
}
```

Object-shaped items (not bare strings) to match the real-world case and to exercise the descendant-scan path from the notify-cascade fix meaningfully (matches `nested-set`'s fixture shape/rationale, at 10x the item count).

Given the "Expected outcome" section below identifies a likely O(total-form-state-size) cost (not just O(array-size)) in `shiftStateIndices`'s unconditional scans, also add a **second fixture variant** with unrelated fields alongside the array (`largeArrayWithUnrelatedFieldsFixture`: the same 500-item array plus 500 unrelated top-level fields with some populated `touched`/`dirty` state) — comparing `array-ops-scale/remove` between the two fixtures isolates whether cost scales with array size alone or with total form state, which the single-fixture design can't distinguish.

### New surfaces: `array-ops-scale/remove`, `array-ops-scale/move`

Same measurement pattern as the existing `bench/suites/core/array-ops.bench.ts`, applied to `largeArrayFixture`. Critically, **also register per-item subscribers** (like `nested-set` does) so the benchmark measures the actual end-user-relevant cost: not just "how fast does the array mutate," but "how much notification work happens" — this is where the value of this release's array-ops precision fix should show up as a *relative* improvement over an unfixed baseline, and where any remaining inefficiency would surface at a scale where it matters.

**Iteration-reset confound — must be handled explicitly, not inherited from the existing benchmark.** The current `array-ops/remove` core benchmark resets its (20-item) array on every iteration via `a.set('items', [...resetItems])` before each `arrayRemove` call, because `tinybench` runs many thousands of iterations and the array would otherwise deplete after 20 removes. At 500 items this reset strategy becomes a real confound: a whole-array `set()` is itself an object-valued mutation that (since the notify-cascade fix) triggers `notifyPathSubscribers`' descendant scan across every registered per-item subscriber — exactly the O(n) cost this spec exists to measure separately from `arrayRemove`'s own cost. If the reset dominates, the benchmark would show `array-ops-scale/remove`'s cost as roughly constant regardless of removal index (masking the very shift-range-proportional signal this spec is trying to detect), or could make a *correct* O(shifted-range) fix look like it made no difference. The new surface must NOT reuse the naive "reset via set() on every iteration" pattern; use `tinybench`'s per-iteration setup hook if available, or restore only via a) creating a fresh `createForm` instance every iteration and treating that cost as a separate, disclosed line item, or b) restoring the removed item back into its slot with a direct (non-notifying, benchmark-harness-only) array splice on a plain JS array copy, only calling into the neutro adapter for the timed `arrayRemove` call itself — the exact mechanism needs to be decided during implementation, but the confound must be named and designed around, not silently inherited.

Two variants worth measuring separately:
1. **Remove near the start** (worst case for shift-based engines — maximum items shifted: index 0 of 500).
2. **Remove near the end** (best case — minimal items shifted: index 499 of 500).

Reporting both, rather than one "remove at some index," directly demonstrates whether cost scales with *shifted range* (the intended behavior) or with *total array size* (a regression) — a single-point measurement can't distinguish these, but the two together can (best case should be dramatically faster than worst case if the O(shifted range) design holds; if they're similar, that's evidence of an O(n) cost regardless of shift range, worth investigating).

### Browser extension (optional, lower priority within this spec)

The existing `bench/suites/browser/array-ops.spec.ts` and the bench apps' array sections use a 10-item array with fixed indices (`remove(3)`, `move(3,7)`). A large-array browser variant would need new bench-app routes (`/array-large` or a `?scale=N` query param, matching the existing `?fields=N` convention already used for `re-renders`). Given the core-level surface above already isolates the algorithmic question cleanly and browser-level large-array tests risk being dominated by DOM rendering cost (500 live inputs) rather than form-library array-op cost, treat the browser variant as a stretch goal, not a requirement — the core surface is where the real signal is.

## Expected outcome / hypothesis

Post this release's array-ops precision fix, `array-ops-scale/remove` at index 0 (worst case, 499 items shift) vs index 499 (best case, 0 items shift) should show a clear, measurable gap in neutro's own numbers proportional to shift range — that's the direct, quantified proof that the fix actually achieves O(shifted range) rather than O(n²) or O(n). If the gap ISN'T there (i.e., removing from the start costs the same as removing from the end), that's a real finding requiring investigation.

**A likely culprit is already identifiable from the current source, not just a hypothetical.** `shiftStateIndices` (`packages/core/src/index.ts`) calls `Object.keys(stateMap).forEach(...)` separately for `errors`, `touched`, `dirty`, and `wasSet` (four full scans), plus a separate `validatedPaths.forEach(...)` scan, plus — from this release's array-ops fix — a `pathSubscribers.keys()` scan for renamed-subscriber detection. All six of these scans iterate the *entire* respective collection (every field in the whole form, not just the array's own keys) on every single `arrayRemove`/`arrayInsert` call, filtering via `key.startsWith(prefix)` per key. This is unconditional and unbounded by shift range **or even by array size** — it scales with total form state size (every field's error/touched/dirty/validated/subscriber entries across the whole form, not just the 500-item array). A large form with a 500-item array *and* many other unrelated fields would pay this cost on every array mutation regardless of how small the actual shift is. This should be the first thing checked when implementing this spec — re-derive the actual Big-O from current source before writing any "expected outcome" into a public claim, and treat "removing from the start costs about the same as removing from the end, but both scale with unrelated form fields too" as the most likely finding, not a surprising one.

## Verification

`bench:core` surfaces, standard pattern. This spec's implementation should explicitly include re-deriving the Big-O of `shiftStateIndices`/`rekeyArrayState` from the actual current source (not assumed) before writing the "expected outcome" into any public claim — this spec's hypothesis section above already flags one candidate unconditional-scan cost worth checking first.

## Out of Scope

- Competitor comparison at this scale (RHF's `useFieldArray`, vee-validate's `useFieldArray`, etc. — worth adding once neutro's own scaling behavior is confirmed/fixed; starting neutro-only avoids conflating "is our scaling correct" with "how do we compare," which are separate questions best answered in sequence).
- Nested arrays (array of arrays, or arrays inside array items) — a real but more complex scenario, deferred to a future spec if this one's results motivate deeper investigation.
