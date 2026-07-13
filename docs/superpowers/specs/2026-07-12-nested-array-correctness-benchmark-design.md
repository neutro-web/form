# Nested Array Correctness + Scale Benchmark

**Date:** 2026-07-12
**Status:** Draft — pending user review
**Scope:** `packages/core/test/`, `bench/fixtures/`, `bench/suites/core/`. Possible fix to `packages/core/src/features/array-ops.ts` and/or `packages/core/src/engine.ts` if Phase 1 finds a real bug. No `bench/suites/correctness/` (cross-library Scorecard) changes, no browser surface, no `docs/benchmarks/index.md` changes unless a genuinely noteworthy number turns up.

This is v0.5.0 release-gate item 6 (the last remaining item — see the `project_v050_release_gate` memory). Items 1-5 and 7 are resolved.

---

## Problem

`docs/superpowers/specs/2026-07-02-bench-array-ops-at-scale-design.md` deferred "nested arrays (array of arrays, or arrays inside array items)" as "a real but more complex scenario," framed purely as a future *benchmark* — implying the underlying mechanism was already known-correct and only needed scale measurement. Investigation for this spec found that framing is wrong: `shiftStateIndices` and `rekeyArrayState` (`packages/core/src/features/array-ops.ts:56-92`, `172-220`) are generic, prefix-based string/regex matching with no depth-specific logic — structurally they *look* nesting-agnostic, and `indexKey`/`unindexKey` (`packages/core/src/engine.ts:551-576`) register every ancestor path-prefix of a key, not just one array level, which also looks nesting-agnostic by construction. But there is **zero existing test coverage** anywhere in `packages/core/test/` or `bench/suites/correctness/` exercising a path with two array segments (e.g. `groups.0.items.1.value`). Every existing array test — including `packages/core/test/array-ops-validated-renames.test.ts` and `bench/suites/correctness/array-state-integrity.test.ts` — is single-level (`items.N.field`).

So the real gap this item closes is: **nested-array mutation correctness (remove/move/swap/insert, at both the outer and inner array level) has never been verified, at any scale.** A scale benchmark on top of an unverified mechanism would be measuring something that might not even be correct.

## Design

### Phase 1: Correctness (primary deliverable)

New tests in `packages/core/test/nested-array-ops.test.ts`, modeled on the literal style of `array-ops-validated-renames.test.ts` (same package, direct `createForm` calls, `form.arrayRemove`/`arrayMove`/`arraySwap`/`arrayInsert`, assertions on `form.getState().errors`/`touched`/`dirty` and `form.isFieldValid(...)`). `bench/suites/correctness/array-state-integrity.test.ts` is cited only for its higher-level *pattern* (establish state at a path, mutate, assert the state relocated to the correct new path) — it lives in a separate pnpm workspace behind a bench-only adapter wrapper and is not a structural precedent for this file.

**Two shapes, both nested exactly 3 array-levels deep** (per user decision — deep enough to rule out a depth-dependent bug that only appears past 2 levels, without going to unbounded/arbitrary depth, which is YAGNI: the mechanism is prefix-generic and either works at any depth or breaks at the first nested level):

1. **Arrays of arrays of primitives** (no object wrapper between levels): `cube: number[][][]`, paths like `cube.0.1.2`.
2. **Arrays nested inside array items** (one array level per object hop): `groups: { items: { notes: string[] }[] }[]`, paths like `groups.0.items.1.notes.2`.

**Round-1-review correction — `Path<T>` does not type-check raw array-of-array nesting past one level, only object-wrapped nesting.** Round 1 adversarial review traced `PathImpl` (`packages/core/src/index.ts:29-44`) and confirmed by compiling against the real source: for `cube: number[][][]`, `'cube.0.1'` type-checks but `'cube.0.1.2'` does not — `PathImpl`'s recursive branch only descends into `U extends object`, and at the second array level `U` is itself `number[][]` (an array, not a plain object), so `keyof U` includes numeric indices that get silently discarded by the branch's `K extends string` guard. This is a real, previously-undocumented `Path<T>` limitation, but fixing the type machinery itself is a materially larger typing project than this item's runtime-correctness scope — **out of scope here, disclosed as a separate finding worth its own future item** (see Out of Scope). To still verify shape 1's *runtime* correctness (the actual point of this item — `shiftStateIndices`/`rekeyArrayState` operate on string paths at runtime regardless of what the type layer permits), shape 1's test file casts affected paths through `as Path<{ cube: number[][][] }>` — the value-shape type, not `typeof form` (which is `FormInstance<T>`, a different type entirely, per `createForm`'s real return signature at `index.ts:1002`).

**Round-2-review correction — cast precedent and worked cube example.** This cast is functionally equivalent to `bench/adapters/neutro.ts`'s existing `path as any` pattern (both exist to bypass an overly strict path type for a call the runtime handles correctly regardless) — it is not a claim that a stricter, previously-validated narrow-cast pattern already exists elsewhere in the codebase; it's simply the most specific cast available for this one file, preferred over a blanket `as any` only because it stays anchored to the real value shape. Shape 2 (`groups`) needs no such cast; every level there is object-wrapped and types cleanly.

For **each shape**, test **each of the four array operations** (`arrayRemove`, `arrayMove`, `arraySwap`, `arrayInsert`) applied at **all three array levels**, not just the outer and one inner level — the entire point of going 3 levels deep is to rule out a bug that only surfaces past 2 levels, so the mutation itself must reach the innermost level in at least one test per operation:
- **Outer-level mutation** — `groups`: `arrayRemove('groups', 0)`, asserts that state (errors/touched/dirty) attached to paths *nested two levels inside* the shifted outer elements re-indexes correctly (e.g. an error at `groups.1.items.0.notes.0` before removing `groups.0` must land at `groups.0.items.0.notes.0` after). `cube`: `arrayRemove('cube', 0)` (cast per above), asserts state at `cube.1.0.0` before removal lands at `cube.0.0.0` after.
- **Middle-level mutation** — `groups`: `arrayRemove('groups.0.items', 1)`, asserts state nested one level inside the shifted middle elements re-indexes correctly, and that state belonging to *sibling* outer elements (`groups.1.*`) is completely undisturbed. `cube`: `arrayRemove('cube.0', 1)`, asserts state at `cube.0.2.0` before removal lands at `cube.0.1.0` after, and state at `cube.1.*` is undisturbed.
- **Innermost-level mutation** — `groups`: `arrayRemove('groups.0.items.1.notes', 2)`, asserts state directly on the shifted leaf elements re-indexes correctly, and that sibling middle/outer elements (`groups.0.items.0.*`, `groups.1.*`) are completely undisturbed. `cube`: `arrayRemove('cube.0.0', 2)`, asserts state at `cube.0.0.3` before removal lands at `cube.0.0.2` after, and state at `cube.0.1.*`/`cube.1.*` is undisturbed. This is the level the original "3 levels deep" requirement exists to exercise, and round 1 found the prior "outer + one inner" design never reached it.

This gives 2 shapes × 4 operations × 3 mutation levels = 24 test cases minimum. Each test establishes state (error via `rules`/validator, or `touched`/`dirty` via `form.set(..., { touch: true })`) at a nested path *before* the mutation, performs the mutation, and asserts the state landed at the *correct new path*.

**If a real bug is found:** per this project's systematic-debugging discipline, root-cause it in `array-ops.ts`/`engine.ts` before proposing a fix — no guessing. A found-and-fixed bug becomes this item's headline finding, not a footnote; the fix itself stays scoped to the actual defect (no unrelated refactoring of the surrounding regex/prefix-matching code).

### Phase 2: Scale benchmark (only proceeds if Phase 1 is fully green)

New `bench/fixtures/nested-array.ts` + `bench/suites/core/array-ops-nested-scale.bench.ts`, mirroring item 1's `bench/fixtures/large-array.ts` / `bench/suites/core/array-ops-scale.bench.ts` pattern exactly (neutro-only, core-level, `describe`/`bench` blocks, no competitor adapters — per the same core-bench-is-neutro-only policy established in commit `3da9090` and reaffirmed by every subsequent core spec in this cycle).

Total field count target: comparable to item 1's ~500-field scale, distributed across the nested shape rather than flat. Concretely: `groups: 50 items, each with items: 10 sub-items, each with notes: 1 string[]` → 500 leaf `groups.N.items.M.notes.0` paths, matching item 1's scale for a fair before/after comparison against the existing flat-array numbers.

Benchmark `arrayRemove`/`arrayMove` (the two operations item 1 found to be the expensive ones) at both:
- **Outer level:** `arrayRemove('groups', N)` / `arrayMove('groups', a, b)` — shifts all 10 nested sub-items per affected outer element.
- **Inner level:** `arrayRemove('groups.0.items', N)` — shifts only within one outer element's sub-array.

Four `describe` blocks: `array-ops-nested/remove-outer`, `array-ops-nested/remove-inner`, `array-ops-nested/move-outer`, `array-ops-nested/move-inner`. This fixture intentionally uses only 2 meaningful array levels (`groups` → `items`; `notes` holds a single element per leaf and isn't itself a meaningful scale-mutation target) — Phase 2 is a scale/perf measurement building on correctness already established across all 3 levels by Phase 1, not a re-run of Phase 1's exhaustive per-level correctness matrix.

**No docs/benchmarks page changes** by default, matching the established pattern for core-only benchmarks (item 1's own `array-ops-scale` numbers are also not published there) — unless the numbers reveal something genuinely surprising relative to the flat-array baseline, in which case treat it as a "stop and investigate" trigger (same standing discipline as items 5 and 7) before deciding whether it's worth a docs mention.

## Expected outcome / hypothesis

Two independent possible outcomes, both real findings either way:
- **If Phase 1 passes clean:** this confirms the `pathIndex`-based generic prefix-matching design (introduced by item 1's `shiftStateIndices` rework) was nesting-agnostic by construction, not by luck — a positive result worth recording, since it means the item 1 rework already solved this without knowing it.
- **If Phase 1 finds a bug:** **Round-1-review correction** — the original draft's hypothesis (that `ctx.pathIndex.get(basePath)` might return stale or over-matched candidates at deeper nesting) doesn't hold up against how `indexKey`/`unindexKey` actually work (`engine.ts:551-576`): each prefix bucket is keyed by a concrete literal string (e.g. `groups.0.items`, specific to that exact group index), not a wildcard shared across sibling groups, so the bucket is exact by construction regardless of depth — round 1 hand-traced this and found no staleness/over-match mechanism. A more plausible candidate, if a bug exists, is in the regex-based tail-splitting logic itself: `shiftMap`'s `remaining.match(/^(\d+)(.*)$/)` (`array-ops.ts:76`) captures everything after the first index into an opaque `tail` string and reattaches it verbatim to the renamed key — if `tail` itself contains further array-index digits (as it always does at 3+ levels, e.g. `.items.1.notes.2`), nothing has actually verified those embedded digits stay correct/untouched when the *outer* index shifts, since the regex only ever inspects the first captured group. Phase 1's tests are the actual verification of whether this (or anything else) is a real problem — this is a hypothesis to test, not a known bug.

## Verification

- **Phase 1:** `pnpm exec vitest run packages/core/test/nested-array-ops.test.ts`, all cases green. If a bug is found and fixed, re-run the full `packages/core/test/` suite (not just the new file) to confirm the fix didn't regress the existing single-level array tests.
- **Phase 2:** `pnpm --dir bench run bench:core:sample`, confirm all 4 new `array-ops-nested/*` blocks execute cleanly with real timings.
- Full pipeline: `pnpm lint && pnpm exec tsc --noEmit && pnpm build && pnpm test` (per `CLAUDE.md`'s pre-push checklist).

## Out of Scope

- `bench/suites/correctness/` (the cross-library Scorecard comparison suite) — this item is about neutro's own engine correctness, not a competitor comparison; no other library's array API is being evaluated here.
- Browser-level benchmarking — no UI interaction is relevant to this item; it's a pure engine-mutation correctness/perf question, same posture as item 1.
- `docs/benchmarks/index.md` changes — unless Phase 2 surfaces something genuinely surprising (see "Expected outcome" above), this stays dev/regression-facing only, matching item 1's own `array-ops-scale` precedent.
- Nesting depths beyond 3 levels, or additional shapes beyond the two named here (e.g. an array containing both an array-of-arrays AND an array-inside-items in the same structure) — 3 levels across both of the deferral note's own named shapes is sufficient to prove or disprove the generic-mechanism hypothesis; further combinations are YAGNI without a concrete motivating case.
- Any change to the four array operations' public API/signatures — this item may fix an internal bug in their implementation, but does not change `arrayRemove`/`arrayMove`/`arraySwap`/`arrayInsert`/`arrayAppend`'s contract.
- **Fixing `Path<T>`'s inability to type raw array-of-array nesting past one level** (see Round-1-review correction in Phase 1 above — confirmed via real compilation that `'cube.0.1.2'` doesn't type-check against `Path<{cube: number[][][]}>`, only `'cube.0.1'` does). This is a genuine, previously-undocumented type-system limitation distinct from this item's runtime-correctness scope; worth its own future item if raw (non-object-wrapped) nested arrays turn out to be a real user-facing need, not bundled here.
