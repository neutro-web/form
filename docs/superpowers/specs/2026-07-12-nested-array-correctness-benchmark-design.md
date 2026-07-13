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

New tests in `packages/core/test/nested-array-ops.test.ts`, modeled on the existing style in `array-ops-validated-renames.test.ts` (direct `createForm` calls, `form.arrayRemove`/`arrayMove`/`arraySwap`/`arrayInsert`, assertions on `form.getState().errors`/`touched`/`dirty` and `form.isFieldValid(...)`).

**Two shapes, both nested exactly 3 array-levels deep** (per user decision — deep enough to rule out a depth-dependent bug that only appears past 2 levels, without going to unbounded/arbitrary depth, which is YAGNI: the mechanism is prefix-generic and either works at any depth or breaks at the first nested level):

1. **Arrays of arrays of primitives** (no object wrapper between levels): `cube: number[][][]`, paths like `cube.0.1.2`.
2. **Arrays nested inside array items** (one array level per object hop): `groups: { items: { notes: string[] }[] }[]`, paths like `groups.0.items.1.notes.2`.

For **each shape**, test **each of the four array operations** (`arrayRemove`, `arrayMove`, `arraySwap`, `arrayInsert`) applied at **two levels**:
- **Outer-level mutation** (e.g. `arrayRemove('groups', 0)`) — asserts that state (errors/touched/dirty) attached to paths *nested inside* the shifted outer elements re-indexes correctly (e.g. an error at `groups.1.items.0.notes.0` before removing `groups.0` must land at `groups.0.items.0.notes.0` after).
- **Inner-level mutation** (e.g. `arrayRemove('groups.0.items', 1)`) — asserts that state nested inside the shifted *inner* elements re-indexes correctly, and that state belonging to *sibling* outer elements (`groups.1.*`) is completely undisturbed.

This gives 2 shapes × 4 operations × 2 mutation levels = 16 test cases minimum. Each test establishes state (error via `rules`/validator, or `touched`/`dirty` via `form.set(..., { touch: true })`) at a nested path *before* the mutation, performs the mutation, and asserts the state landed at the *correct new path* — mirroring `array-state-integrity.test.ts`'s existing "validate to establish state, mutate, assert state moved" pattern.

**If a real bug is found:** per this project's systematic-debugging discipline, root-cause it in `array-ops.ts`/`engine.ts` before proposing a fix — no guessing. A found-and-fixed bug becomes this item's headline finding, not a footnote; the fix itself stays scoped to the actual defect (no unrelated refactoring of the surrounding regex/prefix-matching code).

### Phase 2: Scale benchmark (only proceeds if Phase 1 is fully green)

New `bench/fixtures/nested-array.ts` + `bench/suites/core/array-ops-nested-scale.bench.ts`, mirroring item 1's `bench/fixtures/large-array.ts` / `bench/suites/core/array-ops-scale.bench.ts` pattern exactly (neutro-only, core-level, `describe`/`bench` blocks, no competitor adapters — per the same core-bench-is-neutro-only policy established in commit `3da9090` and reaffirmed by every subsequent core spec in this cycle).

Total field count target: comparable to item 1's ~500-field scale, distributed across the nested shape rather than flat. Concretely: `groups: 50 items, each with items: 10 sub-items, each with notes: 1 string[]` → 500 leaf `groups.N.items.M.notes.0` paths, matching item 1's scale for a fair before/after comparison against the existing flat-array numbers.

Benchmark `arrayRemove`/`arrayMove` (the two operations item 1 found to be the expensive ones) at both:
- **Outer level:** `arrayRemove('groups', N)` / `arrayMove('groups', a, b)` — shifts all 10 nested sub-items per affected outer element.
- **Inner level:** `arrayRemove('groups.0.items', N)` — shifts only within one outer element's sub-array.

Four `describe` blocks: `array-ops-nested/remove-outer`, `array-ops-nested/remove-inner`, `array-ops-nested/move-outer`, `array-ops-nested/move-inner`.

**No docs/benchmarks page changes** by default, matching the established pattern for core-only benchmarks (item 1's own `array-ops-scale` numbers are also not published there) — unless the numbers reveal something genuinely surprising relative to the flat-array baseline, in which case treat it as a "stop and investigate" trigger (same standing discipline as items 5 and 7) before deciding whether it's worth a docs mention.

## Expected outcome / hypothesis

Two independent possible outcomes, both real findings either way:
- **If Phase 1 passes clean:** this confirms the `pathIndex`-based generic prefix-matching design (introduced by item 1's `shiftStateIndices` rework) was nesting-agnostic by construction, not by luck — a positive result worth recording, since it means the item 1 rework already solved this without knowing it.
- **If Phase 1 finds a bug:** most likely candidate, per the code read during this spec's research, is the `tail` capture in `shiftMap`'s regex (`array-ops.ts:76`, `remaining.match(/^(\d+)(.*)$/)`) interacting incorrectly with `ctx.pathIndex.get(basePath)`'s candidate set when `basePath` itself contains array segments (e.g. does `ctx.pathIndex.get('groups.0.items')` correctly return only paths under that exact prefix, or does a stale/incomplete index entry from `indexKey`'s ancestor-walk cause candidates to be missed or over-matched at deeper nesting?) — this is a hypothesis to test, not a known bug; Phase 1's tests are the actual verification.

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
