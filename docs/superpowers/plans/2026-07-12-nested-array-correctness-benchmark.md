# Nested Array Correctness + Scale Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove (or disprove) that neutro's array mutation operations (`arrayRemove`/`arrayMove`/`arraySwap`/`arrayInsert`) correctly relocate tracked state (`errors`/`touched`/`dirty`) at nesting depths beyond the single level every existing test covers, then benchmark the two most expensive operations at a comparable scale to the existing flat-array numbers.

**Architecture:** Phase 1 (primary deliverable) adds a new correctness test file exercising two 3-level-deep nested shapes — `cube: number[][][]` (raw array-of-arrays) and `groups: { items: { notes: string[] }[] }[]` (object-wrapped array nesting) — against all four array operations at all three nesting levels. Phase 2 (gated on Phase 1 passing clean) adds a `bench/` fixture and `describe`/`bench` suite mirroring item 1's flat-array scale benchmark, at a matched ~500-leaf-path scale distributed across the nested shape.

**Tech Stack:** TypeScript, Vitest (`packages/core/test/`), Vitest `bench` (`bench/suites/core/`), `@neutro/form-core`'s `createForm`.

## Global Constraints

- Repo-code scope is limited to `packages/core/test/`, `bench/fixtures/`, `bench/suites/core/`. A fix to `packages/core/src/features/array-ops.ts` and/or `packages/core/src/engine.ts` is in scope **only if** Phase 1 finds a real bug — do not touch these files otherwise. Separately, Task 4 Step 4 updates the out-of-tree v0.5.0 release-gate memory file (`/Users/kofi/.claude/projects/-Users-kofi---agw-form/memory/project_v050_release_gate.md`) to close out this item — this is a deliberate tracking update, not repo code, and does not count against the repo-code scope above.
- No changes to `bench/suites/correctness/` (the cross-library Scorecard suite) — this item is neutro-only engine correctness, not a competitor comparison.
- No browser-level benchmarking.
- No `docs/benchmarks/index.md` changes, unless Phase 2's numbers are genuinely surprising relative to the existing flat-array `array-ops-scale` baseline — if so, stop and flag it to the user before deciding whether it's worth a docs mention (same "stop and investigate" discipline used for v0.5.0 items 5 and 7). Do not add a docs mention unilaterally.
- No nesting depths beyond 3 levels, no shapes beyond the two named here (cube, groups) — YAGNI, per spec.
- No changes to the four array operations' public API/signatures. An internal bug fix (if found) must stay scoped to the actual defect — no unrelated refactoring of the surrounding regex/prefix-matching code.
- Do not attempt to fix `Path<T>`'s inability to type raw array-of-array nesting past one level (confirmed via real compilation: `'cube.0.1.2'` does not type-check against `Path<{cube: number[][][]}>`, only `'cube.0.1'` does). This is flagged as a separate, out-of-scope, previously-undocumented type-system limitation — do not touch `packages/core/src/index.ts`'s `PathImpl`/`Path` types in this plan.
- Per `CLAUDE.md`'s pre-push checklist, the full local pipeline (`pnpm lint && pnpm exec tsc --noEmit && pnpm build && pnpm test`) must pass before this work is considered done. `pnpm lint`/root `tsc --noEmit` do not cover `bench/` (it's a separate pnpm-workspace-excluded package with its own lockfile and tooling) — verify `bench/` separately via `pnpm --dir bench exec tsc --noEmit` and disclose (don't silently skip) any pre-existing unrelated errors there, matching the precedent from the class-validator benchmark plan (v0.5.0 item 5).
- Do not manually edit `CHANGELOG.md` — release-please generates it from commit messages.

## Technical Note for the Implementer (read before Task 1)

The spec (`docs/superpowers/specs/2026-07-12-nested-array-correctness-benchmark-design.md`) cites `packages/core/test/array-ops-validated-renames.test.ts` (which uses `rules` + `form.validate()` + `form.isFieldValid()`) as a style precedent. Investigation while writing this plan found that pattern does **not** reliably prove state relocation here: every array-mutation function (`arrayRemove`/`arrayMove`/`arraySwap`/`arrayInsert` in `packages/core/src/features/array-ops.ts`) unconditionally calls `ctx.runValidation([targetPath])` as its last step. When a form is configured with `rules`, that call re-validates the array's own base path (e.g. `'groups'`) — `applyBuiltInRules` looks up `rules['groups']` by exact key, which is never populated by leaf-keyed or wildcard-keyed rules, so it produces zero errors for that scope. `mergeScopedErrors` then deletes every existing error under `'groups.*'` before merging in that empty result — meaning any error you set up via `rules` before the mutation gets wiped out by the mutation's own internal auto-revalidation, before you ever get to assert it relocated.

The correct, already-established precedent for this exact scenario is `packages/core/test/engine-invariant.test.ts` (`describe('mutation invariant: array-ops error/touched/dirty/wasSet shifting')`): it uses **no `rules`/`validator` config at all**, sets error state directly via `form.setErrors({...})` and touched/dirty via `form.set(path, value, { touch: true })` (dirty is automatic — `setFieldValue` marks a path dirty whenever the new value differs from its initial value). With no `rules`/`validator` configured, `runValidation`'s no-config fast path never touches `ctx.errors` at all, so state set up before a mutation is only ever changed by the mutation's own re-indexing logic — which is the actual thing under test.

**Use the `engine-invariant.test.ts` pattern (`setErrors` + `set(..., { touch: true })`, no `rules`/`validator`) for every test in this plan.** This is a deliberate, verified deviation from the spec's literal citation, made in service of the spec's actual intent (proving state relocation) — the alternative would produce tests that always pass regardless of whether relocation works correctly, which defeats the point.

Both shapes use dimensions `3 × 3 × 4` (outer × middle × inner) so every mutation has room to exercise a genuine sliding-window shift (not just a 2-element swap) at every level:

```ts
type CubeShape = { cube: number[][][] };

function makeCube(): number[][][] {
  return Array.from({ length: 3 }, (_, i) =>
    Array.from({ length: 3 }, (_, j) => Array.from({ length: 4 }, (_, k) => i * 100 + j * 10 + k))
  );
}

type GroupsShape = {
  groups: { items: { notes: string[] }[] }[];
};

function makeGroups(): GroupsShape['groups'] {
  return Array.from({ length: 3 }, (_, g) => ({
    items: Array.from({ length: 3 }, (_, i) => ({
      notes: Array.from({ length: 4 }, (_, n) => `g${g}-i${i}-n${n}`),
    })),
  }));
}
```

Verified against the real `Path<T>`/`GetPathValue`/`ArrayItem` types by compiling with `pnpm exec tsc --noEmit -p packages/core/tsconfig.json`: the array-op calls themselves (`arrayRemove('cube', 0)`, `arrayRemove('cube.0', 1)`, `arrayRemove('cube.0.0', 2)`, and the `arrayMove`/`arraySwap`/`arrayInsert` equivalents) type-check **without any cast**, at every level, for both shapes — `Path<T>`'s one-level-of-array-nesting limit only bites at literal leaf paths 3 array-indices deep. Only `form.set(...)` and `form.setErrors(...)` calls that reference a cube leaf path 3 indices deep (e.g. `'cube.0.0.3'`) need a cast, exactly as the spec's Round-1 correction describes:

```ts
form.set('cube.0.0.3' as Path<CubeShape>, 999, { touch: true });
form.setErrors({ 'cube.0.0.3': 'bad' } as Partial<Record<Path<CubeShape>, string>>);
```

`groups` needs no casts anywhere — every level there is object-wrapped and types cleanly.

**Round-1-review note:** the pipeline's `pnpm exec tsc --noEmit` does not type-check `nested-array-ops.test.ts` — the root `tsconfig.json` excludes `**/*.test.ts`, and `packages/core/tsconfig.json` (cited above for the cast verification) only `include`s `src/**/*`. `vitest run` transpiles via esbuild and does not type-check either. The cast verification above was done by compiling a throwaway file directly against `packages/core/tsconfig.json`; the plan's tasks don't re-verify this. If a task's implementer changes any of the cast expressions, re-verify by writing a throwaway `.ts` file under `packages/core/src/` (not `test/`) with the modified snippet and running `pnpm exec tsc --noEmit -p packages/core/tsconfig.json` against it, then delete the throwaway file — the same method used to derive this plan's casts.

---

### Task 1: Cube-shape correctness tests (arrayRemove/arrayMove/arraySwap/arrayInsert × 3 levels)

**Files:**
- Create: `packages/core/test/nested-array-ops.test.ts`

**Interfaces:**
- Consumes: `createForm` and `Path` from `../src/index.js` (no other task's output).
- Produces: `makeCube`, `createCubeForm`, `CubeShape` — Task 2 appends a sibling `describe` block to this same file and must reuse the file's existing imports (`describe`, `expect`, `it`, `createForm`, `Path`), adding its own `makeGroups`/`createGroupsForm`/`GroupsShape` alongside these without duplicating the import lines.

This is a correctness-verification task, not new-feature TDD: the behavior under test (`shiftStateIndices`/`rekeyArrayState` in `packages/core/src/features/array-ops.ts`) already exists and is expected to pass — a spot-check during plan-writing confirmed all sampled cases pass cleanly with no bug found. There is no red/green cycle; each step below writes one `it` block, and the whole suite is run once at the end of the task.

- [ ] **Step 1: Create the test file with shared cube setup and the `arrayRemove` describe block**

```ts
import { describe, expect, it } from 'vitest';
import { createForm } from '../src/index.js';
import type { Path } from '../src/index.js';

type CubeShape = { cube: number[][][] };

function makeCube(): number[][][] {
  return Array.from({ length: 3 }, (_, i) =>
    Array.from({ length: 3 }, (_, j) => Array.from({ length: 4 }, (_, k) => i * 100 + j * 10 + k))
  );
}

function createCubeForm() {
  return createForm<CubeShape>({ initialValues: { cube: makeCube() } });
}

describe('nested-array-ops: cube (number[][][], raw array-of-arrays)', () => {
  describe('arrayRemove', () => {
    it('outer level: relocates state from cube.1.0.0 to cube.0.0.0 and removes the stale entry', () => {
      const form = createCubeForm();
      form.set('cube.1.0.0' as Path<CubeShape>, 999, { touch: true });
      form.setErrors({ 'cube.1.0.0': 'bad' } as Partial<Record<Path<CubeShape>, string>>);

      form.arrayRemove('cube', 0);

      const state = form.getState();
      expect(state.errors['cube.0.0.0']).toBe('bad');
      expect(state.touched['cube.0.0.0']).toBe(true);
      expect(state.dirty['cube.0.0.0']).toBe(true);
      expect(state.errors['cube.1.0.0']).toBeUndefined();
      expect(state.touched['cube.1.0.0']).toBeUndefined();
    });

    it('middle level: relocates state from cube.0.2.0 to cube.0.1.0 and leaves sibling outer element cube.1 undisturbed', () => {
      const form = createCubeForm();
      form.set('cube.0.2.0' as Path<CubeShape>, 999, { touch: true });
      form.setErrors({ 'cube.0.2.0': 'bad' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.1.0.0' as Path<CubeShape>, 555, { touch: true });
      form.setErrors({ 'cube.1.0.0': 'sibling' } as Partial<Record<Path<CubeShape>, string>>);

      form.arrayRemove('cube.0', 1);

      const state = form.getState();
      expect(state.errors['cube.0.1.0']).toBe('bad');
      expect(state.touched['cube.0.1.0']).toBe(true);
      expect(state.errors['cube.0.2.0']).toBeUndefined();
      expect(state.errors['cube.1.0.0']).toBe('sibling');
      expect(state.touched['cube.1.0.0']).toBe(true);
    });

    it('innermost level: relocates state from cube.0.0.3 to cube.0.0.2 and leaves sibling middle/outer elements undisturbed', () => {
      const form = createCubeForm();
      form.set('cube.0.0.3' as Path<CubeShape>, 999, { touch: true });
      form.setErrors({ 'cube.0.0.3': 'bad' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.1.0' as Path<CubeShape>, 777, { touch: true });
      form.setErrors({ 'cube.0.1.0': 'sibling-middle' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.1.0.0' as Path<CubeShape>, 555, { touch: true });
      form.setErrors({ 'cube.1.0.0': 'sibling-outer' } as Partial<Record<Path<CubeShape>, string>>);

      form.arrayRemove('cube.0.0', 2);

      const state = form.getState();
      expect(state.errors['cube.0.0.2']).toBe('bad');
      expect(state.touched['cube.0.0.2']).toBe(true);
      expect(state.errors['cube.0.0.3']).toBeUndefined();
      expect(state.errors['cube.0.1.0']).toBe('sibling-middle');
      expect(state.errors['cube.1.0.0']).toBe('sibling-outer');
    });
  });
});
```

- [ ] **Step 2: Run the file, verify the 3 arrayRemove cases pass**

Run: `pnpm exec vitest run packages/core/test/nested-array-ops.test.ts -t arrayRemove`
Expected: 3 passed. If any case fails, STOP — do not proceed or guess a fix. Invoke `superpowers:systematic-debugging` to root-cause the failure in `shiftStateIndices` (`packages/core/src/features/array-ops.ts:56-175`) before touching any code, per the spec's "if a real bug is found" clause. A confirmed bug becomes this task's headline finding; the fix must stay scoped to the actual defect.

- [ ] **Step 3: Add the `arrayMove` describe block (inside the existing `describe('nested-array-ops: cube ...')`, after `arrayRemove`)**

```ts
  describe('arrayMove', () => {
    it('outer level: cube.0->2, cube.1->0, cube.2->1 (move fromIndex 0 to toIndex 2)', () => {
      const form = createCubeForm();
      form.set('cube.0.0.0' as Path<CubeShape>, 9001, { touch: true });
      form.setErrors({ 'cube.0.0.0': 'errA' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.1.0.0' as Path<CubeShape>, 9002, { touch: true });
      form.setErrors({ 'cube.1.0.0': 'errB' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.2.0.0' as Path<CubeShape>, 9003, { touch: true });
      form.setErrors({ 'cube.2.0.0': 'errC' } as Partial<Record<Path<CubeShape>, string>>);

      form.arrayMove('cube', 0, 2);

      const state = form.getState();
      expect(state.errors['cube.2.0.0']).toBe('errA');
      expect(state.values.cube[2][0][0]).toBe(9001);
      expect(state.errors['cube.0.0.0']).toBe('errB');
      expect(state.values.cube[0][0][0]).toBe(9002);
      expect(state.errors['cube.1.0.0']).toBe('errC');
      expect(state.values.cube[1][0][0]).toBe(9003);
    });

    it('middle level: cube.0.0->2, cube.0.1->0, cube.0.2->1, sibling outer cube.1 undisturbed', () => {
      const form = createCubeForm();
      form.set('cube.0.0.0' as Path<CubeShape>, 9001, { touch: true });
      form.setErrors({ 'cube.0.0.0': 'errA' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.1.0' as Path<CubeShape>, 9002, { touch: true });
      form.setErrors({ 'cube.0.1.0': 'errB' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.2.0' as Path<CubeShape>, 9003, { touch: true });
      form.setErrors({ 'cube.0.2.0': 'errC' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.1.0.0' as Path<CubeShape>, 9004, { touch: true });
      form.setErrors({ 'cube.1.0.0': 'errD' } as Partial<Record<Path<CubeShape>, string>>);

      form.arrayMove('cube.0', 0, 2);

      const state = form.getState();
      expect(state.errors['cube.0.2.0']).toBe('errA');
      expect(state.errors['cube.0.0.0']).toBe('errB');
      expect(state.errors['cube.0.1.0']).toBe('errC');
      expect(state.errors['cube.1.0.0']).toBe('errD');
    });

    it('innermost level: cube.0.0.0->3, .1->0, .2->1, .3->2, sibling middle/outer undisturbed', () => {
      const form = createCubeForm();
      form.set('cube.0.0.0' as Path<CubeShape>, 9001, { touch: true });
      form.setErrors({ 'cube.0.0.0': 'errA' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.0.1' as Path<CubeShape>, 9002, { touch: true });
      form.setErrors({ 'cube.0.0.1': 'errB' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.0.2' as Path<CubeShape>, 9003, { touch: true });
      form.setErrors({ 'cube.0.0.2': 'errC' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.0.3' as Path<CubeShape>, 9004, { touch: true });
      form.setErrors({ 'cube.0.0.3': 'errD' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.1.0' as Path<CubeShape>, 9005, { touch: true });
      form.setErrors({ 'cube.0.1.0': 'errE' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.1.0.0' as Path<CubeShape>, 9006, { touch: true });
      form.setErrors({ 'cube.1.0.0': 'errF' } as Partial<Record<Path<CubeShape>, string>>);

      form.arrayMove('cube.0.0', 0, 3);

      const state = form.getState();
      expect(state.errors['cube.0.0.3']).toBe('errA');
      expect(state.errors['cube.0.0.0']).toBe('errB');
      expect(state.errors['cube.0.0.1']).toBe('errC');
      expect(state.errors['cube.0.0.2']).toBe('errD');
      expect(state.errors['cube.0.1.0']).toBe('errE');
      expect(state.errors['cube.1.0.0']).toBe('errF');
    });
  });
```

- [ ] **Step 4: Run, verify the 3 arrayMove cases pass**

Run: `pnpm exec vitest run packages/core/test/nested-array-ops.test.ts -t arrayMove`
Expected: 3 passed. Same escalation rule as Step 2 on failure.

- [ ] **Step 5: Add the `arraySwap` describe block (after `arrayMove`)**

```ts
  describe('arraySwap', () => {
    it('outer level: swaps cube.0 and cube.1, leaves cube.2 untouched', () => {
      const form = createCubeForm();
      form.set('cube.0.0.0' as Path<CubeShape>, 9001, { touch: true });
      form.setErrors({ 'cube.0.0.0': 'errA' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.1.0.0' as Path<CubeShape>, 9002, { touch: true });
      form.setErrors({ 'cube.1.0.0': 'errB' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.2.0.0' as Path<CubeShape>, 9003, { touch: true });
      form.setErrors({ 'cube.2.0.0': 'errC' } as Partial<Record<Path<CubeShape>, string>>);

      form.arraySwap('cube', 0, 1);

      const state = form.getState();
      expect(state.errors['cube.0.0.0']).toBe('errB');
      expect(state.errors['cube.1.0.0']).toBe('errA');
      expect(state.errors['cube.2.0.0']).toBe('errC');
    });

    it('middle level: swaps cube.0.0 and cube.0.2, leaves cube.0.1 and cube.1 untouched', () => {
      const form = createCubeForm();
      form.set('cube.0.0.0' as Path<CubeShape>, 9001, { touch: true });
      form.setErrors({ 'cube.0.0.0': 'errA' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.2.0' as Path<CubeShape>, 9002, { touch: true });
      form.setErrors({ 'cube.0.2.0': 'errB' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.1.0' as Path<CubeShape>, 9003, { touch: true });
      form.setErrors({ 'cube.0.1.0': 'errC' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.1.0.0' as Path<CubeShape>, 9004, { touch: true });
      form.setErrors({ 'cube.1.0.0': 'errD' } as Partial<Record<Path<CubeShape>, string>>);

      form.arraySwap('cube.0', 0, 2);

      const state = form.getState();
      expect(state.errors['cube.0.0.0']).toBe('errB');
      expect(state.errors['cube.0.2.0']).toBe('errA');
      expect(state.errors['cube.0.1.0']).toBe('errC');
      expect(state.errors['cube.1.0.0']).toBe('errD');
    });

    it('innermost level: swaps cube.0.0.0 and cube.0.0.3, leaves cube.0.0.1, cube.0.1.0, cube.1.0.0 untouched', () => {
      const form = createCubeForm();
      form.set('cube.0.0.0' as Path<CubeShape>, 9001, { touch: true });
      form.setErrors({ 'cube.0.0.0': 'errA' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.0.3' as Path<CubeShape>, 9002, { touch: true });
      form.setErrors({ 'cube.0.0.3': 'errB' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.0.1' as Path<CubeShape>, 9003, { touch: true });
      form.setErrors({ 'cube.0.0.1': 'errC' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.1.0' as Path<CubeShape>, 9004, { touch: true });
      form.setErrors({ 'cube.0.1.0': 'errD' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.1.0.0' as Path<CubeShape>, 9005, { touch: true });
      form.setErrors({ 'cube.1.0.0': 'errE' } as Partial<Record<Path<CubeShape>, string>>);

      form.arraySwap('cube.0.0', 0, 3);

      const state = form.getState();
      expect(state.errors['cube.0.0.0']).toBe('errB');
      expect(state.errors['cube.0.0.3']).toBe('errA');
      expect(state.errors['cube.0.0.1']).toBe('errC');
      expect(state.errors['cube.0.1.0']).toBe('errD');
      expect(state.errors['cube.1.0.0']).toBe('errE');
    });
  });
```

- [ ] **Step 6: Run, verify the 3 arraySwap cases pass**

Run: `pnpm exec vitest run packages/core/test/nested-array-ops.test.ts -t arraySwap`
Expected: 3 passed. Same escalation rule as Step 2 on failure.

- [ ] **Step 7: Add the `arrayInsert` describe block (after `arraySwap`, closing the outer cube `describe`)**

```ts
  describe('arrayInsert', () => {
    it('outer level: inserting at index 1 shifts cube.1->2, cube.2->3, leaves cube.0 untouched, new slot has no prior state', () => {
      const form = createCubeForm();
      form.set('cube.0.0.0' as Path<CubeShape>, 9001, { touch: true });
      form.setErrors({ 'cube.0.0.0': 'errA' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.1.0.0' as Path<CubeShape>, 9002, { touch: true });
      form.setErrors({ 'cube.1.0.0': 'errB' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.2.0.0' as Path<CubeShape>, 9003, { touch: true });
      form.setErrors({ 'cube.2.0.0': 'errC' } as Partial<Record<Path<CubeShape>, string>>);
      const newMiddle = Array.from({ length: 3 }, (_, j) =>
        Array.from({ length: 4 }, (_, k) => 9000 + j * 10 + k)
      );

      form.arrayInsert('cube', 1, newMiddle);

      const state = form.getState();
      expect(state.errors['cube.0.0.0']).toBe('errA');
      expect(state.errors['cube.2.0.0']).toBe('errB');
      expect(state.errors['cube.3.0.0']).toBe('errC');
      expect(state.errors['cube.1.0.0']).toBeUndefined();
      expect(state.touched['cube.1.0.0']).toBeUndefined();
      expect(state.values.cube[1][0][0]).toBe(9000);
    });

    it('middle level: inserting at index 1 shifts cube.0.1->2, cube.0.2->3, leaves cube.0.0 and cube.1 untouched', () => {
      const form = createCubeForm();
      form.set('cube.0.0.0' as Path<CubeShape>, 9001, { touch: true });
      form.setErrors({ 'cube.0.0.0': 'errA' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.1.0' as Path<CubeShape>, 9002, { touch: true });
      form.setErrors({ 'cube.0.1.0': 'errB' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.2.0' as Path<CubeShape>, 9003, { touch: true });
      form.setErrors({ 'cube.0.2.0': 'errC' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.1.0.0' as Path<CubeShape>, 9004, { touch: true });
      form.setErrors({ 'cube.1.0.0': 'errD' } as Partial<Record<Path<CubeShape>, string>>);
      const newInner = Array.from({ length: 4 }, (_, k) => 9500 + k);

      form.arrayInsert('cube.0', 1, newInner);

      const state = form.getState();
      expect(state.errors['cube.0.0.0']).toBe('errA');
      expect(state.errors['cube.0.2.0']).toBe('errB');
      expect(state.errors['cube.0.3.0']).toBe('errC');
      expect(state.errors['cube.1.0.0']).toBe('errD');
      expect(state.errors['cube.0.1.0']).toBeUndefined();
      expect(state.values.cube[0][1][0]).toBe(9500);
    });

    it('innermost level: inserting at index 1 shifts cube.0.0.1->2, .2->3, .3->4, leaves cube.0.0.0, cube.0.1.0, cube.1.0.0 untouched', () => {
      const form = createCubeForm();
      form.set('cube.0.0.0' as Path<CubeShape>, 9001, { touch: true });
      form.setErrors({ 'cube.0.0.0': 'errA' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.0.1' as Path<CubeShape>, 9002, { touch: true });
      form.setErrors({ 'cube.0.0.1': 'errB' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.0.2' as Path<CubeShape>, 9003, { touch: true });
      form.setErrors({ 'cube.0.0.2': 'errC' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.0.3' as Path<CubeShape>, 9004, { touch: true });
      form.setErrors({ 'cube.0.0.3': 'errD' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.1.0' as Path<CubeShape>, 9005, { touch: true });
      form.setErrors({ 'cube.0.1.0': 'errE' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.1.0.0' as Path<CubeShape>, 9006, { touch: true });
      form.setErrors({ 'cube.1.0.0': 'errF' } as Partial<Record<Path<CubeShape>, string>>);

      form.arrayInsert('cube.0.0', 1, 9999);

      const state = form.getState();
      expect(state.errors['cube.0.0.0']).toBe('errA');
      expect(state.errors['cube.0.0.2']).toBe('errB');
      expect(state.errors['cube.0.0.3']).toBe('errC');
      expect(state.errors['cube.0.0.4']).toBe('errD');
      expect(state.errors['cube.0.1.0']).toBe('errE');
      expect(state.errors['cube.1.0.0']).toBe('errF');
      expect(state.errors['cube.0.0.1']).toBeUndefined();
      expect(state.values.cube[0][0][1]).toBe(9999);
    });
  });
});
```

- [ ] **Step 8: Run the whole cube describe block, verify all 12 cases pass**

Run: `pnpm exec vitest run packages/core/test/nested-array-ops.test.ts -t "nested-array-ops: cube"`
Expected: 12 passed, pristine output apart from the pre-existing, always-present `.npmrc`/`${NPM_TOKEN}` env warning (unrelated to this work — do not treat it as a finding). Same escalation rule as Step 2 on failure — if fixing a real bug, re-run this same command after the fix to confirm, then also run `pnpm exec vitest run packages/core/test/` (the full package suite) to confirm no regression in the existing single-level array tests before continuing.

- [ ] **Step 9: Commit**

```bash
git add packages/core/test/nested-array-ops.test.ts
git commit -m "test(core): verify array-op state relocation for raw array-of-arrays nesting

Adds 12 correctness cases (arrayRemove/arrayMove/arraySwap/arrayInsert x
outer/middle/inner) for a 3-level-deep number[][][] shape, closing a real
gap: no existing test exercised a path with more than one array segment."
```

---

### Task 2: Groups-shape correctness tests (object-wrapped array nesting)

**Files:**
- Modify: `packages/core/test/nested-array-ops.test.ts` (append a sibling top-level `describe` block after the cube block Task 1 added; do not touch the cube block or its imports)

**Interfaces:**
- Consumes: `describe`/`expect`/`it`/`createForm`/`Path` already imported by Task 1 at the top of the file — do not re-import.
- Produces: nothing consumed elsewhere; this is the last content added to `nested-array-ops.test.ts`.

Same non-TDD framing as Task 1: these are correctness-verification cases for existing behavior.

- [ ] **Step 1: Append shared groups setup and the `arrayRemove` describe block**

Add after the closing `});` of the cube `describe('nested-array-ops: cube ...')` block:

```ts
type GroupsShape = {
  groups: { items: { notes: string[] }[] }[];
};

function makeGroups(): GroupsShape['groups'] {
  return Array.from({ length: 3 }, (_, g) => ({
    items: Array.from({ length: 3 }, (_, i) => ({
      notes: Array.from({ length: 4 }, (_, n) => `g${g}-i${i}-n${n}`),
    })),
  }));
}

function createGroupsForm() {
  return createForm<GroupsShape>({ initialValues: { groups: makeGroups() } });
}

describe('nested-array-ops: groups (object-wrapped array nesting)', () => {
  describe('arrayRemove', () => {
    it('outer level: relocates state from groups.1.items.0.notes.0 to groups.0.items.0.notes.0', () => {
      const form = createGroupsForm();
      form.set('groups.1.items.0.notes.0', 'X', { touch: true });
      form.setErrors({ 'groups.1.items.0.notes.0': 'bad' });

      form.arrayRemove('groups', 0);

      const state = form.getState();
      expect(state.errors['groups.0.items.0.notes.0']).toBe('bad');
      expect(state.touched['groups.0.items.0.notes.0']).toBe(true);
      expect(state.dirty['groups.0.items.0.notes.0']).toBe(true);
      expect(state.errors['groups.1.items.0.notes.0']).toBeUndefined();
    });

    it('middle level: relocates state from groups.0.items.2.notes.0 to groups.0.items.1.notes.0, leaves sibling group groups.1 undisturbed', () => {
      const form = createGroupsForm();
      form.set('groups.0.items.2.notes.0', 'X', { touch: true });
      form.setErrors({ 'groups.0.items.2.notes.0': 'bad' });
      form.set('groups.1.items.0.notes.0', 'Y', { touch: true });
      form.setErrors({ 'groups.1.items.0.notes.0': 'sibling' });

      form.arrayRemove('groups.0.items', 1);

      const state = form.getState();
      expect(state.errors['groups.0.items.1.notes.0']).toBe('bad');
      expect(state.errors['groups.0.items.2.notes.0']).toBeUndefined();
      expect(state.errors['groups.1.items.0.notes.0']).toBe('sibling');
    });

    it('innermost level: relocates state from groups.0.items.1.notes.3 to groups.0.items.1.notes.2, leaves sibling item and sibling group undisturbed', () => {
      const form = createGroupsForm();
      form.set('groups.0.items.1.notes.3', 'X', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.3': 'bad' });
      form.set('groups.0.items.0.notes.0', 'Y', { touch: true });
      form.setErrors({ 'groups.0.items.0.notes.0': 'sibling-item' });
      form.set('groups.1.items.0.notes.0', 'Z', { touch: true });
      form.setErrors({ 'groups.1.items.0.notes.0': 'sibling-group' });

      form.arrayRemove('groups.0.items.1.notes', 2);

      const state = form.getState();
      expect(state.errors['groups.0.items.1.notes.2']).toBe('bad');
      expect(state.errors['groups.0.items.1.notes.3']).toBeUndefined();
      expect(state.errors['groups.0.items.0.notes.0']).toBe('sibling-item');
      expect(state.errors['groups.1.items.0.notes.0']).toBe('sibling-group');
    });
  });
});
```

- [ ] **Step 2: Run, verify the 3 arrayRemove cases pass**

Run: `pnpm exec vitest run packages/core/test/nested-array-ops.test.ts -t "nested-array-ops: groups"`
Expected: 3 passed. Same escalation rule as Task 1 Step 2 on failure.

- [ ] **Step 3: Add the `arrayMove` describe block (inside the groups describe, after `arrayRemove`)**

```ts
  describe('arrayMove', () => {
    it('outer level: groups.0->2, groups.1->0, groups.2->1', () => {
      const form = createGroupsForm();
      form.set('groups.0.items.0.notes.0', 'A', { touch: true });
      form.setErrors({ 'groups.0.items.0.notes.0': 'errA' });
      form.set('groups.1.items.0.notes.0', 'B', { touch: true });
      form.setErrors({ 'groups.1.items.0.notes.0': 'errB' });
      form.set('groups.2.items.0.notes.0', 'C', { touch: true });
      form.setErrors({ 'groups.2.items.0.notes.0': 'errC' });

      form.arrayMove('groups', 0, 2);

      const state = form.getState();
      expect(state.errors['groups.2.items.0.notes.0']).toBe('errA');
      expect(state.errors['groups.0.items.0.notes.0']).toBe('errB');
      expect(state.errors['groups.1.items.0.notes.0']).toBe('errC');
    });

    it('middle level: groups.0.items.0->2, .1->0, .2->1, sibling group groups.1 undisturbed', () => {
      const form = createGroupsForm();
      form.set('groups.0.items.0.notes.0', 'A', { touch: true });
      form.setErrors({ 'groups.0.items.0.notes.0': 'errA' });
      form.set('groups.0.items.1.notes.0', 'B', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.0': 'errB' });
      form.set('groups.0.items.2.notes.0', 'C', { touch: true });
      form.setErrors({ 'groups.0.items.2.notes.0': 'errC' });
      form.set('groups.1.items.0.notes.0', 'D', { touch: true });
      form.setErrors({ 'groups.1.items.0.notes.0': 'errD' });

      form.arrayMove('groups.0.items', 0, 2);

      const state = form.getState();
      expect(state.errors['groups.0.items.2.notes.0']).toBe('errA');
      expect(state.errors['groups.0.items.0.notes.0']).toBe('errB');
      expect(state.errors['groups.0.items.1.notes.0']).toBe('errC');
      expect(state.errors['groups.1.items.0.notes.0']).toBe('errD');
    });

    it('innermost level: groups.0.items.1.notes.0->3, .1->0, .2->1, .3->2, sibling item and sibling group undisturbed', () => {
      const form = createGroupsForm();
      form.set('groups.0.items.1.notes.0', 'A', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.0': 'errA' });
      form.set('groups.0.items.1.notes.1', 'B', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.1': 'errB' });
      form.set('groups.0.items.1.notes.2', 'C', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.2': 'errC' });
      form.set('groups.0.items.1.notes.3', 'D', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.3': 'errD' });
      form.set('groups.0.items.0.notes.0', 'E', { touch: true });
      form.setErrors({ 'groups.0.items.0.notes.0': 'errE' });
      form.set('groups.1.items.0.notes.0', 'F', { touch: true });
      form.setErrors({ 'groups.1.items.0.notes.0': 'errF' });

      form.arrayMove('groups.0.items.1.notes', 0, 3);

      const state = form.getState();
      expect(state.errors['groups.0.items.1.notes.3']).toBe('errA');
      expect(state.errors['groups.0.items.1.notes.0']).toBe('errB');
      expect(state.errors['groups.0.items.1.notes.1']).toBe('errC');
      expect(state.errors['groups.0.items.1.notes.2']).toBe('errD');
      expect(state.errors['groups.0.items.0.notes.0']).toBe('errE');
      expect(state.errors['groups.1.items.0.notes.0']).toBe('errF');
    });
  });
```

- [ ] **Step 4: Run, verify the 3 arrayMove cases pass**

Run: `pnpm exec vitest run packages/core/test/nested-array-ops.test.ts -t "nested-array-ops: groups.*arrayMove"`
Expected: 3 passed. Same escalation rule as Task 1 Step 2 on failure.

- [ ] **Step 5: Add the `arraySwap` describe block (after `arrayMove`)**

```ts
  describe('arraySwap', () => {
    it('outer level: swaps groups.0 and groups.1, leaves groups.2 untouched', () => {
      const form = createGroupsForm();
      form.set('groups.0.items.0.notes.0', 'A', { touch: true });
      form.setErrors({ 'groups.0.items.0.notes.0': 'errA' });
      form.set('groups.1.items.0.notes.0', 'B', { touch: true });
      form.setErrors({ 'groups.1.items.0.notes.0': 'errB' });
      form.set('groups.2.items.0.notes.0', 'C', { touch: true });
      form.setErrors({ 'groups.2.items.0.notes.0': 'errC' });

      form.arraySwap('groups', 0, 1);

      const state = form.getState();
      expect(state.errors['groups.0.items.0.notes.0']).toBe('errB');
      expect(state.errors['groups.1.items.0.notes.0']).toBe('errA');
      expect(state.errors['groups.2.items.0.notes.0']).toBe('errC');
    });

    it('middle level: swaps groups.0.items.0 and groups.0.items.2, leaves groups.0.items.1 and groups.1 untouched', () => {
      const form = createGroupsForm();
      form.set('groups.0.items.0.notes.0', 'A', { touch: true });
      form.setErrors({ 'groups.0.items.0.notes.0': 'errA' });
      form.set('groups.0.items.2.notes.0', 'B', { touch: true });
      form.setErrors({ 'groups.0.items.2.notes.0': 'errB' });
      form.set('groups.0.items.1.notes.0', 'C', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.0': 'errC' });
      form.set('groups.1.items.0.notes.0', 'D', { touch: true });
      form.setErrors({ 'groups.1.items.0.notes.0': 'errD' });

      form.arraySwap('groups.0.items', 0, 2);

      const state = form.getState();
      expect(state.errors['groups.0.items.0.notes.0']).toBe('errB');
      expect(state.errors['groups.0.items.2.notes.0']).toBe('errA');
      expect(state.errors['groups.0.items.1.notes.0']).toBe('errC');
      expect(state.errors['groups.1.items.0.notes.0']).toBe('errD');
    });

    it('innermost level: swaps groups.0.items.1.notes.0 and .3, leaves .1, sibling item, sibling group untouched', () => {
      const form = createGroupsForm();
      form.set('groups.0.items.1.notes.0', 'A', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.0': 'errA' });
      form.set('groups.0.items.1.notes.3', 'B', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.3': 'errB' });
      form.set('groups.0.items.1.notes.1', 'C', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.1': 'errC' });
      form.set('groups.0.items.0.notes.0', 'D', { touch: true });
      form.setErrors({ 'groups.0.items.0.notes.0': 'errD' });
      form.set('groups.1.items.0.notes.0', 'E', { touch: true });
      form.setErrors({ 'groups.1.items.0.notes.0': 'errE' });

      form.arraySwap('groups.0.items.1.notes', 0, 3);

      const state = form.getState();
      expect(state.errors['groups.0.items.1.notes.0']).toBe('errB');
      expect(state.errors['groups.0.items.1.notes.3']).toBe('errA');
      expect(state.errors['groups.0.items.1.notes.1']).toBe('errC');
      expect(state.errors['groups.0.items.0.notes.0']).toBe('errD');
      expect(state.errors['groups.1.items.0.notes.0']).toBe('errE');
    });
  });
```

- [ ] **Step 6: Run, verify the 3 arraySwap cases pass**

Run: `pnpm exec vitest run packages/core/test/nested-array-ops.test.ts -t "nested-array-ops: groups.*arraySwap"`
Expected: 3 passed. Same escalation rule as Task 1 Step 2 on failure.

- [ ] **Step 7: Add the `arrayInsert` describe block (after `arraySwap`, closing the groups `describe`)**

```ts
  describe('arrayInsert', () => {
    it('outer level: inserting at index 1 shifts groups.1->2, groups.2->3, leaves groups.0 untouched, new slot has no prior state', () => {
      const form = createGroupsForm();
      form.set('groups.0.items.0.notes.0', 'A', { touch: true });
      form.setErrors({ 'groups.0.items.0.notes.0': 'errA' });
      form.set('groups.1.items.0.notes.0', 'B', { touch: true });
      form.setErrors({ 'groups.1.items.0.notes.0': 'errB' });
      form.set('groups.2.items.0.notes.0', 'C', { touch: true });
      form.setErrors({ 'groups.2.items.0.notes.0': 'errC' });
      const newGroup: GroupsShape['groups'][number] = {
        items: Array.from({ length: 3 }, () => ({ notes: ['n0', 'n1', 'n2', 'n3'] })),
      };

      form.arrayInsert('groups', 1, newGroup);

      const state = form.getState();
      expect(state.errors['groups.0.items.0.notes.0']).toBe('errA');
      expect(state.errors['groups.2.items.0.notes.0']).toBe('errB');
      expect(state.errors['groups.3.items.0.notes.0']).toBe('errC');
      expect(state.errors['groups.1.items.0.notes.0']).toBeUndefined();
      expect(state.values.groups[1].items[0].notes[0]).toBe('n0');
    });

    it('middle level: inserting at index 1 shifts groups.0.items.1->2, .2->3, leaves groups.0.items.0 and groups.1 untouched', () => {
      const form = createGroupsForm();
      form.set('groups.0.items.0.notes.0', 'A', { touch: true });
      form.setErrors({ 'groups.0.items.0.notes.0': 'errA' });
      form.set('groups.0.items.1.notes.0', 'B', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.0': 'errB' });
      form.set('groups.0.items.2.notes.0', 'C', { touch: true });
      form.setErrors({ 'groups.0.items.2.notes.0': 'errC' });
      form.set('groups.1.items.0.notes.0', 'D', { touch: true });
      form.setErrors({ 'groups.1.items.0.notes.0': 'errD' });
      const newItem: GroupsShape['groups'][number]['items'][number] = { notes: ['a', 'b', 'c', 'd'] };

      form.arrayInsert('groups.0.items', 1, newItem);

      const state = form.getState();
      expect(state.errors['groups.0.items.0.notes.0']).toBe('errA');
      expect(state.errors['groups.0.items.2.notes.0']).toBe('errB');
      expect(state.errors['groups.0.items.3.notes.0']).toBe('errC');
      expect(state.errors['groups.1.items.0.notes.0']).toBe('errD');
      expect(state.errors['groups.0.items.1.notes.0']).toBeUndefined();
      expect(state.values.groups[0].items[1].notes[0]).toBe('a');
    });

    it('innermost level: inserting at index 1 shifts groups.0.items.1.notes.1->2, .2->3, .3->4, leaves .0, sibling item, sibling group untouched', () => {
      const form = createGroupsForm();
      form.set('groups.0.items.1.notes.0', 'A', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.0': 'errA' });
      form.set('groups.0.items.1.notes.1', 'B', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.1': 'errB' });
      form.set('groups.0.items.1.notes.2', 'C', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.2': 'errC' });
      form.set('groups.0.items.1.notes.3', 'D', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.3': 'errD' });
      form.set('groups.0.items.0.notes.0', 'E', { touch: true });
      form.setErrors({ 'groups.0.items.0.notes.0': 'errE' });
      form.set('groups.1.items.0.notes.0', 'F', { touch: true });
      form.setErrors({ 'groups.1.items.0.notes.0': 'errF' });

      form.arrayInsert('groups.0.items.1.notes', 1, 'NEW');

      const state = form.getState();
      expect(state.errors['groups.0.items.1.notes.0']).toBe('errA');
      expect(state.errors['groups.0.items.1.notes.2']).toBe('errB');
      expect(state.errors['groups.0.items.1.notes.3']).toBe('errC');
      expect(state.errors['groups.0.items.1.notes.4']).toBe('errD');
      expect(state.errors['groups.0.items.0.notes.0']).toBe('errE');
      expect(state.errors['groups.1.items.0.notes.0']).toBe('errF');
      expect(state.errors['groups.0.items.1.notes.1']).toBeUndefined();
      expect(state.values.groups[0].items[1].notes[1]).toBe('NEW');
    });
  });
});
```

- [ ] **Step 8: Run the whole groups describe block, verify all 12 cases pass**

Run: `pnpm exec vitest run packages/core/test/nested-array-ops.test.ts -t "nested-array-ops: groups"`
Expected: 12 passed, pristine output apart from the pre-existing `.npmrc`/`${NPM_TOKEN}` env warning. Same escalation rule as Step 2 on failure.

- [ ] **Step 9: Run the full new file (24 cases) and the full core package suite**

Run: `pnpm exec vitest run packages/core/test/nested-array-ops.test.ts`
Expected: 24 passed.

Run: `pnpm exec vitest run packages/core/test/`
Expected: all existing tests still pass — confirms no regression to the existing single-level array tests, whether or not a bug was found and fixed in this task or Task 1.

- [ ] **Step 10: Commit**

```bash
git add packages/core/test/nested-array-ops.test.ts
git commit -m "test(core): verify array-op state relocation for object-wrapped array nesting

Adds 12 correctness cases (arrayRemove/arrayMove/arraySwap/arrayInsert x
outer/middle/inner) for a 3-level-deep { items: { notes: string[] }[] }[]
shape, completing the 24-case matrix (2 shapes x 4 ops x 3 levels) this
item's spec calls for. Full packages/core/test/ suite confirmed green."
```

---

### Task 3: Phase 2 scale benchmark (gated on Task 1 + Task 2 passing clean)

**Files:**
- Create: `bench/fixtures/nested-array.ts`
- Create: `bench/suites/core/array-ops-nested-scale.bench.ts`

**Interfaces:**
- Consumes: `FormFixture` from `bench/adapters/interface.js`, `createAdapter` from `bench/adapters/neutro.js` (both pre-existing, used unchanged) — mirrors the exact pattern `bench/fixtures/large-array.ts` / `bench/suites/core/array-ops-scale.bench.ts` already establish for item 1's flat-array scale benchmark.
- Produces: `nestedArrayFixture`, consumed only by `array-ops-nested-scale.bench.ts` in this same task.

Only start this task once Task 1 and Task 2 are both committed and green. If either task found and fixed a real bug, this task still proceeds — the mechanism is now proven correct at 500-leaf-path scale is the point being measured, independent of what fixed it.

- [ ] **Step 1: Create the nested-array fixture**

```ts
import type { FormFixture } from '../adapters/interface.js'

function makeGroups() {
  return Array.from({ length: 50 }, (_, g) => ({
    items: Array.from({ length: 10 }, (_, i) => ({ notes: [`note-${g}-${i}`] })),
  }))
}

export const nestedArrayFixture: FormFixture = {
  initialValues: { groups: makeGroups() },
}
```

This produces 50 groups x 10 items x 1 note = 500 leaf `groups.N.items.M.notes.0` paths, matching item 1's ~500-field scale for a fair before/after comparison against the existing flat-array `array-ops-scale` numbers. `notes` intentionally holds exactly 1 element per leaf — it is not itself a meaningful scale-mutation target (Phase 1 already proved 3-level correctness exhaustively; this fixture only needs 2 meaningful array levels — `groups` and `items` — to measure shift cost at outer vs. inner nesting).

- [ ] **Step 2: Create the nested scale benchmark suite**

```ts
import { bench, describe } from 'vitest'
import { createAdapter as neutroAdapter } from '../../adapters/neutro.js'
import { nestedArrayFixture } from '../../fixtures/nested-array.js'

function wireLeafSubscribers(adapter: ReturnType<typeof neutroAdapter>, groupCount: number, itemCount: number) {
  const unsubscribes: Array<() => void> = []
  for (let g = 0; g < groupCount; g++) {
    for (let i = 0; i < itemCount; i++) {
      unsubscribes.push(adapter.subscribeToPath(`groups.${g}.items.${i}.notes.0`, () => {}))
    }
  }
  return () => unsubscribes.forEach((fn) => fn())
}

// Each describe block instantiates ONE form outside the timed callback, mirroring
// array-ops-scale.bench.ts's isolation discipline: the timed callback only ever
// measures the shift itself, not form/subscriber construction.
describe('array-ops-nested/remove-outer', () => {
  const a = neutroAdapter(nestedArrayFixture)
  wireLeafSubscribers(a, 50, 10)
  const group = a.get('groups.0')
  // Worst case at the outer level: removing outer index 0 shifts all 49 remaining
  // groups, each carrying 10 nested items -- 490 leaf paths must re-index.
  bench('neutro/form', () => {
    a.arrayRemove('groups', 0)
    a.arrayInsert!('groups', 0, group)
  })
})

describe('array-ops-nested/remove-inner', () => {
  const a = neutroAdapter(nestedArrayFixture)
  wireLeafSubscribers(a, 50, 10)
  const item = a.get('groups.0.items.0')
  // Removing an inner index shifts only the 9 remaining items within group 0 --
  // isolates the cost of a shift confined to one outer element's sub-array.
  bench('neutro/form', () => {
    a.arrayRemove('groups.0.items', 0)
    a.arrayInsert!('groups.0.items', 0, item)
  })
})

describe('array-ops-nested/move-outer', () => {
  const a = neutroAdapter(nestedArrayFixture)
  wireLeafSubscribers(a, 50, 10)
  bench('neutro/form', () => {
    a.arrayMove('groups', 0, 49)
  })
})

describe('array-ops-nested/move-inner', () => {
  const a = neutroAdapter(nestedArrayFixture)
  wireLeafSubscribers(a, 50, 10)
  bench('neutro/form', () => {
    a.arrayMove('groups.0.items', 0, 9)
  })
})
```

- [ ] **Step 3: Run the sample bench pass and confirm all 4 blocks execute cleanly**

`bench:core:sample` (`vitest bench suites/core --reporter=./reporters/json-bench.ts`) does not accept a trailing filter argument — verified during plan-writing that `pnpm run bench:core:sample -- array-ops-scale` silently ignores the filter and runs the entire `suites/core` directory. Invoke `vitest bench` directly with the file path instead, which does filter correctly:

Run: `pnpm --dir bench exec vitest bench suites/core/array-ops-nested-scale.bench.ts`
Expected: all 4 `array-ops-nested/*` blocks report real timings with no errors.

- [ ] **Step 4: Compare against the existing flat-array numbers**

Run: `pnpm --dir bench exec vitest bench suites/core/array-ops-scale.bench.ts`

**Round-1-review correction:** `array-ops-scale.bench.ts` only benchmarks `arrayRemove` at scale (`remove-start`/`remove-end`/`remove-start-with-unrelated-fields`) — there is no scale-matched `arrayMove` baseline anywhere in the codebase (`array-ops.bench.ts`'s `array-ops/move` block moves a 20-item array, not ~500-scale). Compare only `remove-outer` against `remove-start` (matching worst-case shift sizes at matched ~500-leaf-path scale) — this comparison is meaningful. `move-outer`/`move-inner` have no prior baseline to compare against; treat their numbers as new baselines, not a before/after comparison. If you want a rough sanity check on the move numbers, `array-ops/move` in `array-ops.bench.ts` gives an order-of-magnitude reference at a much smaller (20-item, single-level) scale — note explicitly in your report that it is not scale-matched, don't present it as equivalent. If the `remove-outer` vs `remove-start` numbers are within the same order of magnitude, no further action is needed — this is the expected outcome and matches the "no docs/benchmarks page changes" default from the Global Constraints. If any of the four numbers are surprising (e.g. more than roughly an order of magnitude worse than what a linear-in-shifted-leaf-count model would predict), STOP and report the specific numbers to the user before deciding whether a `docs/benchmarks/index.md` mention is warranted — do not add one unilaterally.

- [ ] **Step 5: Commit**

```bash
git add bench/fixtures/nested-array.ts bench/suites/core/array-ops-nested-scale.bench.ts
git commit -m "bench(core): add nested-array scale benchmark for remove/move at outer and inner levels

Mirrors item 1's array-ops-scale pattern at a matched ~500-leaf-path scale
(50 groups x 10 items), now that Phase 1 has proven 3-level nested-array
state relocation correct. Core-only, no competitor adapters, per the
established core-bench-is-neutro-only policy."
```

---

### Task 4: Full pipeline verification and release-gate memory update

**Files:**
- None created/modified beyond what Tasks 1-3 already produced (verification only), unless the pipeline surfaces something that needs fixing.

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: nothing consumed by a later task — this is the final task in this plan.

- [ ] **Step 1: Run the root pre-push pipeline**

Run: `pnpm lint && pnpm exec tsc --noEmit && pnpm build && pnpm test`
Expected: all four steps pass. If `pnpm lint` or `biome check --write` modifies any file from Tasks 1-3, `git add` the changed file(s) before the final commit in Step 3 below — per `CLAUDE.md`'s documented gotcha (Biome edits the working tree but does not stage).

- [ ] **Step 2: Run bench's own typecheck separately and disclose (don't silently skip) any pre-existing unrelated failures**

Run: `pnpm --dir bench exec tsc --noEmit`
Expected: no NEW errors attributable to `bench/fixtures/nested-array.ts` or `bench/suites/core/array-ops-nested-scale.bench.ts`. `bench/` is excluded from the root `pnpm lint`/`tsc --noEmit` (separate pnpm-workspace-excluded package), so this step is the only check that covers it — per the disclosed gap in the class-validator benchmark plan (v0.5.0 item 5). If this command reports pre-existing errors unrelated to the two new files, note them in the final report; do not fix them as part of this plan (out of scope) and do not treat them as a blocker for this item.

- [ ] **Step 3: Commit any pipeline-driven fixups**

```bash
git status
```

If `pnpm lint`/`biome check --write` changed anything, stage and commit it:

```bash
git add -A
git commit -m "chore: apply lint fixes from nested-array correctness + scale benchmark work"
```

If nothing changed, skip this step (no empty commit).

- [ ] **Step 4: Update the v0.5.0 release-gate memory**

Update `/Users/kofi/.claude/projects/-Users-kofi---agw-form/memory/project_v050_release_gate.md` to mark item 6 RESOLVED, following the same format used for items 1-5 and 7: spec link (`docs/superpowers/specs/2026-07-12-nested-array-correctness-benchmark-design.md`), plan link (this file), commit range for Tasks 1-4, and the real findings from this item — specifically:
- Whether Phase 1 passed clean (confirming the `pathIndex`-based design is nesting-agnostic by construction) or found and fixed a real bug (and what it was).
- The disclosed, separate `Path<T>` array-of-array typing limitation (past one level, raw arrays don't type-check — confirmed via `tsc`) as a genuine future item, not bundled into this one.
- The Phase 2 scale numbers and whether they matched the flat-array baseline's order of magnitude or triggered the "stop and investigate" clause.

Since this closes the last remaining v0.5.0 release-gate item, also update the memory's summary line to reflect all 7 items now RESOLVED.

- [ ] **Step 5: Do not push**

Per this session's standing instruction, commit all work locally but do not run `git push` under any circumstances without new, explicit authorization.

## Verification

- Phase 1: `pnpm exec vitest run packages/core/test/nested-array-ops.test.ts` — 24 passed, pristine output. `pnpm exec vitest run packages/core/test/` — full suite green (no regression).
- Phase 2: `pnpm --dir bench exec vitest bench suites/core/array-ops-nested-scale.bench.ts` — 4 blocks execute with real timings.
- Full pipeline: `pnpm lint && pnpm exec tsc --noEmit && pnpm build && pnpm test` — all green.
- `pnpm --dir bench exec tsc --noEmit` — no new errors attributable to this item's two new bench files.
