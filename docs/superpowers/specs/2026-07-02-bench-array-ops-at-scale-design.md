# Benchmark: Array Operations at Scale (500+ item arrays)

**Date:** 2026-07-02
**Status:** Draft — pending user review
**Scope:** `bench/fixtures/`, `bench/suites/core/`, `bench/suites/browser/` (optional extension)

---

## Problem

The current `array-ops` surface (both core and browser) uses a 10-item array. That's realistic for a lot of real forms (line items on an invoice, a handful of dynamic rows), but it's small enough that any O(n) behavior in `arrayRemove`/`arrayInsert`/`arrayMove` — including the just-shipped precision fix's own per-item notify loop, or the `shiftStateIndices`/`rekeyArrayState` state-map renaming — would be invisible. A 10-item test can't distinguish "O(shifted range)" (what we now believe we've achieved after this release's fix) from "O(n²)" or "O(total form size)" — the constant factors dominate at that size.

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

### New surfaces: `array-ops-scale/remove`, `array-ops-scale/move`

Same measurement pattern as the existing `bench/suites/core/array-ops.bench.ts`, applied to `largeArrayFixture`. Critically, **also register per-item subscribers** (like `nested-set` does) so the benchmark measures the actual end-user-relevant cost: not just "how fast does the array mutate," but "how much notification work happens" — this is where the value of this release's array-ops precision fix should show up as a *relative* improvement over an unfixed baseline, and where any remaining inefficiency would surface at a scale where it matters.

Two variants worth measuring separately:
1. **Remove near the start** (worst case for shift-based engines — maximum items shifted: index 0 of 500).
2. **Remove near the end** (best case — minimal items shifted: index 499 of 500).

Reporting both, rather than one "remove at some index," directly demonstrates whether cost scales with *shifted range* (the intended behavior) or with *total array size* (a regression) — a single-point measurement can't distinguish these, but the two together can (best case should be dramatically faster than worst case if the O(shifted range) design holds; if they're similar, that's evidence of an O(n) cost regardless of shift range, worth investigating).

### Browser extension (optional, lower priority within this spec)

The existing `bench/suites/browser/array-ops.spec.ts` and the bench apps' array sections use a 10-item array with fixed indices (`remove(3)`, `move(3,7)`). A large-array browser variant would need new bench-app routes (`/array-large` or a `?scale=N` query param, matching the existing `?fields=N` convention already used for `re-renders`). Given the core-level surface above already isolates the algorithmic question cleanly and browser-level large-array tests risk being dominated by DOM rendering cost (500 live inputs) rather than form-library array-op cost, treat the browser variant as a stretch goal, not a requirement — the core surface is where the real signal is.

## Expected outcome / hypothesis

Post this release's array-ops precision fix, `array-ops-scale/remove` at index 0 (worst case, 499 items shift) vs index 499 (best case, 0 items shift) should show a clear, measurable gap in neutro's own numbers proportional to shift range — that's the direct, quantified proof that the fix actually achieves O(shifted range) rather than O(n²) or O(n). If the gap ISN'T there (i.e., removing from the start costs the same as removing from the end), that's a real finding requiring investigation — either the fix didn't fully achieve its goal, or there's a different O(n) cost elsewhere (e.g. `shiftStateIndices`'s `Object.keys(stateMap).forEach(...)` scan over the *entire* state map on every shift, regardless of how many keys actually match the array's prefix — worth specifically checking this during implementation, since that scan is unconditional and not currently bounded by shift range).

## Verification

`bench:core` surfaces, standard pattern. This spec's implementation should explicitly include re-deriving the Big-O of `shiftStateIndices`/`rekeyArrayState` from the actual current source (not assumed) before writing the "expected outcome" into any public claim — this spec's hypothesis section above already flags one candidate unconditional-scan cost worth checking first.

## Out of Scope

- Competitor comparison at this scale (RHF's `useFieldArray`, vee-validate's `useFieldArray`, etc. — worth adding once neutro's own scaling behavior is confirmed/fixed; starting neutro-only avoids conflating "is our scaling correct" with "how do we compare," which are separate questions best answered in sequence).
- Nested arrays (array of arrays, or arrays inside array items) — a real but more complex scenario, deferred to a future spec if this one's results motivate deeper investigation.
