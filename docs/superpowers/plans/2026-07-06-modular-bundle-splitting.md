# Modular Bundle Splitting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `packages/core/src/index.ts` into a shared `engine.ts` core plus four feature modules (`array-ops`, `dom-bridge`, `persistence`, `computed-fields`), and add a new `@neutro/form/core/minimal` entry point that ships only the engine + computed-fields, so consumers who never touch dynamic arrays, DOM auto-binding, or persistence get a smaller bundle — with zero behavior change for existing full-package consumers.

**Architecture:** A single mutable `ctx: FormEngineContext<T>` object replaces `createForm`'s closure-captured variables. `engine.ts` exports `createCoreForm<T>(config)` returning `{ ctx, instance }`. Each feature module exports `attachX<T>(ctx): XMethods<T>`, mutating `ctx` in place (adding methods/overriding hook defaults) and returning the methods to `Object.assign` onto `instance`. `src/index.ts` (full) composes all four; `src/minimal.ts` composes none. A hard invariant — no `ctx` field is ever reassigned, only cleared-and-repopulated in place — makes this composition safe against stale-reference bugs from feature functions that destructure `ctx` at setup time.

**Tech Stack:** TypeScript (NodeNext modules, `.js` import extensions), Vitest, tsup, Biome, pnpm workspaces.

## Global Constraints

- All relative imports under `packages/` use `.js` extensions (NodeNext), even though source is `.ts`.
- Every task must end with `pnpm lint && pnpm exec tsc --noEmit && pnpm build && pnpm test` green before commit (per CLAUDE.md pre-push checklist and this release's established discipline).
- No behavior change for existing full-package consumers, with two explicit, spec-approved exceptions (call out in CHANGELOG, not silently): (a) `getPayload()`/`submit()` now return full `values` instead of `{}` when nothing is connected/persisted; (b) none other.
- `errors`, `touched`, `dirty`, `wasSet`, `values`, `initialValues` on `ctx` must never be reassigned — only cleared-and-repopulated in place. `lastSubmittedValues` is the one deliberate exception (lint/checklist-protected instead).
- `MinimalFormInstance<T>` must be a structural subset such that `FormInstance<T> extends MinimalFormInstance<T>` — switching import paths is a pure widening.
- A `minimal`-tier consumer calling `.arrayRemove()` etc. must fail at **compile time**, not runtime.
- Full spec: `docs/superpowers/specs/2026-07-03-modular-bundle-splitting-api-design.md`. Source audit backing every line number below: produced by an independent full-file grep-and-read pass immediately before this plan was written (see plan history — do not re-trust line numbers without re-grepping if the source file has changed since).

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/engine.ts` (new) | `createCoreForm<T>`: shared state, notify/batch machinery, validation, `setFieldValue`, `reset`/`resetField`/`destroy`/`getState`/`submit`/`handleSubmit`/`setErrors`/`clearErrors`/`watch`/etc. Owns the `FormEngineContext<T>` type and the 4 hook-slot defaults. |
| `packages/core/src/features/array-ops.ts` (new) | `attachArrayOps<T>(ctx)`: `arrayAppend`/`arrayInsert`/`arrayRemove`/`arrayMove`/`arraySwap`, `shiftStateIndices`, `rekeyArrayState`. |
| `packages/core/src/features/dom-bridge.ts` (new) | `attachDomBridge<T>(ctx)`: `connect`/`disconnect`(via cleanup fn)/`focus`/`focusFirstError`/`getAriaProps`/`getConnectedCount`, `initMutationObserver`, module-scope `_getPayload` (with the empty-fallback fix). |
| `packages/core/src/features/persistence.ts` (new) | `attachPersistence<T>(ctx)`: `hydrate`, the `onReset` hook override. |
| `packages/core/src/features/computed-fields.ts` (new) | `attachComputedFields<T>(ctx)`: `computedMap`, `flattenComputedConfig` call, `runComputedPass`, `transientPaths`, the 3 hook overrides. |
| `packages/core/src/index.ts` (rewritten, much smaller) | Full entry point: calls `createCoreForm`, `Object.assign`s all four `attachX` results, returns `FormInstance<T>`. Keeps all existing type exports (`FormConfig`, `FormState`, adapters, utils) — only `createForm`'s body and the feature-cluster code move out. |
| `packages/core/src/minimal.ts` (new) | Minimal entry point: calls `createCoreForm`, `Object.assign`s only `attachComputedFields`, returns `MinimalFormInstance<T>`. |
| `packages/core/test/engine-invariant.test.ts` (new) | Mutation-invariant regression tests (Task 1–3). |
| `packages/core/test/minimal.test.ts` (new) | Minimal-tier behavior + compile-time `@ts-expect-error` tests. |
| `bench/fixtures/bundle/neutro-minimal.ts` (new) | Bundle-size fixture for the new entry point. |

---

### Task 1: In-place mutation conversion — `runValidation`'s `errors`

**Files:**
- Modify: `packages/core/src/index.ts:1372-1572` (`runValidation`), `:1605-1612` (`reindexErrors`)
- Test: `packages/core/test/engine-invariant.test.ts` (new)

**Interfaces:**
- Produces: `applyRecordDiff(target: Record<string, string>, next: Record<string, string>): void` — clears keys in `target` not present in `next`, assigns/updates keys present in `next`, calling `indexKey`/`unindexKey` (closed over from the surrounding closure scope) exactly as `reindexErrors` does today, but mutating `target` in place instead of returning a new object. This helper replaces `reindexErrors` and is used by `runValidation`'s three sites only — Task 2 and Task 3 do NOT reuse it (their sites replace an entire map wholesale via a rename-shift, not a partial diff of an unchanged key set; do not attempt to route them through `applyRecordDiff`).

Today, at lines 1516-1517 (and identically at 1528-1529 and 1533-1536), the pattern is:
```ts
const oldErrors = errors;
errors = combined; // or whatever the new error map is
reindexErrors(oldErrors, errors);
```
where `reindexErrors` (1605-1612) is:
```ts
function reindexErrors(oldErrors: Record<string, string>, newErrors: Record<string, string>): void {
  for (const key of Object.keys(oldErrors)) {
    if (!(key in newErrors)) unindexKey(key);
  }
  for (const key of Object.keys(newErrors)) {
    if (!(key in oldErrors)) indexKey(key);
  }
}
```

- [ ] **Step 1: Write the failing test proving `errors` is never reassigned across `runValidation`**

```ts
// packages/core/test/engine-invariant.test.ts
import { describe, it, expect } from 'vitest';
import { createForm } from '../src/index.js';

describe('mutation invariant: errors', () => {
  it('runValidation never reassigns the errors object identity', async () => {
    // NOTE: the field path must be nested (not a bare top-level key like "name").
    // indexKey/unindexKey (lines 1574-1601) only populate pathIndex for a path's
    // ANCESTOR PREFIXES via a loop starting at segment index 1 — a single-segment
    // path never enters that loop, so indexKey('name') is a no-op and
    // _debugPathIndex().get('name') would always be undefined regardless of this
    // refactor. Use a nested field so indexKey/unindexKey actually exercise pathIndex.
    const form = createForm({
      initialValues: { profile: { name: '' } },
      rules: { 'profile.name': 'required' },
    });
    // Capture the errors object identity via a path subscriber closure trick:
    // subscribe to '*' and grab getState().errors is a copy, so instead we rely on
    // the internal _debugRawState accessor (already exposed) plus a second, independent
    // check: a subscriber added before validation must observe the SAME object if it
    // captured a reference via a custom test hook. Since ctx isn't public yet (Task 6+),
    // this test only asserts the OBSERVABLE contract for now: validation still produces
    // the correct errors content and reindexes pathIndex correctly. A second test,
    // asserting object-identity stability, is added in Task 6 once ctx exists.
    await form.validate();
    expect(form.getState().errors['profile.name']).toBe('Required');
    const idx = form._debugPathIndex();
    expect(idx.get('profile')?.has('profile.name')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it currently passes (behavior baseline, not yet a regression guard)**

Run: `pnpm exec vitest run packages/core/test/engine-invariant.test.ts -t "errors"`
Expected: PASS (this test only pins current observable behavior before refactor; it is not expected to fail pre-refactor since we haven't changed anything yet — this step confirms the test itself is correctly written).

- [ ] **Step 3: Add `applyRecordDiff` and convert `runValidation`'s three sites**

Replace `reindexErrors` (lines 1605-1612) with:
```ts
function applyRecordDiff(
  target: Record<string, string>,
  next: Record<string, string>
): void {
  for (const key of Object.keys(target)) {
    if (!(key in next)) {
      delete target[key];
      unindexKey(key);
    }
  }
  for (const key of Object.keys(next)) {
    if (!(key in target) ) indexKey(key);
    target[key] = next[key];
  }
}
```

At each of the three `runValidation` sites (1516-1517, 1528-1529, 1533-1536), replace the `errors = X; reindexErrors(oldErrors, errors);` pattern with `applyRecordDiff(errors, X);` — e.g. line 1516-1517 becomes:
```ts
applyRecordDiff(errors, combined);
```
(substitute `combined`/whatever local variable held the computed new-errors map at each of the three sites — read the surrounding code at each site to get the exact right-hand-side expression; do not guess, the three branches compute their new-errors value differently: async-validator branch, sync-validator branch, rules-only branch).

- [ ] **Step 4: Run full core test suite**

Run: `pnpm exec vitest run packages/core/test`
Expected: PASS, zero test changes needed elsewhere (per spec's "Full existing suite unmodified" requirement).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/engine-invariant.test.ts
git commit -m "refactor(core): convert runValidation's errors reassignment to in-place mutation"
```

---

### Task 2: In-place mutation conversion — array-ops' `errors`/`touched`/`dirty`/`wasSet`

**Files:**
- Modify: `packages/core/src/index.ts:1728-1849` (`shiftStateIndices`), `:1851-1924` (`rekeyArrayState`), `:2603-2697` (`arraySwap`, whose inline `swapKeys` helper spans `:2622-2657` with its reassignment call sites at `:2658-2661`)
- Test: `packages/core/test/engine-invariant.test.ts`

**Interfaces:**
- These three sites reassign an *entire replacement map* built via a `shiftMap`-style helper, not a partial diff like `runValidation` — do **not** route them through Task 1's `applyRecordDiff` (that helper is `runValidation`-specific; these sites have a different shape). The conversion here is: wherever the code currently does `const updated = { ...stateMap }; /* mutate updated */ ...; stateMap = updated;` for `errors`/`touched`/`dirty`/`wasSet` at lines 1781-1784 (`shiftStateIndices`), 1896-1899 (`rekeyArrayState`), and 2658-2661 (`arraySwap`'s `swapKeys`), replace with mutating `stateMap` (the real `errors`/`touched`/`dirty`/`wasSet` object) directly in place — using the exact same two-pass "compute renames first, then apply" shape already present in `rekeyArrayState`'s `affectedKeys`/`renames` step (per spec's round-5 conversion-hazard note: reading a source key's value AFTER deleting it returns `undefined`, so every rename's `[oldKey, newKey, value]` must be captured before any delete happens).

- [ ] **Step 1: Write failing tests pinning current shift/rekey/swap error-state behavior**

```ts
// append to packages/core/test/engine-invariant.test.ts
describe('mutation invariant: array-ops error/touched/dirty/wasSet shifting', () => {
  it('shiftStateIndices (via arrayRemove) preserves error/touched/dirty state on shifted items', () => {
    const form = createForm({
      initialValues: { items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] },
    });
    form.set('items.0.name', 'a', { touch: true });
    form.setErrors({ 'items.1.name': 'bad' });
    form.arrayRemove('items', 0);
    // item that was at index 1 (errored) is now at index 0
    expect(form.getState().errors['items.0.name']).toBe('bad');
    expect(form.getState().errors['items.1.name']).toBeUndefined();
  });

  it('arraySwap swaps touched/dirty/error state along with values', () => {
    const form = createForm({
      initialValues: { items: [{ name: 'a' }, { name: 'b' }] },
    });
    form.set('items.0.name', 'x', { touch: true });
    form.setErrors({ 'items.0.name': 'bad' });
    form.arraySwap('items', 0, 1);
    expect(form.getState().errors['items.1.name']).toBe('bad');
    expect(form.getState().touched['items.1.name']).toBe(true);
    expect(form.getState().errors['items.0.name']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they pass against current (pre-conversion) code**

Run: `pnpm exec vitest run packages/core/test/engine-invariant.test.ts -t "array-ops"`
Expected: PASS (baseline pin, same rationale as Task 1 Step 2).

- [ ] **Step 3: Convert `shiftStateIndices` (lines 1728-1849)**

Read the current implementation of the four `shiftMap`-based reassignments at 1781-1784. For each of `errors`/`touched`/`dirty`/`wasSet`, the existing code shape (per the audit) is a helper that builds a new map by iterating the old map's keys, computing each key's shifted name, and produces a full replacement object assigned back to the outer `let`. Convert by:
1. Building the list of `[oldKey, newKey, value]` triples first (no mutation yet) — reuse whatever key-shifting logic already exists, just don't write into a fresh object.
2. Deleting every old key that isn't also a new key, calling `unindexKey(oldKey)` for each.
3. Assigning `stateMap[newKey] = value` for every triple, calling `indexKey(newKey)` only for keys that weren't already present.

Apply this identically to `errors`, `touched`, `dirty`, `wasSet` at their respective blocks within 1781-1784.

- [ ] **Step 4: Convert `rekeyArrayState` (lines 1851-1924) the same way**

`rekeyArrayState` already computes its renames via an `affectedKeys`/`renames` two-pass at its current lines — per the audit this function is already closest to the target shape. Adjust its final apply-step (1896-1899) to mutate the real `errors`/`touched`/`dirty`/`wasSet` objects in place (delete-then-set) instead of assigning a freshly-built object to the outer `let`.

- [ ] **Step 5: Convert `arraySwap`'s inline `swapKeys` (lines ~2639-2661)**

Same pattern: capture both sides' old values before deleting either key, then write both swapped values into the same `errors`/`touched`/`dirty`/`wasSet` objects, calling `indexKey`/`unindexKey` only for keys whose presence actually changes (a swap between two existing keys changes no key's existence, only its value — so no `indexKey`/`unindexKey` calls are needed for pure swaps where both sides already exist; only call them if one side has no entry and the swap effectively removes/adds a key).

- [ ] **Step 6: Run full core test suite**

Run: `pnpm exec vitest run packages/core/test`
Expected: PASS. Also run the array-ops-scale bench sanity check (not a hard gate, just confirms no obvious perf regression):
Run: `pnpm exec vitest bench packages/../bench/suites/core/array-ops-scale.bench.ts --run` (adjust path per bench package's actual invocation — check `bench/package.json` scripts if this exact command fails)

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/engine-invariant.test.ts
git commit -m "refactor(core): convert array-ops error/touched/dirty/wasSet reassignment to in-place mutation"
```

---

### Task 3: In-place mutation conversion — `reset()`/`hydrate()`'s six structures

**Files:**
- Modify: `packages/core/src/index.ts:2699-2787` (`reset()` — note `resetField()` immediately follows at `:2789-2873` and is a SEPARATE function that already does correct in-place clearing; do not touch it in this task), `:2875-2971` (`hydrate()`)
- Test: `packages/core/test/engine-invariant.test.ts`

**Interfaces:**
- `reset()` reassigns up to 6: `initialValues`(2726, but ONLY when `newValues` is truthy — a no-arg `reset()` must leave `initialValues` untouched, exactly as today's `if (newValues) initialValues = deepClone(newValues);` guard does), `values`(2727, unconditional — always re-derived from the current `initialValues`), `errors`(2730), `touched`(2732), `dirty`(2734), `wasSet`(2736) — each of the four record fields is currently set to `{}` via a bare reassignment (NOT already a per-key delete), preceded by an `unindexKey` loop over the old keys that only calls `unindexKey`, not `delete`.
- `hydrate()` reassigns 5: `initialValues`(2902), `values`(2903), `errors`(2905), `touched`(2907), `dirty`(2909) — **not** `wasSet`.

- [ ] **Step 1: Write failing tests for reset/hydrate value+state clearing**

```ts
// append to packages/core/test/engine-invariant.test.ts
describe('mutation invariant: reset/hydrate values/initialValues/error-state', () => {
  it('reset() clears values, errors, touched, dirty, wasSet back to newValues/defaults', () => {
    const form = createForm({ initialValues: { name: '' } });
    form.set('name', 'x', { touch: true });
    form.setErrors({ name: 'bad' });
    form.reset({ name: 'seeded' });
    const state = form.getState();
    expect(state.values.name).toBe('seeded');
    expect(state.errors.name).toBeUndefined();
    expect(state.touched.name).toBeUndefined();
    expect(state.dirty.name).toBeUndefined();
  });

  it('no cluster observes a stale values/initialValues reference across reset()', () => {
    const form = createForm({ initialValues: { name: '' } });
    const seen: unknown[] = [];
    form.subscribeToPath('name', (val) => seen.push(val));
    form.set('name', 'a');
    form.reset({ name: 'b' });
    form.set('name', 'c');
    // If a stale `values` reference were held anywhere, the second set() after reset()
    // would not be observed correctly on the fresh values object.
    expect(seen).toEqual(['a', 'b', 'c']);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass against current (pre-conversion) code**

Run: `pnpm exec vitest run packages/core/test/engine-invariant.test.ts -t "reset/hydrate"`
Expected: PASS (baseline pin).

- [ ] **Step 3: Convert `reset()`'s reassignments to in-place**

For `initialValues` (line 2726): the current code is `if (newValues) initialValues = deepClone(newValues);` — this conditional MUST be preserved exactly (a no-arg `reset()` leaves `initialValues` untouched, e.g. so it retains whatever `hydrate()` last set it to). Convert to:
```ts
if (newValues) {
  const newInitial = deepClone(newValues);
  for (const key of Object.keys(initialValues)) delete (initialValues as any)[key];
  Object.assign(initialValues, newInitial);
}
```
For `values` (line 2727, unconditional `values = deepClone(initialValues);`): convert to:
```ts
const newVals = deepClone(initialValues);
for (const key of Object.keys(values)) delete (values as any)[key];
Object.assign(values, newVals);
```
For `errors`/`touched`/`dirty`/`wasSet` (lines 2729-2736): the current code is, for each, `for (const k of Object.keys(X)) unindexKey(k); X = {};` — the loop calls ONLY `unindexKey(k)`, it does **not** delete the key from `X`. Convert each to also delete the key inside the same loop, and drop the trailing reassignment:
```ts
for (const k of Object.keys(errors)) {
  unindexKey(k);
  delete errors[k];
}
// (repeat for touched, dirty, wasSet — do NOT add the old `errors = {};` line back)
```
This is a real behavior-preservation requirement, not a simplification: skipping the `delete` and only removing the trailing `X = {}` would leave every pre-reset key present after reset, which is a regression.

- [ ] **Step 4: Convert `hydrate()`'s five reassignments to in-place, identically (excluding `wasSet`)**

`hydrate()`'s code at 2902-2909 is unconditional (there's no `if (newValues)` guard here — `merged` is always computed from `deepMerge(config.initialValues, filteredStored)`), so unlike `reset()`, both `initialValues`(2902) and `values`(2903) convert unconditionally, using the same clear-then-`Object.assign` pattern as Step 3's `values` conversion. For `errors`(2904-2905)/`touched`(2906-2907)/`dirty`(2908-2909): identical to Step 3's fix — the loops call only `unindexKey(k)`, so add `delete errors[k]` (etc.) inside each loop and drop the trailing `errors = {};` (etc.). Do not touch `wasSet` in this function — confirmed by the audit that `hydrate()` never references it.

- [ ] **Step 5: Run full core test suite**

Run: `pnpm exec vitest run packages/core/test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/engine-invariant.test.ts
git commit -m "refactor(core): convert reset()/hydrate() values/initialValues/error-state reassignment to in-place mutation"
```

---

### Task 4: `lastSubmittedValues` lint/checklist protection

**Files:**
- Modify: `biome.json` (or wherever custom lint config lives — check root for `biome.json`) if a custom rule is feasible; otherwise create `docs/CONTRIBUTING.md` (or append to existing) checklist note.
- No production code change — `lastSubmittedValues` stays a reassigned `let`, deliberately excepted per spec.

- [ ] **Step 1: Check whether Biome supports a custom no-destructure-this-identifier rule**

Run: `pnpm exec biome rage` or check `pnpm exec biome --help` / Biome docs for a `noRestrictedSyntax`-equivalent rule. Biome (as of current version pinned in this repo) does not support arbitrary custom lint rules the way ESLint does — if this is confirmed, skip to Step 3.

- [ ] **Step 2 (only if Biome supports it): add the rule**

Add a `biome.json` override flagging `const { lastSubmittedValues } = ...` destructuring patterns. Skip this step entirely if Biome has no such mechanism (expected outcome given current Biome capabilities) — do not spend more than one investigation pass on this.

- [ ] **Step 3: Document the exception as a mandatory code-review checklist item**

Add a short paragraph to `CLAUDE.md`'s Architecture section, under a new subsection "Mutation invariant" (near where the Core Engine Design section already lives):

```markdown
### Mutation invariant

`ctx.errors`, `ctx.touched`, `ctx.dirty`, `ctx.wasSet`, `ctx.values`, `ctx.initialValues` are never reassigned — only cleared-and-repopulated in place. This is what makes cross-module `ctx` composition (see `engine.ts`/`features/*.ts`) safe: a feature function that destructures `const { values } = ctx` at setup time keeps observing the live object forever, never a stale snapshot. **Exceptions, all deliberately reassigned rather than mutated in place — always read these fresh via `ctx.X`, never destructure-and-cache:** `ctx.lastSubmittedValues` (read only by the engine's own `getState()`, never by feature-cluster code); `ctx.mutationObserver`/`ctx.persistenceUnsubscribe`/`ctx.persistenceWriteTimer` (the three nullable engine-owned slots reassigned by `features/dom-bridge.ts`'s `initMutationObserver` and `features/persistence.ts`'s `hydrate`, then read/nulled again by `engine.ts`'s `destroy()` and, for `persistenceUnsubscribe`, by `reset()`'s `onReset` hook guard — these cross module boundaries in both directions, so the staleness risk is real despite being an accepted, documented exception).
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document the ctx mutation invariant and lastSubmittedValues exception"
```

---

### Task 5: `getPayload()`/`submit()` fallback to full `values`

**Files:**
- Modify: `packages/core/src/index.ts:3029-3046` (`_getPayload`)
- Test: `packages/core/test/engine-invariant.test.ts` (or a new `getPayload-fallback.test.ts` if that reads cleaner — either is fine, keep it in `packages/core/test/`)

**Interfaces:**
- `_getPayload<T>(values: T, registry: Map<string, WeakRef<HTMLElement>>, connected: Set<string>, persisted: Set<string>): Partial<T>` — signature unchanged, only internal behavior changes.

- [ ] **Step 1: Write failing tests for the fallback**

```ts
// packages/core/test/getPayload-fallback.test.ts
import { describe, it, expect } from 'vitest';
import { createForm } from '../src/index.js';

describe('getPayload/submit fallback when nothing connected/persisted', () => {
  it('getPayload returns full values when no field is connected', () => {
    const form = createForm({ initialValues: { name: 'x', age: 5 } });
    expect(form.getPayload()).toEqual({ name: 'x', age: 5 });
  });

  it('submit callback receives full values when no field is connected', async () => {
    const form = createForm({ initialValues: { name: 'x' } });
    let received: unknown;
    await form.submit(async (payload) => {
      received = payload;
    });
    expect(received).toEqual({ name: 'x' });
  });

  it('once a field is connected, filtering resumes as before', () => {
    const form = createForm({ initialValues: { name: 'x', age: 5 } });
    const el = document.createElement('input');
    // connect(path, element, options?) is NOT curried — it takes the element as its
    // second argument directly and returns a disconnect cleanup function.
    const disconnect = form.connect('name', el);
    expect(form.getPayload()).toEqual({ name: 'x' });
    disconnect();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run packages/core/test/getPayload-fallback.test.ts`
Expected: FAIL — current `_getPayload` returns `{}` for the first two tests.

- [ ] **Step 3: Implement the fallback in `_getPayload`**

```ts
function _getPayload<T>(
  values: T,
  registry: Map<string, WeakRef<HTMLElement>>,
  connected: Set<string>,
  persisted: Set<string>
): Partial<T> {
  if (connected.size === 0 && persisted.size === 0) {
    return deepClone(values) as Partial<T>;
  }
  const payload = {} as any;
  registry.forEach((ref, path) => {
    if (connected.has(path) || persisted.has(path)) {
      const el = ref.deref();
      if (el) {
        const val = getNestedValue(values, path);
        if (val !== undefined) setNestedValue(payload, path, val);
      }
    }
  });
  return payload;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run packages/core/test/getPayload-fallback.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full core test suite**

Run: `pnpm exec vitest run packages/core/test`
Expected: PASS — confirm no existing test relied on the old `{}`-when-unconnected behavior (per spec, this is expected to be safe since no existing test asserted `{}` deliberately, but verify).

- [ ] **Step 6: Add CHANGELOG entry**

Check for a `CHANGELOG.md` at repo root or `packages/core/CHANGELOG.md` (release-please auto-generates these from conventional commits — check if a manual entry is needed or if the `fix:` commit message below is sufficient given this repo's release-please setup). If manual entries aren't used (release-please generates from commits), ensure the commit message itself clearly documents the behavior change so release-please's changelog reflects it:

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/getPayload-fallback.test.ts
git commit -m "$(cat <<'EOF'
fix(core): getPayload/submit return full values when nothing is connected or persisted

BREAKING BEHAVIOR CHANGE (narrow case): previously, calling submit()/getPayload()
without ever calling .connect() on any field silently returned {}. This was a
latent bug surfaced while designing the minimal bundle tier (which has no
DOM-bridge at all). Now, when no path is connected or persisted, the full
values object is returned instead.
EOF
)"
```

---

### Task 6: Introduce `FormEngineContext<T>` and the 4 extension-point hooks (single-file, pre-split)

**Files:**
- Modify: `packages/core/src/index.ts` (large mechanical refactor — consolidate closure `let`/`const` declarations into one `ctx` object; add 4 hook slots)
- Test: `packages/core/test` (existing suite must remain green with zero changes; this task adds no new observable behavior)

**Interfaces:**
- Produces: `interface FormEngineContext<T> { values: T; initialValues: T; errors: Record<string,string>; touched: Record<string,boolean>; dirty: Record<string,boolean>; wasSet: Record<string,boolean>; validatedPaths: Set<string>; pathIndex: Map<string, Map<string, number>>; pathSubscribers: Map<string, Set<PathSubscriber>>; globalSubscribers: Set<FormSubscriber<T>>; connectionRegistry: Map<string, WeakRef<HTMLElement>>; connectedPaths: Set<string>; persistedPaths: Set<string>; mutationObserver: MutationObserver | null; persistenceUnsubscribe: (() => void) | null; persistenceWriteTimer: ReturnType<typeof setTimeout> | null; batchDepth: number; pendingPaths: Set<string|undefined>; pendingExactPaths: Set<string>; asyncEpoch: number; activeAbortControllers: Map<string, AbortController>; isSubmitting: boolean; isValidating: boolean; hasValidated: boolean; isHydrating: boolean; submissionAttempts: number; lastSubmittedValues: Partial<T> | null; config: FormConfig<T>; transientPaths: string[]; isComputedField: (path: string) => boolean; runComputedPass: () => string[]; hasComputedFields: () => boolean; onReset: (newValues?: T) => void; runValidation: (scopePaths?: string[]) => Promise<boolean>; dispatchAction: (action: FormAction) => void; notify: (path?: string, options?: {exact?:boolean}) => void; notifyGlobalSubscribers: (snap: FormState<T>) => void; notifyPathSubscribers: (paths: string[], exactPaths?: string[]) => void; batch: (fn: () => void) => void; indexKey: (key: string) => void; unindexKey: (key: string) => void; getState: () => FormState<T>; resolveFieldMode: (path: string) => ValidationMode; deepMerge: (base: any, override: any) => any; setFieldValue: (path: string, value: unknown, options?: SetOptions) => void; subscribeToPath: <V>(path: string, fn: PathSubscriber<V>) => () => void; __warnUnknownPath: (path: string) => void; isFieldRequired: (path: string) => boolean; subscribe: (fn: FormSubscriber<T>) => () => void; }`

**`subscribe`** (found in round-3 review, missing from both the spec's and this plan's earlier primitives lists): `hydrate()` (moving to `features/persistence.ts` in Task 9) calls the global `subscribe(...)` at source lines 2942 and 2959 (`persistenceUnsubscribe = subscribe((state) => { ... })`). `subscribe` itself is a standalone named const (line 1360) that stays in `engine.ts` as a minimal-tier method — but `attachPersistence` runs in a separate file and has no other way to reach it. Add `ctx.subscribe = subscribe;` to the `ctx` object literal in this task, and have `hydrate` call `ctx.subscribe(...)` once it moves in Task 9.

**`isFieldRequired`** (found in round-2 review, missing from the spec's own cross-cluster primitives audit): `function isFieldRequired(path: string): boolean` (source line 2353-2360, reads `config.rules`) is called from TWO sites both destined for `features/dom-bridge.ts`: `connect()` (line 2082) and `getAriaProps` (line 2490). It must be added to `ctx` in this task alongside the other ~15 primitives, or `attachDomBridge` (Task 10) will not compile.

This task does **not** move any code to new files yet — it only wraps the existing closure variables into one `ctx` object literal declared near the top of `createForm`, and rewrites every reference (`values` → `ctx.values`, `notify(...)` → `ctx.notify(...)`, etc.) throughout the ~2000-line closure body. This is mechanical but extremely wide-reaching; do it as one atomic task specifically so a partial ctx-migration (some code reading `ctx.values`, other code still reading the bare `values` closure variable pointing at a stale pre-migration copy) is never a possible intermediate state.

**Prerequisite structural fact, verified against source — read this before starting Step 1:** the `return { ... }` object literal that `createForm` produces (`index.ts:2362-3026`) is NOT a shorthand list of pre-declared `const`s for every method. About half its members ARE pre-declared consts referenced by shorthand (`submit`, `connect`, `focus`, `focusFirstError`, `setErrors`, `clearErrors`, `watch`, `subscribeToPath`, `subscribe`, `isDirty`, `isFieldDirty`, `isFieldValid`, `handleSubmit`, `getState`) — for these, Tasks 8-11's "move this function to features/X.ts" instructions apply directly. But the following members are defined **inline as anonymous function/arrow expressions directly as object-literal values**, with no standalone name anywhere in the file: `subscribeToPathDynamic`, `get`, `set`, `validate`, `getPayload`, `setDynamic`, `getDynamic`, `getAriaProps`, the public `batch` wrapper (distinct from the internal `batch` primitive at line 1344), `arrayAppend`(2517), `arrayInsert`(2525), `arrayRemove`(2551), `arrayMove`(2575), `arraySwap`(2603), `reset`(2699), `resetField`(2789), `hydrate`(2868), `destroy`(3007), `_subscribeToActions`, `_debugPathIndex`, `_debugIndexKey`, `_debugUnindexKey`, `_debugRawState`.

Tasks 8-11 later need to relocate several of these (`arrayAppend`/`arrayInsert`/`arrayRemove`/`arrayMove`/`arraySwap` to array-ops; `hydrate` to persistence; `getAriaProps` to dom-bridge) into standalone `attachX` functions in other files — which is impossible while they're anonymous properties of one object literal. **Before Step 1 below, extract every one of the ~20 inline members listed above, PLUS `getFieldMode` (inline at line ~2511, `getFieldMode: (path: string) => resolveFieldMode(path)` — omitted from the first pass of this list, added in round-3 review) into a standalone named `const` declaration in the closure body** (e.g. `const arrayAppend = (path: string, item: unknown) => { ... };` declared where it logically sits among the other helper functions, well before the final `return { ... }`), then change the final return statement to reference each by shorthand (`{ ..., arrayAppend, arrayInsert, ..., getFieldMode }`). This is a pure syntactic hoist — no logic changes — but must happen before the `ctx.`-prefixing rewrite in Step 2, since Step 2's mechanical find-and-replace is far easier to do correctly across named function bodies than inside one 700-line object literal. Run `pnpm exec tsc --noEmit && pnpm exec vitest run packages/core/test` after this hoist, before starting Step 2, to confirm it introduced no behavior change on its own.

**Naming collision warning (round-3 finding), read before hoisting the public `batch` wrapper:** the internal batch primitive is already a standalone `const batch = (fn: () => void) => { ... }` at line 1344. The *inline* public `batch` member of the return object (line ~2501) is a **separate** function that calls the internal one: `batch: (fn) => { dispatchAction({type:'BATCH_START'}); try { batch(fn); } finally { dispatchAction({type:'BATCH_END'}); } }`. Hoisting this under the same name `batch` would either fail to compile (duplicate `const batch` declaration) or, if shadowing were somehow allowed, self-recurse infinitely. **Hoist the public wrapper under a distinct name, `batchPublic`**, keeping its body's call to the internal `batch` unchanged, and use `batch: batchPublic` in the return object shorthand (and later, in Task 12's `engine.ts` instance literal, `batch: batchPublic` again — `ctx.batch` stays bound to the internal primitive per the `FormEngineContext` interface above, which is intentionally a different name/purpose than the public method).

- [ ] **Step 1: Declare `FormEngineContext<T>` type and `ctx` object**

Immediately after the existing `let`/`const` declarations block (lines 1030-1135, i.e. `deepMerge` through `transientPaths`), add:
```ts
const ctx: FormEngineContext<T> = {
  values, initialValues, errors, touched, dirty, wasSet,
  validatedPaths, pathIndex, pathSubscribers, globalSubscribers,
  connectionRegistry, connectedPaths, persistedPaths,
  mutationObserver, persistenceUnsubscribe, persistenceWriteTimer,
  batchDepth, pendingPaths, pendingExactPaths,
  asyncEpoch, activeAbortControllers,
  isSubmitting, isValidating, hasValidated, isHydrating,
  submissionAttempts, lastSubmittedValues,
  config, transientPaths,
  isComputedField: () => computedMap.has,  // placeholder overwritten below — see Step 3
  runComputedPass, // real function already exists at this point in file order — wire directly for now
  hasComputedFields: () => computedMap.size > 0,
  onReset: () => {}, // no-op default; Task 8 (persistence extraction) installs the real override
  runValidation, dispatchAction, notify, notifyGlobalSubscribers, notifyPathSubscribers, batch,
  indexKey, unindexKey, getState, resolveFieldMode, deepMerge,
  setFieldValue, subscribeToPath, __warnUnknownPath, isFieldRequired, subscribe,
};
```
Note: since this task keeps everything in one file (no attach-function overrides yet), `isComputedField`/`hasComputedFields`/`runComputedPass` can point directly at the real `computedMap`-backed logic rather than no-op defaults — the no-op-default behavior only matters once `features/computed-fields.ts` becomes conditionally attached in Task 9-12. Fix the `isComputedField` line above to `(path: string) => computedMap.has(path)` (the placeholder shown has a bug — `computedMap.has` unbound — do not ship that; write `(path: string) => computedMap.has(path)`).

- [ ] **Step 2: Replace every bare closure-variable reference with `ctx.X` throughout `createForm`'s body**

This is the bulk of the task. Go through every function still defined via the bare `let`/`const` names (`runValidation`, `setFieldValue`, `notify`, `batch`, array-ops functions, dom-bridge functions, persistence functions, `reset`, `resetField`, `destroy`, `submit`, etc.) and replace reads/writes of the migrated identifiers with `ctx.` access. Concretely:
- Every reassignment already converted to in-place mutation in Tasks 1-3 (`errors`, `touched`, `dirty`, `wasSet`, `values`, `initialValues`) becomes `ctx.errors`, etc. — since these are never reassigned, `ctx.errors` mutated in place stays valid forever, which is the entire point.
- `lastSubmittedValues` (still reassigned, per the deliberate exception) becomes `ctx.lastSubmittedValues = ...` at its two sites (`submit()`, `reset()`) — a `ctx` field CAN be reassigned for this one field; the invariant is documented (Task 4) as a convention for this one case, not enforced by construction.
- Function calls: `notify(path)` → `ctx.notify(path)`, `indexKey(k)` → `ctx.indexKey(k)`, `runValidation(scope)` → `ctx.runValidation(scope)`, etc.
- Do NOT migrate purely-local variables that never leave a single function's scope (e.g. loop-local `const parts = path.split('.')`) — only the ~35 identifiers listed in the `FormEngineContext` interface above.
- **`computedMap.has(path)` has THREE call sites, not two** — `setFieldValue` (line ~1638), `setFieldValue` again for the `hasComputedFields`-style `computedMap.size > 0` check (line ~1666), AND a third, independent site inside `setDynamic` (line ~2457, `if (computedMap.has(path)) { ...warn...; return; }`). All three must convert to `ctx.isComputedField(path)` (the first and third) / `ctx.hasComputedFields()` (the second) — do not miss the `setDynamic` site, it is easy to overlook since it's not inside `setFieldValue`.

Since this is a large mechanical rewrite, work file-section by file-section (helper functions, then `runValidation`, then `setFieldValue`, then array-ops functions, then dom-bridge functions, then persistence functions, then the final return-object methods), running `pnpm exec tsc --noEmit` after each section to catch missed references before moving to the next section — a section-by-section `tsc` check is far cheaper than debugging one giant diff.

- [ ] **Step 3: Verify no remaining bare-identifier references**

Run: `pnpm exec tsc --noEmit -p packages/core` (or repo-root `pnpm exec tsc --noEmit` if that's the established command)
Expected: zero errors. Any remaining bare `values`/`errors`/etc. reference not routed through `ctx` will surface as either a TS error (if the bare `let` was removed) or, if the bare `let` declarations are temporarily left in place alongside `ctx` during migration, a silent divergence bug — to prevent this, delete the original bare `let`/`const` declarations for every migrated identifier as the LAST step of this task (not before), so `tsc` is forced to catch every remaining bare reference as an undefined-name error.

- [ ] **Step 4: Run full core test suite**

Run: `pnpm exec vitest run packages/core/test`
Expected: PASS, zero test changes (this task changes no observable behavior).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "refactor(core): consolidate createForm's closure state into a single ctx object"
```

---

### Task 7: Independent re-verification of Task 6's `ctx` migration

**Files:**
- Read-only review task — no file changes unless a gap is found.

- [ ] **Step 1: Fresh grep-based audit**

A reviewer who did NOT perform Task 6 must independently grep `packages/core/src/index.ts` for every one of the ~35 `FormEngineContext` field/method names used WITHOUT a `ctx.` prefix inside `createForm`'s body (excluding the `ctx` object literal declaration itself and excluding legitimately-local variables of the same name in narrow scopes — flag any ambiguous case for manual inspection rather than auto-clearing it). Also confirm the bare `let`/`const` declarations for all 35 were actually deleted (Step 3 of Task 6), not merely shadowed.

- [ ] **Step 1b: Structural completeness check (separate from the identifier-prefix grep above)**

A grep for missing `ctx.` prefixes cannot detect a different class of gap: whether the ~23 members Task 6's prerequisite hoist was supposed to convert from inline object-literal properties into standalone named `const` declarations (`subscribeToPathDynamic`, `get`, `set`, `validate`, `getPayload`, `setDynamic`, `getDynamic`, `getAriaProps`, `getFieldMode`, the public `batch` wrapper — hoisted under the distinct name `batchPublic`, NOT `batch` — `arrayAppend`, `arrayInsert`, `arrayRemove`, `arrayMove`, `arraySwap`, `reset`, `resetField`, `hydrate`, `destroy`, `_subscribeToActions`, `_debugPathIndex`, `_debugIndexKey`, `_debugUnindexKey`, `_debugRawState`) were actually all hoisted. Independently open `index.ts` and confirm each of these names has a `const NAME = ...` declaration outside the final `return { ... }` object literal, with the return statement referencing it by shorthand (`batch: batchPublic` for the public wrapper specifically) — not still defined inline as `NAME: (...) => { ... }` inside the return object, and not declared as `const batch = ...` (which would collide with the pre-existing internal `batch` primitive at line 1344). This check exists specifically because Tasks 8-11 depend on these being independently relocatable; a shorthand-grep alone would miss this.

- [ ] **Step 2: Fix any gap found, re-run full suite, commit fix**

If gaps are found, fix them following the same pattern as Task 6 Step 2, then:
Run: `pnpm exec tsc --noEmit && pnpm exec vitest run packages/core/test`
Expected: PASS.
```bash
git add packages/core/src/index.ts
git commit -m "fix(core): close ctx-migration gaps found in independent review"
```
If no gaps are found, no commit is needed — record the clean result in the task's completion note for the plan executor.

---

### Task 8: Extract `features/computed-fields.ts`

**Files:**
- Create: `packages/core/src/features/computed-fields.ts`
- Modify: `packages/core/src/index.ts` (remove the extracted code, call `attachComputedFields(ctx)` instead)
- Test: `packages/core/test` (existing suite, zero changes expected)

**Interfaces:**
- Produces: `attachComputedFields<T extends object>(ctx: FormEngineContext<T>, config: FormConfig<T>): void` — mutates `ctx.isComputedField`, `ctx.runComputedPass`, `ctx.hasComputedFields`, `ctx.transientPaths` in place (via `ctx.transientPaths.length = 0; ctx.transientPaths.push(...newPaths)` — remember the mutation invariant does not list `transientPaths` as an invariant-protected field, but since it's a `ctx`-owned array read by `submit`/`getPayload` in `engine.ts`, apply the same in-place-mutation discipline anyway for consistency, since `engine.ts` may hold a destructured reference to it just like the six protected fields).

- [ ] **Step 1: Create `features/computed-fields.ts`**

Move `computedMap` declaration + `flattenComputedConfig` call (lines 1118-1119), `computedPassLimit` (1123-1128), the `transientPaths` build (1132-1135), and `runComputedPass` (1147-1199) into the new file, wrapped in an exported function:

```ts
// packages/core/src/features/computed-fields.ts
import type { FormEngineContext } from '../engine.js';
import type { FormConfig } from '../index.js';
import { deepClone, getNestedValue, setNestedValue, isDeepEqual } from '../index.js';

// flattenComputedConfig stays a module-scope free function, moved here verbatim
// from its current location (lines 992-1023 of the pre-split index.ts).
function flattenComputedConfig<T>(/* ...unchanged signature... */) { /* ...unchanged body... */ }

export function attachComputedFields<T extends object>(
  ctx: FormEngineContext<T>,
  config: FormConfig<T>
): void {
  const computedMap = new Map<string, { fn: (values: T) => unknown; transient: boolean }>();
  flattenComputedConfig<T>((config.computed ?? {}) as Record<string, unknown>, computedMap);

  const computedPassLimit =
    typeof config.computedPassLimit === 'number' &&
    Number.isFinite(config.computedPassLimit) &&
    config.computedPassLimit >= 1
      ? Math.min(Math.floor(config.computedPassLimit), 50)
      : 5;

  ctx.transientPaths.length = 0;
  for (const [path, { transient }] of computedMap) {
    if (transient) ctx.transientPaths.push(path);
  }

  ctx.isComputedField = (path: string) => computedMap.has(path);
  ctx.hasComputedFields = () => computedMap.size > 0;
  ctx.runComputedPass = (): string[] => {
    // ...body identical to current runComputedPass (lines 1147-1199), reading/writing
    // ctx.values instead of the bare `values` closure variable...
  };
}
```
(Fill in `runComputedPass`'s body by copying lines 1147-1199 verbatim, replacing `values` with `ctx.values` and `__isProdLocal` with a parameter or re-derived local flag — check whether `__isProdLocal` needs to move too; if it's engine-generic, keep computing it inside `attachComputedFields` locally since it's a one-line `try/catch` on `process.env.NODE_ENV`, not worth adding to `ctx`.)

- [ ] **Step 2: Update `packages/core/src/engine.ts`'s hook defaults (created in this step if not already present from Task 6)**

Since `engine.ts` doesn't exist as a separate file yet (Task 6 kept everything in `index.ts`), this step's "hook defaults" live in the `ctx` object literal from Task 6 — change the eager real-logic wiring from Task 6 Step 1 to actual no-op defaults now, since `attachComputedFields` will override them:
```ts
isComputedField: () => false,
hasComputedFields: () => false,
runComputedPass: () => [],
```
Remove the old inline `computedMap`/`flattenComputedConfig`/`runComputedPass`/`transientPaths` declarations from `index.ts` (they moved to the new file in Step 1) and call `attachComputedFields(ctx, config);` right after the `ctx` object literal is constructed, before the `ctx.runComputedPass()` init-seed call (which stays where it is, at the former line 1201, now reading `ctx.runComputedPass()`). **Note for Task 12:** at this point in the plan everything is still one file, so this call site is correct as "right after ctx construction." Once Task 12 splits `createCoreForm` into `engine.ts` (full/minimal-shared) versus `index.ts` (full-tier-only composition), this call must move OUT of `createCoreForm` and into `index.ts`'s `createForm` only — computed-fields is full-tier-only per the spec (see Task 12 Step 1's explicit correction). Do not let this call linger inside `createCoreForm` after Task 12.

- [ ] **Step 3: Run full core test suite**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run packages/core/test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/features/computed-fields.ts packages/core/src/index.ts
git commit -m "refactor(core): extract computed-fields into features/computed-fields.ts"
```

---

### Task 9: Extract `features/persistence.ts`

**Files:**
- Create: `packages/core/src/features/persistence.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test` (existing suite, zero changes)

**Interfaces:**
- Produces: `attachPersistence<T extends object>(ctx: FormEngineContext<T>, config: FormConfig<T>): { hydrate: () => Promise<void> }` — installs `ctx.onReset` override, returns `hydrate` to be assigned onto the instance.

- [ ] **Step 1: Create `features/persistence.ts`, moving `hydrate` (lines 2875-2971) and the `reset()` write-on-reset block (lines 2699-2724)**

```ts
// packages/core/src/features/persistence.ts
import type { FormEngineContext } from '../engine.js';
import type { FormConfig } from '../index.js';

export function attachPersistence<T extends object>(
  ctx: FormEngineContext<T>,
  config: FormConfig<T>
): { hydrate: () => Promise<void> } {
  ctx.onReset = (newValues?: T) => {
    const cfg = config.persistence;
    if (cfg && ctx.persistenceUnsubscribe !== null) {
      if (newValues) {
        // ...exact exclude-filter + cfg.adapter.write(toWrite) logic from lines 2704-2718...
      } else {
        // ...exact cfg.adapter.clear() logic from lines 2719-2723...
      }
    }
  };

  const hydrate = async (): Promise<void> => {
    // ...body identical to current hydrate (lines 2875-2971), with every reference to
    // the migrated ctx fields (values, initialValues, errors, touched, dirty,
    // isHydrating, isSubmitting, isValidating, hasValidated, globalSubscribers,
    // pathSubscribers, persistenceUnsubscribe, persistenceWriteTimer) rewritten as
    // ctx.X, and calls to deepMerge/getState/notifyGlobalSubscribers/notifyPathSubscribers/
    // subscribe rewritten as ctx.deepMerge/ctx.getState/etc...
  };

  return { hydrate };
}
```

- [ ] **Step 2: Update `index.ts`**

Remove the inline `reset()` write-on-reset block (2699-2724), replacing it with a single call `ctx.onReset(newValues);` placed exactly where that block used to sit — i.e. BEFORE the `batch(() => { ... })` call at line 2725, not inside it. (The original write-on-reset logic runs before `batch()` starts, not inside it; do not move it inside `batch()` when replacing it with the hook call.) Remove the standalone `hydrate` function; call `const { hydrate } = attachPersistence(ctx, config);` during composition and include `hydrate` in the full-tier `Object.assign`.

Set `ctx.onReset` default (in the `ctx` object literal) to `() => {}` if not already done in Task 6/8.

- [ ] **Step 3: Run full core test suite, paying particular attention to persistence tests**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run packages/core/test`
Expected: PASS — specifically re-run whatever existing persistence test file covers the pre-hydrate-reset no-write guard (search `packages/core/test/*persist*` for the exact test name) to confirm the `persistenceUnsubscribe !== null` guard survived the extraction verbatim.

Run: `grep -rl "persist" packages/core/test/*.test.ts` first to find the exact file/test name, then run it explicitly by name.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/features/persistence.ts packages/core/src/index.ts
git commit -m "refactor(core): extract persistence into features/persistence.ts, add ctx.onReset hook"
```

---

### Task 10: Extract `features/dom-bridge.ts` (incl. `_getPayload` fallback)

**Files:**
- Create: `packages/core/src/features/dom-bridge.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test` (existing suite, zero changes)

**Interfaces:**
- Produces: `attachDomBridge<T extends object>(ctx: FormEngineContext<T>, config: FormConfig<T>): { connect: FormInstance<T>['connect']; focus: (path: string) => boolean; focusFirstError: () => boolean; getAriaProps: (path: string, options?: AriaPropsOptions) => AriaProps; getConnectedCount: () => number }`

- [ ] **Step 1: Create `features/dom-bridge.ts`, moving `initMutationObserver` (1692-1726), `focus` (2024-2036), `focusFirstError` (2038-2065), `connect` (2067-2214), `getAriaProps` (line ~2490, after Task 6's hoist made it a standalone const), and `getConnectedCount`. Also move module-scope `_getPayload` (3029-3046, with Task 5's fallback already applied).**

Note: `isFieldRequired` (source lines 2353-2360) is a real primitive (reads only `config.rules`, no dependency on any feature-cluster state), so unlike the 4 hook slots it does NOT need an attach-time override — `ctx.isFieldRequired` is set to its real implementation directly during `ctx` construction in Task 6/`engine.ts`, present unconditionally in both tiers exactly like `ctx.resolveFieldMode`. `attachDomBridge` (this task) just calls the already-real `ctx.isFieldRequired(path)` at its two call sites (`connect`, `getAriaProps`) — it does not install or override it.

```ts
// packages/core/src/features/dom-bridge.ts
import type { FormEngineContext } from '../engine.js';
import type { FormConfig, AriaProps, AriaPropsOptions } from '../index.js';
import { deepClone, getNestedValue, setNestedValue } from '../index.js';

export function _getPayload<T>(
  values: T,
  registry: Map<string, WeakRef<HTMLElement>>,
  connected: Set<string>,
  persisted: Set<string>
): Partial<T> {
  if (connected.size === 0 && persisted.size === 0) {
    return deepClone(values) as Partial<T>;
  }
  const payload = {} as any;
  registry.forEach((ref, path) => {
    if (connected.has(path) || persisted.has(path)) {
      const el = ref.deref();
      if (el) {
        const val = getNestedValue(values, path);
        if (val !== undefined) setNestedValue(payload, path, val);
      }
    }
  });
  return payload;
}

export function attachDomBridge<T extends object>(
  ctx: FormEngineContext<T>,
  config: FormConfig<T>
) {
  const initMutationObserver = () => {
    // ...body identical to lines 1692-1726, ctx.X-prefixed...
  };

  const connect = (path: string, /* ...params... */) => {
    // ...body identical to lines 2067-2214, ctx.X-prefixed, calling initMutationObserver
    // lazily on first connect exactly as today...
  };

  const focus = (path: string): boolean => { /* ...lines 2024-2036, ctx.X-prefixed... */ };
  const focusFirstError = (): boolean => { /* ...lines 2038-2065, ctx.X-prefixed... */ };
  const getAriaProps = (path: string, options?: AriaPropsOptions): AriaProps => {
    /* ...body identical to the inline `getAriaProps` member of createForm's return object
       (found in round-2 review at line ~2490 — this is one of the ~22 inline members Task 6's
       prerequisite hoist extracted into a standalone const; verify it's present as
       `const getAriaProps = ...` in index.ts by this point), ctx.X-prefixed, calling
       ctx.isFieldRequired(path) instead of the bare isFieldRequired(path) call... */
  };
  const getConnectedCount = (): number => ctx.connectionRegistry.size;

  return { connect, focus, focusFirstError, getAriaProps, getConnectedCount };
}
```
Note: `_getPayload` is exported (not module-private) since `engine.ts`'s `submit`/`getPayload` methods (which stay in `engine.ts`, per the audit's §1 classification of `submit`/`getPayload` as engine-owned) need to import and call it.

**Round-2 finding — the instance's `getPayload` method is a distinct wrapper around `_getPayload`, not `_getPayload` itself.** The inline `getPayload` member of `createForm`'s return object (line 2426-2444, one of the ~22 members hoisted to a standalone `const` in Task 6) calls `_getPayload(...)` and then runs an additional transient-path-stripping loop over `ctx.transientPaths` — a near-duplicate of the stripping loop already inside `submit()` (lines 2246-2261). Both `getPayload` and `submit` stay in `engine.ts` (per the audit's §1 classification), NOT in `features/dom-bridge.ts` — only the raw `_getPayload` free function moves here. When converting `getPayload`/`submit` to `ctx.X`-prefixed code in Task 6, keep their transient-stripping loops exactly where they are (reading `ctx.transientPaths`, which is `[]` under minimal and correctly populated under full mode by Task 8's `attachComputedFields`); do not attempt to move this stripping logic into `features/dom-bridge.ts` or `features/computed-fields.ts` — it is engine-level code that happens to read a computed-fields-owned `ctx` field, exactly like `ctx.transientPaths`'s other read sites.

- [ ] **Step 2: Update `index.ts`**

Remove the inline dom-bridge functions and the old module-scope `_getPayload`. Import `_getPayload` from `./features/dom-bridge.js` for use inside `submit`/`getPayload` (which remain engine methods per the audit — they call `_getPayload(ctx.values, ctx.connectionRegistry, ctx.connectedPaths, ctx.persistedPaths)`). Call `const { connect, focus, focusFirstError, getAriaProps, getConnectedCount } = attachDomBridge(ctx, config);` during full-tier composition.

- [ ] **Step 3: Run full core test suite**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run packages/core/test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/features/dom-bridge.ts packages/core/src/index.ts
git commit -m "refactor(core): extract DOM bridge into features/dom-bridge.ts"
```

---

### Task 11: Extract `features/array-ops.ts`

**Files:**
- Create: `packages/core/src/features/array-ops.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test` (existing suite, zero changes)

**Interfaces:**
- Produces: `attachArrayOps<T extends object>(ctx: FormEngineContext<T>): { arrayAppend: ...; arrayInsert: ...; arrayRemove: ...; arrayMove: ...; arraySwap: ... }`

- [ ] **Step 1: Create `features/array-ops.ts`, moving `shiftStateIndices` (1728-1849, already converted to in-place in Task 2), `rekeyArrayState` (1851-1924, ditto), and the five `arrayX` methods (2517-2697, `arraySwap` already converted in Task 2)**

```ts
// packages/core/src/features/array-ops.ts
import type { FormEngineContext } from '../engine.js';
import { getNestedValue, setNestedValue } from '../index.js';

export function attachArrayOps<T extends object>(ctx: FormEngineContext<T>) {
  const shiftStateIndices = (/* ...params... */) => {
    // ...body identical to (already in-place, post-Task-2) lines 1728-1849, ctx.X-prefixed...
  };
  const rekeyArrayState = (/* ...params... */) => {
    // ...body identical to (post-Task-2) lines 1851-1924, ctx.X-prefixed...
  };
  const arrayAppend = (path: string, item: unknown) => {
    // ...lines 2517-2523, ctx.X-prefixed, calling ctx.setFieldValue...
  };
  const arrayInsert = (path: string, index: number, item: unknown) => {
    // ...lines 2525-2549, ctx.X-prefixed...
  };
  const arrayRemove = (path: string, index: number) => {
    // ...lines 2551-2573, ctx.X-prefixed, calling shiftStateIndices...
  };
  const arrayMove = (path: string, fromIndex: number, toIndex: number) => {
    // ...lines 2575-2601, ctx.X-prefixed, calling rekeyArrayState...
  };
  const arraySwap = (path: string, indexA: number, indexB: number) => {
    // ...lines 2603-2697 (post-Task-2, already in-place), ctx.X-prefixed...
  };
  return { arrayAppend, arrayInsert, arrayRemove, arrayMove, arraySwap };
}
```

- [ ] **Step 2: Update `index.ts`**

Remove the inline array-ops functions. Call `const { arrayAppend, arrayInsert, arrayRemove, arrayMove, arraySwap } = attachArrayOps(ctx);` during full-tier composition.

- [ ] **Step 3: Run full core test suite plus the array-ops-scale benchmark sanity check**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run packages/core/test`
Expected: PASS.
Run the array-ops-scale bench (per `bench/README.md` or `bench/package.json` scripts — confirm exact invocation) and eyeball that numbers are in the same ballpark as the pre-split baseline recorded in the shiftStateIndices work (item 1 of the release gate) — this is a sanity check, not a hard gate, since Task 2 already removed an O(total-keys) clone that should make this faster, not slower.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/features/array-ops.ts packages/core/src/index.ts
git commit -m "refactor(core): extract array operations into features/array-ops.ts"
```

---

### Task 12: Create `engine.ts`, slim down `index.ts`, create `minimal.ts`

**Files:**
- Create: `packages/core/src/engine.ts`
- Modify: `packages/core/src/index.ts` (now the thin full-tier composition file)
- Create: `packages/core/src/minimal.ts`
- Test: `packages/core/test` (existing suite, zero changes) + new `packages/core/test/minimal.test.ts`

**Interfaces:**
- Produces: `createCoreForm<T extends object>(config: FormConfig<T>): { ctx: FormEngineContext<T>; instance: MinimalFormInstance<T> }`

- [ ] **Step 1: Move everything remaining in `createForm`'s body (the true engine-only code — the `ctx` construction, `runValidation`, `setFieldValue`, `notify`/`batch`/`dispatchAction`, `reset`/`resetField`/`destroy`, `submit`/`handleSubmit`/`getState`/`getPayload`/`setErrors`/`clearErrors`/`watch`/`subscribeToPath`/`isFieldValid`/`isFieldDirty`/`isDirty`, all the `_debug*` accessors) into `engine.ts`, wrapped in `createCoreForm`**

```ts
// packages/core/src/engine.ts
import { /* deepClone, getNestedValue, setNestedValue, isDeepEqual, extractAllPaths,
            compileDependencyScopes, buildPathTrie, isKnownPath, ... */ } from './index.js';
// Careful: index.ts will import createCoreForm from engine.ts, so engine.ts must NOT
// import runtime values back from index.ts that create a circular import. Move the
// shared pure utility functions (deepClone, getNestedValue, setNestedValue, isDeepEqual,
// extractAllPaths, compileDependencyScopes, applyBuiltInRules, and the path-trie imports)
// into a new `src/utils.ts` module-scope-only file if a genuine circular-import problem
// surfaces here — check with `pnpm exec tsc --noEmit` after Step 1; NodeNext/ESM tolerates
// some circular imports for type-only references but not for runtime value imports used
// at module-init time, so resolve this concretely rather than assuming it's fine.

export interface FormEngineContext<T> { /* ...as defined in Task 6... */ }

export function createCoreForm<T extends object>(config: FormConfig<T>): {
  ctx: FormEngineContext<T>;
  instance: MinimalFormInstance<T>;
} {
  // ...ctx construction (from Task 6, with isComputedField/hasComputedFields/runComputedPass
  // at their NO-OP defaults — do NOT call attachComputedFields here), runValidation,
  // setFieldValue, notify/batch/dispatchAction, reset/resetField/destroy,
  // submit/handleSubmit/getState/getPayload/setErrors/clearErrors/watch/subscribeToPath/
  // isFieldValid/isFieldDirty/isDirty, _debug* accessors — all ctx.X-prefixed already
  // from Task 6...

  const instance: MinimalFormInstance<T> = {
    subscribe, subscribeToPath, subscribeToPathDynamic, get, set, validate,
    submit, handleSubmit, getState, getPayload, setDynamic, getDynamic,
    batch: batchPublic, // NOT `batch` — that name is the internal primitive on ctx, see Task 6
    reset, resetField, destroy, setErrors, clearErrors, getFieldMode,
    isDirty, isFieldDirty, isFieldValid, watch,
    _subscribeToActions, _debugPathIndex, _debugIndexKey, _debugUnindexKey, _debugRawState,
  };

  return { ctx, instance };
}
```

**Per the spec (confirmed, not revised): `attachComputedFields` is full-tier-only, matching the spec's explicit "excluding `attachComputedFields` from `minimal` means a minimal-tier form simply has no `computed` config option honored" and its documented silent-no-op requirement.** `createCoreForm` must NOT call `attachComputedFields` — it stays at the no-op hook defaults. `attachComputedFields(ctx, config)` is called only from `index.ts`'s `createForm` (Step 2 below), alongside `attachArrayOps`/`attachDomBridge`/`attachPersistence`. This corrects an earlier draft of this plan, which incorrectly called `attachComputedFields` unconditionally inside `createCoreForm` — that would have silently changed the spec's approved public API surface (computed fields working under `minimal`) without the spec being amended and re-reviewed. If a future spec revision decides computed-fields should work under both tiers, that requires its own spec amendment and adversarial review pass, not a decision made inside this implementation plan.

- [ ] **Step 2: Rewrite `index.ts` as the thin full-tier composition file**

```ts
// packages/core/src/index.ts (post-split — all type exports, adapters, and utils
// that were NOT part of createForm's closure body stay here unchanged: FormConfig,
// FormState, FormInstance, MinimalFormInstance, all the *Adapter functions,
// deepClone/getNestedValue/etc. utils, applyBuiltInRules and friends, flattenComputedConfig
// export if it's part of the public surface — check current exports list, lines 1-1023,
// before deleting anything; only createForm's body (1029-3027) and the module-scope
// _getPayload (3029-3046) leave this file)

import { createCoreForm } from './engine.js';
import { attachArrayOps } from './features/array-ops.js';
import { attachDomBridge } from './features/dom-bridge.js';
import { attachPersistence } from './features/persistence.js';
import { attachComputedFields } from './features/computed-fields.js';

export function createForm<T extends object>(config: FormConfig<T>): FormInstance<T> {
  const { ctx, instance } = createCoreForm(config);
  attachComputedFields(ctx, config); // full-tier only — minimal.ts never calls this
  // IMPORTANT: createCoreForm's own init-seed call to ctx.runComputedPass() (the former
  // line 1201) ran BEFORE this point, while the hook was still at its no-op default —
  // so under full mode it seeded nothing. Re-run it now that attachComputedFields has
  // installed the real implementation, or a form with computed fields configured will
  // render its initial values without them applied. This is NOT a redundant call.
  ctx.runComputedPass();
  const arrayOps = attachArrayOps(ctx);
  const domBridge = attachDomBridge(ctx, config);
  const { hydrate } = attachPersistence(ctx, config);
  return Object.assign(instance, arrayOps, domBridge, { hydrate }) as FormInstance<T>;
}
```

- [ ] **Step 3: Create `minimal.ts`**

```ts
// packages/core/src/minimal.ts
import { createCoreForm, type FormEngineContext } from './engine.js';
import type { FormConfig, MinimalFormInstance } from './index.js';

export function createForm<T extends object>(config: FormConfig<T>): MinimalFormInstance<T> {
  const { instance } = createCoreForm(config);
  return instance;
}
```

- [ ] **Step 4: Update `MinimalFormInstance`/`FormInstance` type definitions per the audit's §7 classification**

In `index.ts`'s type section, add `export interface MinimalFormInstance<T extends object> { /* the 24 minimal-tier members listed in the audit §7 */ }` and change `export interface FormInstance<T extends object> extends MinimalFormInstance<T> { /* the 10 full-tier-only members */ }`.

- [ ] **Step 5: Resolve any circular-import issue found in Step 1**

Run: `pnpm exec tsc --noEmit`. If a circular runtime-value-import error surfaces between `engine.ts` and `index.ts`, extract the pure utility functions (`deepClone`, `getNestedValue`, `setNestedValue`, `isDeepEqual`, `extractAllPaths`, `compileDependencyScopes`, `applyBuiltInRules`, `flattenComputedConfig`, path-trie re-exports) into a new `packages/core/src/utils.ts`, having both `engine.ts` and `index.ts` import from there instead of from each other. Re-run `tsc --noEmit` until clean.

- [ ] **Step 6: Run full core test suite**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run packages/core/test`
Expected: PASS, zero test changes needed (the "Full existing suite unmodified" requirement from the spec's Testing section item 1).

- [ ] **Step 7: Write `minimal.test.ts`**

```ts
// packages/core/test/minimal.test.ts
import { describe, it, expect } from 'vitest';
import { createForm } from '../src/minimal.js';

describe('minimal tier', () => {
  it('supports set/get/validate/subscribe/reset/submit', async () => {
    const form = createForm({ initialValues: { name: '' }, rules: { name: 'required' } });
    form.set('name', 'x', { touch: true });
    expect(form.get('name')).toBe('x');
    expect(await form.validate()).toBe(true);
    let payload: unknown;
    await form.submit(async (p) => { payload = p; });
    expect(payload).toEqual({ name: 'x' });
    form.reset();
    expect(form.get('name')).toBe('');
  });

  it('does not expose array-ops/dom-bridge/persistence methods at compile time', () => {
    const form = createForm({ initialValues: { items: [1, 2] } });
    // @ts-expect-error - arrayRemove does not exist on MinimalFormInstance
    form.arrayRemove('items', 0);
    // @ts-expect-error - connect does not exist on MinimalFormInstance
    form.connect('items');
    // @ts-expect-error - hydrate does not exist on MinimalFormInstance
    form.hydrate();
  });

  it('computed fields are a silent no-op under minimal (per spec: array-ops, dom-bridge, persistence, AND computed-fields are all excluded from minimal)', () => {
    const form = createForm({
      initialValues: { a: 1, b: 0 },
      computed: { b: { fn: (v: { a: number }) => v.a * 2 } },
    });
    // No error, no warning required — the config is silently accepted but not honored,
    // exactly as the spec's Public API surface section documents for the `computed` option.
    expect(form.get('b')).toBe(0);
    form.set('a', 5);
    expect(form.get('b')).toBe(0);
  });
});
```

- [ ] **Step 8: Run the new test file, including a `tsc --noEmit` pass to confirm the `@ts-expect-error` assertions are exercised correctly**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run packages/core/test/minimal.test.ts`
Expected: PASS. If any `@ts-expect-error` line does NOT actually error (meaning the method incorrectly exists on `MinimalFormInstance`), `tsc` reports an "unused `@ts-expect-error` directive" error — treat that as a real bug in the type split, not a test artifact, and fix the interface split before proceeding.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/engine.ts packages/core/src/index.ts packages/core/src/minimal.ts packages/core/test/minimal.test.ts
git commit -m "refactor(core): introduce engine.ts + minimal.ts entry point, complete the 5-file split"
```

---

### Task 13: Build/export wiring

**Files:**
- Modify: `packages/core/tsup.config.ts`, `packages/core/package.json`
- Create: `packages/alias/src/core-minimal.ts`
- Modify: `packages/alias/tsup.config.ts`, `packages/alias/package.json`, root `tsconfig.json`

- [ ] **Step 1: Update `packages/core/tsup.config.ts`**

Read the current `entry` array (currently `['src/index.ts', 'src/devtools.ts']`) and add `'src/minimal.ts'`:
```ts
entry: ['src/index.ts', 'src/minimal.ts', 'src/devtools.ts'],
```

- [ ] **Step 2: Update `packages/core/package.json`'s `exports` map**

Add a `"./minimal"` entry mirroring the existing `"./devtools"` entry's exact shape (read the current `"./devtools"` entry first to match its `types`/`import`/`require` key ordering and path convention precisely):
```json
"./minimal": {
  "types": "./dist/minimal.d.ts",
  "import": "./dist/minimal.js",
  "require": "./dist/minimal.cjs"
}
```

- [ ] **Step 3: Create `packages/alias/src/core-minimal.ts`**

Read `packages/alias/src/core.ts` first to match its exact re-export pattern, then write:
```ts
export * from '@neutro/form-core/minimal';
```

- [ ] **Step 4: Update `packages/alias/tsup.config.ts`**

Add `'core/minimal': 'src/core-minimal.ts'` to the `entry` object (matching however the existing `'core': 'src/core.ts'` entry is keyed).

- [ ] **Step 5: Update `packages/alias/package.json`'s `exports` map**

Add `"./core/minimal"` mirroring the existing `"./core"` entry's exact shape.

- [ ] **Step 6: Update root `tsconfig.json` path mapping**

Add `"@neutro/form/core/minimal": ["packages/core/src/minimal.ts"]` alongside the existing `"@neutro/form/core"` mapping, for local-dev path resolution. **Also add `"@neutro/form-core/minimal": ["packages/core/src/minimal.ts"]`** — `tsconfig.json`'s `paths` already has separate entries for both `@neutro/form-core` and `@neutro/form/core` (two different specifiers pointing at the same source), plus `@neutro/form-core/devtools`; the new minimal entry point needs the same both-specifier treatment, not just the `@neutro/form/core/...` one, since Step 8's test imports `@neutro/form-core/minimal` specifically.

- [ ] **Step 6b: Update `vitest.config.ts`'s alias resolution (found in round-3 review)**

`vitest.config.ts` resolves `@neutro/form-core` via a `@rollup/plugin-alias`-style entry pointing at `packages/core/src/index.ts` (matched as a `^<find>(/|$)` prefix pattern). Because of this prefix-matching behavior, an import of `@neutro/form-core/minimal` would currently match the existing `@neutro/form-core` entry and rewrite to the nonsensical path `packages/core/src/index.ts/minimal`, NOT resolve to `minimal.ts`. Add a new alias entry `'@neutro/form-core/minimal': resolve(__dirname, 'packages/core/src/minimal.ts')`, placed BEFORE the general `@neutro/form-core` entry in the alias array/list (first-match-wins ordering matters here — placing it after would never be reached). Without this, Step 8's test cannot resolve under Vitest regardless of what `tsconfig.json`/`package.json` say.

- [ ] **Step 7: Full build verification**

Run: `pnpm build`
Expected: succeeds, and `packages/core/dist/minimal.js`/`.cjs`/`.d.ts` and `packages/alias/dist/core-minimal.js` (or equivalent output naming — check actual tsup output naming convention against the existing `core.js` output) all exist.

Run: `ls packages/core/dist/ packages/alias/dist/` and confirm the new files are present.

- [ ] **Step 8: Verify the public import path actually works end-to-end**

Write a throwaway smoke-test script (not committed) importing `@neutro/form/core/minimal` from outside the monorepo's `src` (e.g. a temp file under `/tmp` or the scratchpad dir that does `import { createForm } from '@neutro/form/core/minimal'; console.log(typeof createForm);` compiled/run against `packages/alias/dist`), OR add a proper committed test — prefer adding it as a real test:

Create `packages/core/test/minimal-entry-resolution.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createForm } from '@neutro/form-core/minimal';

describe('minimal entry point resolves via package exports', () => {
  it('createForm is a function', () => {
    expect(typeof createForm).toBe('function');
  });
});
```
This test resolves via the Vitest alias added in Step 6b (source-level, `packages/core/src/minimal.ts`), the same way every other core test in this repo resolves `@neutro/form-core` — it is a source-level smoke test confirming the module graph wires up correctly, NOT a verification of the built `dist`/`exports` map. Rename the `describe` block to `'minimal entry point resolves via source alias'` to avoid the misleading implication that it exercises the package's published `exports` field (Steps 1-2 and 7 already cover the built-output verification separately via `ls`).

- [ ] **Step 9: Commit**

```bash
git add packages/core/tsup.config.ts packages/core/package.json packages/alias/src/core-minimal.ts packages/alias/tsup.config.ts packages/alias/package.json tsconfig.json packages/core/test/minimal-entry-resolution.test.ts
git commit -m "build(core,alias): add @neutro/form/core/minimal entry point"
```

---

### Task 14: Bundle-size fixture

**Files:**
- Create: `bench/fixtures/bundle/neutro-minimal.ts`
- Modify: whatever bench script currently reads `bench/fixtures/bundle/neutro.ts` and reports a `neutro/form (full)` row (locate via `grep -rl "neutro.ts" bench/scripts/` or similar) to add a parallel `neutro/form (minimal)` row.

- [ ] **Step 1: Read the existing `bench/fixtures/bundle/neutro.ts` fixture**

Run: `cat bench/fixtures/bundle/neutro.ts` (or Read tool) to see its exact shape (which methods it calls, how it's structured for the bundler to measure).

- [ ] **Step 2: Create the minimal fixture, mirroring it exactly but importing from the minimal entry point**

```ts
// bench/fixtures/bundle/neutro-minimal.ts
import { createForm } from '@neutro/form/core/minimal';

const form = createForm({ initialValues: { name: '', email: '' } });
form.set('name', 'test');
form.get('name');
form.validate();
```
(Match whatever exact set of calls the existing `neutro.ts` fixture makes, minus any array-ops/connect/hydrate calls it might include — if the existing fixture already only calls `set`/`get`/`validate`, this is a straight copy with the import path changed.)

- [ ] **Step 3: Wire it into the bundle-size measurement script**

Locate the script that measures `neutro.ts` and produces the `neutro/form (full)` row (likely under `bench/scripts/` — search for `bundle-size` or `esbuild`). Add a second measurement entry for `neutro-minimal.ts` producing a `neutro/form (minimal)` row in the same output table/JSON.

- [ ] **Step 4: Run the bundle-size suite and confirm both rows appear**

Run: `pnpm --dir bench <whatever the bundle-size script command is — check bench/package.json>`
Expected: output includes both `neutro/form (full)` and `neutro/form (minimal)` rows, with the minimal row's byte count meaningfully smaller.

- [ ] **Step 5: Commit**

```bash
git add bench/fixtures/bundle/neutro-minimal.ts bench/scripts/
git commit -m "bench(bundle-size): add neutro/form (minimal) fixture and measurement row"
```

---

### Task 15: Documentation

**Files:**
- Create: `docs/guides/bundle-size-tiers.md`
- Modify: `docs/.vitepress/config.ts` (add the new guide to the sidebar/nav)
- Modify: relevant FAQ page (locate existing FAQ doc under `docs/` via `grep -rl "FAQ" docs/`)
- Modify: `packages/core/src/index.ts`/`minimal.ts` (inline JSDoc on `createForm` exports)
- Modify: root `README.md` and/or `packages/core/README.md` if bundle-size claims are stated there

- [ ] **Step 1: Write `docs/guides/bundle-size-tiers.md`**

Cover: what `minimal` is, the four excluded clusters exactly as the spec states (array ops, DOM bridge, persistence, computed fields — per Task 12's explicit correction, computed-fields stays full-tier-only, matching the spec's original approved framing; do not describe it as included in minimal), why those four specifically, and the one-line upgrade path. Give computed-fields' silent no-op the same documentation prominence as persistence's, per the spec's Risks section.

- [ ] **Step 2: Add the guide to VitePress nav**

Read `docs/.vitepress/config.ts`'s existing sidebar structure and add an entry for the new guide page in the same section as other feature guides (e.g. near `computed-fields.md`/`vue.md`, per the existing sidebar grouping).

- [ ] **Step 3: Add the FAQ entry**

Find the existing FAQ doc, add the "Which import should I use?" decision tree per the spec's wording.

- [ ] **Step 4: Add inline JSDoc to both `createForm` exports**

In `packages/core/src/index.ts`, above `export function createForm<T extends object>(...)`:
```ts
/**
 * Only need set/get/validate/subscribe? `@neutro/form/core/minimal` ships a smaller bundle.
 */
```
In `packages/core/src/minimal.ts`, above its `createForm`:
```ts
/**
 * Need array operations, DOM binding, persistence, or computed fields? Import from
 * `@neutro/form/core` instead — it's a drop-in superset.
 */
```

- [ ] **Step 5: Update README bundle-size claims if present**

Run: `grep -rn "bundle" README.md packages/core/README.md 2>/dev/null` — if either file states a single bundle-size number, update to present it per-tier.

- [ ] **Step 6: Build docs and spot-check**

Run: `pnpm docs:build`
Expected: succeeds with no broken links to the new guide page.

- [ ] **Step 7: Commit**

```bash
git add docs/guides/bundle-size-tiers.md docs/.vitepress/config.ts packages/core/src/index.ts packages/core/src/minimal.ts README.md
git commit -m "docs: document the minimal bundle tier (guide, FAQ, inline JSDoc)"
```

---

### Task 16: Adapter compatibility verification

**Files:**
- Read-only: `packages/adapters/*/src/index.ts` (React, Vue, Svelte, Solid, Angular)

- [ ] **Step 1: Grep each adapter for DOM-bridge/array-op/persistence method usage**

Run: `grep -n "\.connect(\|\.arrayAppend(\|\.arrayInsert(\|\.arrayRemove(\|\.arrayMove(\|\.arraySwap(\|\.hydrate(\|\.focus(\|\.focusFirstError(\|\.getAriaProps(\|\.getConnectedCount(" packages/adapters/*/src/index.ts`

- [ ] **Step 2: Record findings**

Confirm (or correct) the spec's non-goal assumption that all five adapters require the full `@neutro/form/core` tier. If any adapter turns out to only use `MinimalFormInstance`-compatible methods, note this as a fact for a future spec (per the spec's explicit statement this isn't a reason to change scope now) — no code change needed either way, this task is a verification-only checkpoint.

- [ ] **Step 3: No commit needed unless findings warrant a follow-up note**

If an adapter is found to be minimal-compatible, add a one-line note to `docs/superpowers/specs/2026-07-03-modular-bundle-splitting-api-design.md`'s Risks section recording the finding for future reference, and commit that doc-only change:
```bash
git add docs/superpowers/specs/2026-07-03-modular-bundle-splitting-api-design.md
git commit -m "docs(specs): record adapter compatibility verification finding"
```

---

### Task 17: Full pipeline sweep and whole-branch review

**Files:** none (verification-only)

- [ ] **Step 1: Run the complete pre-push checklist**

Run: `pnpm lint && pnpm exec tsc --noEmit && pnpm build && pnpm test`
Expected: all green.

- [ ] **Step 2: Rebuild bench packages per the established `feedback_bench_full_rebuild` lesson**

Run: `pnpm build` (full monorepo, not just `--filter @neutro/form-core`) before trusting any bench numbers from Task 14.

- [ ] **Step 3: Independent whole-branch review**

A fresh reviewer (who did not implement Tasks 1-16) re-reads the full diff against the spec's Risks section point by point: mutation-invariant conversion completeness (re-grep, don't trust Task 7's sign-off alone — do a second independent grep), `onReset` guard preservation, `getPayload`/`submit` fallback behavior, extension-point hook correctness under both tiers, silent-no-op documentation completeness (computed-fields IS silently no-op under minimal, matching the spec's original four-cluster-exclusion framing exactly — Task 12 explicitly corrected an earlier draft that had this backwards; verify `attachComputedFields` is never called from `createCoreForm`/`minimal.ts`, only from `index.ts`), compile-time failure mode (re-run the `minimal.test.ts` `@ts-expect-error` checks), and bundle-size fixture honesty (both rows reported, not just the flattering one).

- [ ] **Step 4: Fix any findings, re-run Step 1, and record completion**

If findings surface, fix them following the same task-sized commit discipline as Tasks 1-16, then re-run the full pipeline sweep until clean.

- [ ] **Step 5: Update release-gate memory**

Once green, update the project memory `project_v050_release_gate` marking item 2 (modular bundle splitting) as RESOLVED, following the same format used for item 1, including: file split summary, any real bugs found during implementation/review, and confirmation that local main remains unpushed to origin (per the standing instruction from item 1) unless the user has since said otherwise.
