# Shadow Prefix Index for shiftStateIndices/rekeyArrayState/arraySwap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the O(total-form-state) `Object.keys().forEach()` scans in `shiftStateIndices`, `rekeyArrayState`, and `arraySwap` with O(state-under-this-array) lookups against a refcounted shadow index, without changing any observable behavior.

**Architecture:** Add one new closure-scoped structure, `pathIndex: Map<string, Map<string, number>>`, to `createForm` in `packages/core/src/index.ts`. Every existing write/delete of `errors`/`touched`/`dirty`/`wasSet`/`validatedPaths`/`pathSubscribers` is paired with an `indexKey`/`unindexKey` call that maintains, for every ancestor prefix of a tracked key, a refcounted set of full keys living under that prefix. The three array-shift functions then look up `pathIndex.get(basePath)` instead of scanning the whole state.

**Tech Stack:** TypeScript, Vitest (unit + fuzz tests), the existing `bench/` Vitest-bench suite for the before/after benchmark.

**Reference:** Design spec `docs/superpowers/specs/2026-07-03-shift-state-indices-prefix-index-design.md` (3 adversarial review rounds + 1 focused follow-up review; confirmed implementable as written, including the plan-time-discovered `reindexErrors` addition for `runValidation`'s wholesale `errors` reassignment).

## Global Constraints

- All relative imports inside `packages/` must use `.js` extensions (NodeNext) — this plan only adds code to `packages/core/src/index.ts`, an existing file, so no new import statements are needed for the core changes. Test files under `packages/core/test/` import via `'../src/index'` (no extension), matching the existing convention in `form.test.ts`.
- Every step that edits `packages/core/src/index.ts` must be followed by `pnpm exec tsc --noEmit` (or scoped to core: `pnpm --filter @neutro/form-core exec tsc --noEmit`) before committing — this file is large and easy to break with a stray brace.
- No change in this plan may alter observable behavior (values, errors, notifications, subscriptions). Every task's "Run tests" step must show the **existing** `form.test.ts` suite still passing, not just new tests.
- Per the spec's Non-goals: do not touch `notify()`, `compileDependencyScopes`, `getPayload()`, or restructure the six tracked structures' representation. Only add `pathIndex`/`indexKey`/`unindexKey`/`reindexErrors` and change how the three shift functions *enumerate* candidates.
- Commit after every task (not every step) — each task is one reviewable, revertable unit.

---

## Task 1: Core `pathIndex` data structure, `indexKey`/`unindexKey`/`reindexErrors` helpers, and a debug accessor

This task adds the new machinery in isolation — nothing calls `indexKey`/`unindexKey` yet, so this task cannot desync anything. It also adds `_debugPathIndex()`, an internal (underscore-prefixed, following the existing `_subscribeToActions` convention) accessor used only by tests to inspect `pathIndex` directly.

**Files:**
- Modify: `packages/core/src/index.ts:1027` (add `pathIndex` next to `validatedPaths`), `packages/core/src/index.ts:1519` area (add helpers near `mergeScopedErrors`), `packages/core/src/index.ts:286` (add to `FormInstance` interface), `packages/core/src/index.ts:2767` area (add to the returned instance object, next to `_subscribeToActions`)
- Test: `packages/core/test/path-index.test.ts` (new file)

**Interfaces:**
- Produces: `pathIndex: Map<string, Map<string, number>>` (closure variable), `indexKey(key: string): void`, `unindexKey(key: string): void`, `reindexErrors(oldErrors: Record<string, string>, newErrors: Record<string, string>): void` — all closure-scoped in `createForm`, not exported from the module. Later tasks call these by name from within the same closure.
- Produces on `FormInstance<T>`: `_debugPathIndex: () => Map<string, Set<string>>` — test-only, returns a snapshot with refcounts stripped (just the key sets) since tests only need to assert membership, not refcount internals directly (refcount behavior is verified through indexKey/unindexKey call sequences in this task's own unit tests via a second debug hook).
- Produces on `FormInstance<T>`: `_debugIndexKey: (key: string) => void` and `_debugUnindexKey: (key: string) => void` — thin test-only wrappers around the closure helpers, so this task's unit tests can exercise `indexKey`/`unindexKey` directly without waiting for Tasks 2–9 to wire them into real call sites.

- [ ] **Step 1: Add the `pathIndex` structure next to the other tracked state**

In `packages/core/src/index.ts`, find line 1028 (`const validatedPaths = new Set<string>();`) and add immediately after it:

```ts
  const validatedPaths = new Set<string>();
  // Refcounted shadow index: maps every ancestor prefix of a tracked key (from
  // errors/touched/dirty/wasSet/validatedPaths/pathSubscribers) to a Map of
  // (full key -> number of those six structures currently holding that key).
  // Lets shiftStateIndices/rekeyArrayState/arraySwap look up "what state exists
  // under this array" in O(state under the array) instead of scanning all
  // tracked state. See docs/superpowers/specs/2026-07-03-shift-state-indices-prefix-index-design.md.
  const pathIndex = new Map<string, Map<string, number>>();
```

- [ ] **Step 2: Add `indexKey`, `unindexKey`, `reindexErrors` helpers**

Find `mergeScopedErrors` (currently at line 1519, right before `setFieldValue`). Add the three helpers immediately before it:

```ts
  const indexKey = (key: string) => {
    const segments = key.split('.');
    let prefix = segments[0];
    for (let i = 1; i < segments.length; i++) {
      let counts = pathIndex.get(prefix);
      if (!counts) {
        counts = new Map();
        pathIndex.set(prefix, counts);
      }
      counts.set(key, (counts.get(key) ?? 0) + 1);
      prefix = `${prefix}.${segments[i]}`;
    }
  };

  const unindexKey = (key: string) => {
    const segments = key.split('.');
    let prefix = segments[0];
    for (let i = 1; i < segments.length; i++) {
      const counts = pathIndex.get(prefix);
      if (counts) {
        const next = (counts.get(key) ?? 1) - 1;
        if (next <= 0) counts.delete(key);
        else counts.set(key, next);
        if (counts.size === 0) pathIndex.delete(prefix);
      }
      prefix = `${prefix}.${segments[i]}`;
    }
  };

  // Diff-based reindex for structures that get wholesale-reassigned rather than
  // mutated key-by-key (currently only runValidation's `errors` reassignment).
  const reindexErrors = (oldErrors: Record<string, string>, newErrors: Record<string, string>) => {
    for (const key of Object.keys(oldErrors)) {
      if (!(key in newErrors)) unindexKey(key);
    }
    for (const key of Object.keys(newErrors)) {
      if (!(key in oldErrors)) indexKey(key);
    }
  };

  const mergeScopedErrors = (
```

- [ ] **Step 3: Add the debug accessors to `FormInstance<T>` and the returned instance**

In the `FormInstance<T>` interface, find line 285 (`_subscribeToActions: (fn: (action: FormAction, state: FormState<T>) => void) => () => void;`) and add after it:

```ts
  _subscribeToActions: (fn: (action: FormAction, state: FormState<T>) => void) => () => void;
  /** @internal test-only accessor for pathIndex membership. Not part of the stable public API. */
  _debugPathIndex: () => Map<string, Set<string>>;
  /** @internal test-only direct access to indexKey. Not part of the stable public API. */
  _debugIndexKey: (key: string) => void;
  /** @internal test-only direct access to unindexKey. Not part of the stable public API. */
  _debugUnindexKey: (key: string) => void;
  /**
   * @internal test-only snapshot of the SIX TRACKED STRUCTURES THEMSELVES
   * (not pathIndex) — used as an independent ground truth in tests, since
   * asserting against _debugPathIndex alone only proves the index is
   * internally consistent with itself, not that it matches the real
   * errors/touched/dirty/wasSet/validatedPaths/pathSubscribers state.
   * Not part of the stable public API.
   */
  _debugRawState: () => {
    errors: Record<string, string>;
    touched: Record<string, boolean>;
    dirty: Record<string, boolean>;
    wasSet: Record<string, boolean>;
    validatedPaths: string[];
    pathSubscriberKeys: string[];
  };
}
```

In the returned instance object, find `_subscribeToActions` (currently at line 2762) and add after its closing `},`:

```ts
    _subscribeToActions: (fn) => {
      actionListeners.add(fn);
      return () => {
        actionListeners.delete(fn);
      };
    },

    _debugPathIndex: () => {
      const snapshot = new Map<string, Set<string>>();
      for (const [prefix, counts] of pathIndex) {
        snapshot.set(prefix, new Set(counts.keys()));
      }
      return snapshot;
    },
    _debugIndexKey: (key: string) => indexKey(key),
    _debugUnindexKey: (key: string) => unindexKey(key),
    _debugRawState: () => ({
      errors: { ...errors },
      touched: { ...touched },
      dirty: { ...dirty },
      wasSet: { ...wasSet },
      validatedPaths: [...validatedPaths],
      pathSubscriberKeys: [...pathSubscribers.keys()],
    }),
```

- [ ] **Step 4: Type-check**

Run: `pnpm --filter @neutro/form-core exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Write the unit tests**

Create `packages/core/test/path-index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createForm } from '../src/index';

function candidates(form: ReturnType<typeof createForm>, prefix: string): string[] {
  return Array.from(form._debugPathIndex().get(prefix) ?? []).sort();
}

describe('pathIndex — indexKey/unindexKey', () => {
  it('indexes a key under every ancestor prefix, not under itself', () => {
    const form = createForm({ initialValues: {} });
    form._debugIndexKey('items.3.address.city');
    expect(candidates(form, 'items')).toEqual(['items.3.address.city']);
    expect(candidates(form, 'items.3')).toEqual(['items.3.address.city']);
    expect(candidates(form, 'items.3.address')).toEqual(['items.3.address.city']);
    expect(form._debugPathIndex().has('items.3.address.city')).toBe(false);
  });

  it('a top-level key with no dot is never indexed', () => {
    const form = createForm({ initialValues: {} });
    form._debugIndexKey('name');
    expect(form._debugPathIndex().size).toBe(0);
  });

  it('unindexKey removes a key with refcount 1 from every ancestor prefix', () => {
    const form = createForm({ initialValues: {} });
    form._debugIndexKey('items.3.city');
    form._debugUnindexKey('items.3.city');
    expect(form._debugPathIndex().has('items')).toBe(false);
    expect(form._debugPathIndex().has('items.3')).toBe(false);
  });

  it('a key indexed twice (shared by two structures) survives one unindex', () => {
    const form = createForm({ initialValues: {} });
    form._debugIndexKey('items.3.city'); // e.g. errors
    form._debugIndexKey('items.3.city'); // e.g. pathSubscribers
    form._debugUnindexKey('items.3.city'); // errors cleared
    expect(candidates(form, 'items')).toEqual(['items.3.city']); // still held by pathSubscribers
    form._debugUnindexKey('items.3.city'); // pathSubscribers cleared too
    expect(form._debugPathIndex().has('items')).toBe(false);
  });

  it('an empty prefix map is removed once its last key is unindexed', () => {
    const form = createForm({ initialValues: {} });
    form._debugIndexKey('a.b');
    form._debugIndexKey('a.c');
    expect(form._debugPathIndex().has('a')).toBe(true);
    form._debugUnindexKey('a.b');
    expect(form._debugPathIndex().has('a')).toBe(true); // "a.c" still there
    form._debugUnindexKey('a.c');
    expect(form._debugPathIndex().has('a')).toBe(false);
  });

  it('unindexKey on a never-indexed key is a safe no-op', () => {
    const form = createForm({ initialValues: {} });
    expect(() => form._debugUnindexKey('never.indexed')).not.toThrow();
    expect(form._debugPathIndex().size).toBe(0);
  });
});
```

- [ ] **Step 6: Run the new tests**

Run: `pnpm exec vitest run packages/core/test/path-index.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 7: Run the full existing suite to confirm no regression**

Run: `pnpm exec vitest run packages/core`
Expected: all existing tests still PASS (this task adds inert code paths only).

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/path-index.test.ts
git commit -m "feat(core): add refcounted pathIndex shadow index scaffolding

Adds indexKey/unindexKey/reindexErrors helpers and a pathIndex structure,
unused by any call site yet. Debug accessors (_debugPathIndex etc.) let
tests inspect the index directly. Part of the shiftStateIndices O(n) fix
(v0.5.0 release-gate item 1)."
```

---

## Task 2: Wire `indexKey`/`unindexKey` into `wasSet` write/delete sites

**Files:**
- Modify: `packages/core/src/index.ts` lines 1549, 2374, 2398, 2427, 2453 (writes), 2621 (delete, inside `resetField`)

**Interfaces:**
- Consumes: `indexKey`, `unindexKey` from Task 1.

- [ ] **Step 1: Write a failing behavioral test**

Add to `packages/core/test/path-index.test.ts`:

```ts
describe('pathIndex — wasSet call sites', () => {
  it('setFieldValue indexes wasSet writes under the field prefix', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.set('items.0.name', 'b');
    expect(candidates(form, 'items')).toContain('items.0.name');
  });

  it('resetField unindexes wasSet entries for the reset field', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.set('items.0.name', 'b');
    form.resetField('items.0.name' as any);
    expect(candidates(form, 'items')).not.toContain('items.0.name');
  });

  it('arrayInsert/arrayRemove/arrayMove/arraySwap index the array root wasSet key', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }, { name: 'b' }] } });
    form.arrayInsert('items' as any, 1, { name: 'c' } as any);
    expect(candidates(form, 'items')).toContain('items'); // wasSet['items'] = true is indexed... 
  });
});
```

Note on the third test: `wasSet['items'] = true` (the array's own root key) has no dot, so it is **not** indexed by design (top-level-under-nothing keys are excluded — but `'items'` here IS the `basePath` itself, with no further ancestor). Replace that assertion with a direct check that the write didn't throw and `wasSet` state is correct via the public API instead:

```ts
  it('arrayInsert marks the array root as wasSet without desyncing pathIndex', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }, { name: 'b' }] } });
    expect(() => form.arrayInsert('items' as any, 1, { name: 'c' } as any)).not.toThrow();
    expect(form.isFieldDirty('items' as any)).toBe(true);
  });
```

- [ ] **Step 2: Run to verify the first two tests fail**

Run: `pnpm exec vitest run packages/core/test/path-index.test.ts`
Expected: "setFieldValue indexes wasSet writes..." and "resetField unindexes wasSet..." FAIL (pathIndex has no entries yet since nothing calls indexKey for wasSet); the arrayInsert test PASSES already (it doesn't depend on indexing).

- [ ] **Step 3: Wire `indexKey` into `setFieldValue`'s wasSet write**

Line 1549, inside `setFieldValue`:

```ts
    wasSet[path] = true;
```

becomes:

```ts
    wasSet[path] = true;
    indexKey(path);
```

- [ ] **Step 4: Wire `indexKey` into the four array-op wasSet writes**

Lines 2374 (`arrayInsert`), 2398 (`arrayRemove`), 2427 (`arrayMove`), 2453 (`arraySwap`) all currently read:

```ts
      wasSet[targetPath] = true;
```

Change each to:

```ts
      wasSet[targetPath] = true;
      indexKey(targetPath);
```

- [ ] **Step 5: Wire `unindexKey` into `resetField`'s wasSet delete loop**

Line 2620–2622, inside `resetField`:

```ts
          for (const k of Object.keys(wasSet)) {
            if (k === targetPath || k.startsWith(`${targetPath}.`)) delete wasSet[k];
          }
```

becomes:

```ts
          for (const k of Object.keys(wasSet)) {
            if (k === targetPath || k.startsWith(`${targetPath}.`)) {
              delete wasSet[k];
              unindexKey(k);
            }
          }
```

- [ ] **Step 6: Type-check**

Run: `pnpm --filter @neutro/form-core exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Run tests**

Run: `pnpm exec vitest run packages/core/test/path-index.test.ts`
Expected: all tests PASS.

Run: `pnpm exec vitest run packages/core`
Expected: full existing suite still PASSES.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/path-index.test.ts
git commit -m "feat(core): index wasSet write/delete sites into pathIndex"
```

---

## Task 3: Wire `indexKey`/`unindexKey` into `dirty` write/delete sites

**Files:**
- Modify: `packages/core/src/index.ts` lines 1555–1556 (conditional write/delete in `setFieldValue`), 1601 (MutationObserver DOM-pruning delete), 2617–2619 (resetField delete loop)

**Interfaces:**
- Consumes: `indexKey`, `unindexKey` from Task 1.

- [ ] **Step 1: Write failing tests**

Add to `packages/core/test/path-index.test.ts`:

```ts
describe('pathIndex — dirty call sites', () => {
  it('setFieldValue indexes a dirty write', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.set('items.0.name', 'changed');
    expect(candidates(form, 'items')).toContain('items.0.name');
  });

  it('setting a value back to its initial value deletes dirty and unindexes it', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.set('items.0.name', 'changed');
    form.set('items.0.name', 'a'); // back to initial -> dirty[path] deleted
    // wasSet still holds 'items.0.name' (Task 2), so the key must still be indexed —
    // this exercises the refcount, not a full eviction.
    expect(candidates(form, 'items')).toContain('items.0.name');
  });

  it('resetField unindexes dirty entries for the reset field', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.set('items.0.name', 'changed');
    form.resetField('items.0.name' as any);
    expect(candidates(form, 'items')).not.toContain('items.0.name');
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `pnpm exec vitest run packages/core/test/path-index.test.ts`
Expected: the 3 new tests FAIL.

- [ ] **Step 3: Wire `setFieldValue`'s dirty write/delete**

Lines 1554–1556:

```ts
      const initialVal = getNestedValue(initialValues, path);
      dirty[path] = !isDeepEqual(initialVal, val);
      if (!dirty[path]) delete dirty[path];
```

becomes:

```ts
      const initialVal = getNestedValue(initialValues, path);
      dirty[path] = !isDeepEqual(initialVal, val);
      if (!dirty[path]) {
        delete dirty[path];
        unindexKey(path);
      } else {
        indexKey(path);
      }
```

- [ ] **Step 4: Wire the MutationObserver DOM-pruning dirty delete**

Line 1601, inside `initMutationObserver`'s removed-node handler:

```ts
              if (!persistedPaths.has(path)) {
                delete errors[path];
                delete touched[path];
                delete dirty[path];
                clearedPaths.push(path);
              }
```

becomes (this step only touches the `dirty` line; `errors`/`touched` are handled in Tasks 4/5):

```ts
              if (!persistedPaths.has(path)) {
                delete errors[path];
                delete touched[path];
                delete dirty[path];
                unindexKey(path);
                clearedPaths.push(path);
              }
```

Note: this single `unindexKey(path)` call covers all three deletes (`errors`, `touched`, `dirty`) that happen together for the same `path` in this block — but per the Task 1 invariant ("every write/delete of a tracked key pairs with exactly one indexKey/unindexKey call, independent of what other structures hold that key"), each structure's deletion needs its own paired call. Since all three deletes happen unconditionally together here, calling `unindexKey(path)` three times (once per structure actually holding it) is correct; calling it once would under-decrement the refcount if `path` is indexed by more than one of these three structures. Replace the single call with three:

```ts
              if (!persistedPaths.has(path)) {
                delete errors[path];
                unindexKey(path);
                delete touched[path];
                unindexKey(path);
                delete dirty[path];
                unindexKey(path);
                clearedPaths.push(path);
              }
```

This task only implements the `dirty`-related third call for now; Tasks 4 and 5 will add the `touched`/`errors` calls at this same site (see their steps) — implement all three together in this task since they're in the same code block and splitting them across tasks would leave the block in an inconsistent intermediate state. Apply the full three-call version now.

- [ ] **Step 5: Wire `resetField`'s dirty delete loop**

Lines 2616–2619:

```ts
        if (!options?.keepDirty) {
          for (const k of Object.keys(dirty)) {
            if (k === targetPath || k.startsWith(`${targetPath}.`)) delete dirty[k];
          }
```

becomes:

```ts
        if (!options?.keepDirty) {
          for (const k of Object.keys(dirty)) {
            if (k === targetPath || k.startsWith(`${targetPath}.`)) {
              delete dirty[k];
              unindexKey(k);
            }
          }
```

- [ ] **Step 6: Type-check, then run tests**

Run: `pnpm --filter @neutro/form-core exec tsc --noEmit` — expect no errors.
Run: `pnpm exec vitest run packages/core/test/path-index.test.ts` — expect all PASS.
Run: `pnpm exec vitest run packages/core` — expect full suite PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/path-index.test.ts
git commit -m "feat(core): index dirty write/delete sites and DOM-pruning deletes into pathIndex"
```

---

## Task 4: Wire `indexKey`/`unindexKey` into `touched` write/delete sites

**Files:**
- Modify: `packages/core/src/index.ts` lines 1557 (`setFieldValue`), 1600 (DOM-pruning, already partially done in Task 3's Step 4 — confirm the `touched` call is present), 2016 (`connect()` blur handler), 2089 (`submit()`), 2187 (`setErrors`), 2613 (`resetField`)

**Interfaces:**
- Consumes: `indexKey`, `unindexKey` from Task 1.

- [ ] **Step 1: Write failing tests**

Add to `packages/core/test/path-index.test.ts`:

```ts
describe('pathIndex — touched call sites', () => {
  it('setFieldValue with touch:true indexes the touched write', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.set('items.0.name', 'b', { touch: true });
    expect(candidates(form, 'items')).toContain('items.0.name');
  });

  it('submit() marks every path touched and indexes them', async () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    await form.submit(() => {});
    expect(candidates(form, 'items')).toContain('items.0.name');
  });

  it('resetField unindexes touched entries for the reset field', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.set('items.0.name', 'b', { touch: true });
    form.resetField('items.0.name' as any);
    expect(candidates(form, 'items')).not.toContain('items.0.name');
  });

  it('setErrors touching paths indexes them', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.setErrors({ 'items.0.name': 'bad' });
    expect(candidates(form, 'items')).toContain('items.0.name');
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `pnpm exec vitest run packages/core/test/path-index.test.ts`
Expected: the 4 new tests FAIL.

- [ ] **Step 3: Wire `setFieldValue`'s touched write**

Line 1557:

```ts
      if (options.touch) touched[path] = true;
```

becomes:

```ts
      if (options.touch) {
        touched[path] = true;
        indexKey(path);
      }
```

- [ ] **Step 4: Confirm the DOM-pruning `touched` call from Task 3**

Task 3, Step 4 already changed this block to call `unindexKey(path)` after each of the three deletes (`errors`, `touched`, `dirty`). No further change needed here — this step is a verification checkpoint, not a new edit. Read `packages/core/src/index.ts` around line 1595–1608 and confirm it matches:

```ts
              if (!persistedPaths.has(path)) {
                delete errors[path];
                unindexKey(path);
                delete touched[path];
                unindexKey(path);
                delete dirty[path];
                unindexKey(path);
                clearedPaths.push(path);
              }
```

- [ ] **Step 5: Wire `connect()`'s blur handler**

Line 2016 (inside `handleBlur`):

```ts
      touched[stringPath] = true;
```

becomes:

```ts
      touched[stringPath] = true;
      indexKey(stringPath);
```

- [ ] **Step 6: Wire `submit()`'s bulk touched loop**

Lines 2088–2090:

```ts
    extractAllPaths(values).forEach((p) => {
      touched[p] = true;
    });
```

becomes:

```ts
    extractAllPaths(values).forEach((p) => {
      touched[p] = true;
      indexKey(p);
    });
```

- [ ] **Step 7: Wire `setErrors`'s touched loop**

Line 2187:

```ts
    for (const p of paths) touched[p] = true;
```

becomes:

```ts
    for (const p of paths) {
      touched[p] = true;
      indexKey(p);
    }
```

- [ ] **Step 8: Wire `resetField`'s touched delete loop**

Lines 2611–2614:

```ts
        if (!options?.keepTouched) {
          for (const k of Object.keys(touched)) {
            if (k === targetPath || k.startsWith(`${targetPath}.`)) delete touched[k];
          }
        }
```

becomes:

```ts
        if (!options?.keepTouched) {
          for (const k of Object.keys(touched)) {
            if (k === targetPath || k.startsWith(`${targetPath}.`)) {
              delete touched[k];
              unindexKey(k);
            }
          }
        }
```

- [ ] **Step 9: Type-check, then run tests**

Run: `pnpm --filter @neutro/form-core exec tsc --noEmit` — expect no errors.
Run: `pnpm exec vitest run packages/core/test/path-index.test.ts` — expect all PASS.
Run: `pnpm exec vitest run packages/core` — expect full suite PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/path-index.test.ts
git commit -m "feat(core): index touched write/delete sites into pathIndex"
```

---

## Task 5: Wire `indexKey`/`unindexKey` into `errors` single-key sites, and `reindexErrors` into `runValidation`'s wholesale reassignments

**Files:**
- Modify: `packages/core/src/index.ts` lines 1476, 1486, 1489–1491 (`runValidation` wholesale reassignment — use `reindexErrors`), 1599 (DOM-pruning, already handled in Task 3 Step 4 — verification only), 2185 (`setErrors`), 2197 (`clearErrors`), 2608 (`resetField`)

**Interfaces:**
- Consumes: `indexKey`, `unindexKey`, `reindexErrors` from Task 1.

- [ ] **Step 1: Write failing tests**

Add to `packages/core/test/path-index.test.ts`:

```ts
describe('pathIndex — errors call sites', () => {
  it('setErrors indexes the error write', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.setErrors({ 'items.0.name': 'bad' });
    expect(candidates(form, 'items')).toContain('items.0.name');
  });

  it('clearErrors unindexes every cleared error', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.setErrors({ 'items.0.name': 'bad' });
    form.clearErrors();
    expect(candidates(form, 'items')).not.toContain('items.0.name');
  });

  it('resetField unindexes an error for the reset field', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.setErrors({ 'items.0.name': 'bad' });
    form.resetField('items.0.name' as any);
    expect(candidates(form, 'items')).not.toContain('items.0.name');
  });

  it('runValidation indexes errors produced by config.rules and unindexes cleared ones', async () => {
    const form = createForm({
      initialValues: { items: [{ name: '' }] },
      rules: { 'items.0.name': { required: true } } as any,
    });
    await form.validate();
    expect(candidates(form, 'items')).toContain('items.0.name');
    form.set('items.0.name', 'filled');
    await form.validate();
    expect(candidates(form, 'items')).not.toContain('items.0.name');
  });

  it('runValidation with a scoped validate only reindexes within the diff, leaving unrelated errors indexed', async () => {
    const form = createForm({
      initialValues: { items: [{ name: '' }], other: [{ label: '' }] },
      rules: {
        'items.0.name': { required: true },
        'other.0.label': { required: true },
      } as any,
    });
    await form.validate();
    expect(candidates(form, 'items')).toContain('items.0.name');
    expect(candidates(form, 'other')).toContain('other.0.label');
    form.set('items.0.name', 'filled');
    await form.validate(['items.0.name'] as any);
    expect(candidates(form, 'items')).not.toContain('items.0.name');
    expect(candidates(form, 'other')).toContain('other.0.label'); // untouched by the scoped run
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `pnpm exec vitest run packages/core/test/path-index.test.ts`
Expected: the 5 new tests FAIL.

- [ ] **Step 3: Wire `runValidation`'s three wholesale reassignments with `reindexErrors`**

Lines 1474–1477:

```ts
          if (activeEpoch === asyncEpoch && !abortController?.signal.aborted) {
            const combined = { ...builtInErrors, ...resolvedErrors };
            errors = expandedScope ? mergeScopedErrors(errors, combined, expandedScope) : combined;
          }
```

becomes:

```ts
          if (activeEpoch === asyncEpoch && !abortController?.signal.aborted) {
            const combined = { ...builtInErrors, ...resolvedErrors };
            const oldErrors = errors;
            errors = expandedScope ? mergeScopedErrors(errors, combined, expandedScope) : combined;
            reindexErrors(oldErrors, errors);
          }
```

Lines 1484–1486:

```ts
          const safeResult = isValidatorReturn(validationResult) ? validationResult : {};
          const combined = { ...builtInErrors, ...safeResult };
          errors = expandedScope ? mergeScopedErrors(errors, combined, expandedScope) : combined;
```

becomes:

```ts
          const safeResult = isValidatorReturn(validationResult) ? validationResult : {};
          const combined = { ...builtInErrors, ...safeResult };
          const oldErrorsSync = errors;
          errors = expandedScope ? mergeScopedErrors(errors, combined, expandedScope) : combined;
          reindexErrors(oldErrorsSync, errors);
```

Lines 1488–1491:

```ts
      } else {
        errors = expandedScope
          ? mergeScopedErrors(errors, builtInErrors, expandedScope)
          : builtInErrors;
      }
```

becomes:

```ts
      } else {
        const oldErrorsNoValidator = errors;
        errors = expandedScope
          ? mergeScopedErrors(errors, builtInErrors, expandedScope)
          : builtInErrors;
        reindexErrors(oldErrorsNoValidator, errors);
      }
```

Three distinct local variable names — `oldErrors`, `oldErrorsSync`, `oldErrorsNoValidator` — are used for clarity about which branch each snapshot belongs to. **Important — these three sites are not flat siblings**: they sit at different nesting depths inside `runValidation`'s control flow (`if (config.validator) { if (validationResult instanceof Promise) { if (activeEpoch === asyncEpoch...) { /* site 1, ~1476 */ } } else { /* site 2, ~1486 */ } } else { /* site 3, ~1489-1491 */ }`). Before editing, run `sed -n '1400,1492p' packages/core/src/index.ts` and visually confirm each site's actual enclosing braces — do not assume the three edits are three independent top-level branches of one `if`/`else if`/`else` chain. Each edit (snapshot-then-reindex) is still self-contained and correct wherever its enclosing block is, but placing `const oldErrors = errors;` at the wrong brace depth (e.g. one level too high, outside the `if (activeEpoch === asyncEpoch...)` guard) would incorrectly call `reindexErrors` even when that guard's condition is false and `errors` was never actually reassigned on this path.

- [ ] **Step 4: Confirm the DOM-pruning `errors` call from Task 3**

Verification only — Task 3 Step 4 already added `unindexKey(path)` after `delete errors[path];` in this block. No new edit.

- [ ] **Step 5: Wire `setErrors`**

Line 2185:

```ts
      if (val !== undefined) errors[p] = val;
```

becomes:

```ts
      if (val !== undefined) {
        errors[p] = val;
        indexKey(p);
      }
```

- [ ] **Step 6: Wire `clearErrors`**

Line 2197:

```ts
    for (const p of paths) delete errors[p];
```

becomes:

```ts
    for (const p of paths) {
      delete errors[p];
      unindexKey(p);
    }
```

- [ ] **Step 7: Wire `resetField`'s errors delete loop**

Lines 2606–2610:

```ts
        if (!options?.keepError) {
          for (const k of Object.keys(errors)) {
            if (k === targetPath || k.startsWith(`${targetPath}.`)) delete errors[k];
          }
        }
```

becomes:

```ts
        if (!options?.keepError) {
          for (const k of Object.keys(errors)) {
            if (k === targetPath || k.startsWith(`${targetPath}.`)) {
              delete errors[k];
              unindexKey(k);
            }
          }
        }
```

- [ ] **Step 8: Type-check, then run tests**

Run: `pnpm --filter @neutro/form-core exec tsc --noEmit` — expect no errors.
Run: `pnpm exec vitest run packages/core/test/path-index.test.ts` — expect all PASS.
Run: `pnpm exec vitest run packages/core` — expect full suite PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/path-index.test.ts
git commit -m "feat(core): index errors write/delete sites, wire reindexErrors into runValidation"
```

---

## Task 6: Wire `indexKey`/`unindexKey` into `validatedPaths` sites

**Files:**
- Modify: `packages/core/src/index.ts` lines 1347, 1349, 1503, 1506 (`.add` in `runValidation`), 2628 (`resetField` delete loop)

**Interfaces:**
- Consumes: `indexKey`, `unindexKey` from Task 1.

- [ ] **Step 1: Write failing tests**

Add to `packages/core/test/path-index.test.ts`:

```ts
describe('pathIndex — validatedPaths call sites', () => {
  it('a full validate() with no validator/rules indexes every extracted path', async () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    await form.validate();
    expect(candidates(form, 'items')).toContain('items.0.name');
  });

  it('a scoped validate() indexes only the scoped path', async () => {
    const form = createForm({
      initialValues: { items: [{ name: 'a' }], other: [{ label: 'b' }] },
      rules: { 'items.0.name': { required: true } } as any,
    });
    await form.validate(['items.0.name'] as any);
    expect(candidates(form, 'items')).toContain('items.0.name');
  });

  it('resetField unindexes a validatedPaths entry for the reset field', async () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    await form.validate();
    form.resetField('items.0.name' as any);
    expect(candidates(form, 'items')).not.toContain('items.0.name');
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `pnpm exec vitest run packages/core/test/path-index.test.ts`
Expected: the 3 new tests FAIL.

- [ ] **Step 3: Wire the no-validator/no-rules early-return branch**

Lines 1344–1350:

```ts
    if (!config.validator && !config.rules) {
      if (!scopePaths) {
        hasValidated = true;
        for (const p of extractAllPaths(values)) validatedPaths.add(p);
      } else {
        for (const path of scopePaths) validatedPaths.add(path);
      }
      return true;
    }
```

becomes:

```ts
    if (!config.validator && !config.rules) {
      if (!scopePaths) {
        hasValidated = true;
        for (const p of extractAllPaths(values)) {
          validatedPaths.add(p);
          indexKey(p);
        }
      } else {
        for (const path of scopePaths) {
          validatedPaths.add(path);
          indexKey(path);
        }
      }
      return true;
    }
```

- [ ] **Step 4: Wire the post-validation `finally` block**

Lines 1499–1507:

```ts
      if (expandedScope) {
        if (activeEpoch === asyncEpoch && !abortController?.signal.aborted) {
          for (const path of expandedScope) validatedPaths.add(path);
        }
      } else if (activeEpoch === asyncEpoch) {
        for (const p of extractAllPaths(values)) validatedPaths.add(p);
      }
```

becomes:

```ts
      if (expandedScope) {
        if (activeEpoch === asyncEpoch && !abortController?.signal.aborted) {
          for (const path of expandedScope) {
            validatedPaths.add(path);
            indexKey(path);
          }
        }
      } else if (activeEpoch === asyncEpoch) {
        for (const p of extractAllPaths(values)) {
          validatedPaths.add(p);
          indexKey(p);
        }
      }
```

- [ ] **Step 5: Wire `resetField`'s validatedPaths delete loop**

Lines 2624–2628:

```ts
        // Always clear validatedPaths for the target path and its children.
        const toDelete = [...validatedPaths].filter(
          (k) => k === targetPath || k.startsWith(`${targetPath}.`)
        );
        for (const k of toDelete) validatedPaths.delete(k);
```

becomes:

```ts
        // Always clear validatedPaths for the target path and its children.
        const toDelete = [...validatedPaths].filter(
          (k) => k === targetPath || k.startsWith(`${targetPath}.`)
        );
        for (const k of toDelete) {
          validatedPaths.delete(k);
          unindexKey(k);
        }
```

- [ ] **Step 6: Type-check, then run tests**

Run: `pnpm --filter @neutro/form-core exec tsc --noEmit` — expect no errors.
Run: `pnpm exec vitest run packages/core/test/path-index.test.ts` — expect all PASS.
Run: `pnpm exec vitest run packages/core` — expect full suite PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/path-index.test.ts
git commit -m "feat(core): index validatedPaths add/delete sites into pathIndex"
```

---

## Task 7: Wire `indexKey`/`unindexKey` into `pathSubscribers` sites (`subscribeToPath`, `subscribeToPathDynamic`)

This is the one structure where the spec explicitly warns about double-counting: `indexKey` must fire only when a path transitions from "no subscribers" to "one subscriber," not on every `subscribe()` call.

**Files:**
- Modify: `packages/core/src/index.ts` lines 1820–1843 (`subscribeToPath`), 2217–2246 (`subscribeToPathDynamic` — function starts at 2217; the specific edits are at 2229 and 2239–2245)

**Interfaces:**
- Consumes: `indexKey`, `unindexKey` from Task 1.

- [ ] **Step 1: Write failing tests**

Add to `packages/core/test/path-index.test.ts`:

```ts
describe('pathIndex — pathSubscribers call sites', () => {
  it('subscribeToPath indexes the path on first subscriber', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    const unsub = form.subscribeToPath('items.0.name' as any, () => {});
    expect(candidates(form, 'items')).toContain('items.0.name');
    unsub();
  });

  it('a second subscriber on the same path does not double-index (refcount stays correct)', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    const unsub1 = form.subscribeToPath('items.0.name' as any, () => {});
    const unsub2 = form.subscribeToPath('items.0.name' as any, () => {});
    unsub1(); // one subscriber removed, one remains -> still indexed
    expect(candidates(form, 'items')).toContain('items.0.name');
    unsub2(); // last subscriber removed -> unindexed
    expect(candidates(form, 'items')).not.toContain('items.0.name');
  });

  it('subscribeToPathDynamic indexes on first subscriber and unindexes on last unsubscribe', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    const unsub = form.subscribeToPathDynamic('items.0.name', () => {});
    expect(candidates(form, 'items')).toContain('items.0.name');
    unsub();
    expect(candidates(form, 'items')).not.toContain('items.0.name');
  });

  it('the wildcard "*" subscription is never indexed (no-dot key)', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    const unsub = form.subscribeToPath('*', () => {});
    expect(form._debugPathIndex().size).toBe(0);
    unsub();
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `pnpm exec vitest run packages/core/test/path-index.test.ts`
Expected: the first 3 new tests FAIL (no indexing wired yet); the wildcard test PASSES already (nothing indexes `'*'` regardless).

- [ ] **Step 3: Wire `subscribeToPath`**

Lines 1820–1826:

```ts
  const subscribeToPath = (path: Path<T> | '*' | string, fn: PathSubscriber) => {
    let pathSet = pathSubscribers.get(path);
    if (!pathSet) {
      pathSet = new Set();
      pathSubscribers.set(path, pathSet);
    }
    pathSet.add(fn);
```

becomes:

```ts
  const subscribeToPath = (path: Path<T> | '*' | string, fn: PathSubscriber) => {
    let pathSet = pathSubscribers.get(path);
    if (!pathSet) {
      pathSet = new Set();
      pathSubscribers.set(path, pathSet);
      indexKey(path);
    }
    pathSet.add(fn);
```

Lines 1837–1843 (the returned unsubscribe function):

```ts
    return () => {
      const listeners = pathSubscribers.get(path);
      if (listeners) {
        listeners.delete(fn);
        if (listeners.size === 0) pathSubscribers.delete(path);
      }
    };
```

becomes:

```ts
    return () => {
      const listeners = pathSubscribers.get(path);
      if (listeners) {
        listeners.delete(fn);
        if (listeners.size === 0) {
          pathSubscribers.delete(path);
          unindexKey(path);
        }
      }
    };
```

- [ ] **Step 4: Wire `subscribeToPathDynamic`**

Line 2229:

```ts
      if (!pathSubscribers.has(path)) pathSubscribers.set(path, new Set());
```

becomes:

```ts
      if (!pathSubscribers.has(path)) {
        pathSubscribers.set(path, new Set());
        indexKey(path);
      }
```

Lines 2239–2245:

```ts
      return () => {
        const listeners = pathSubscribers.get(path);
        if (listeners) {
          listeners.delete(sub);
          if (listeners.size === 0) pathSubscribers.delete(path); // prune empty Set
        }
      };
```

becomes:

```ts
      return () => {
        const listeners = pathSubscribers.get(path);
        if (listeners) {
          listeners.delete(sub);
          if (listeners.size === 0) {
            pathSubscribers.delete(path); // prune empty Set
            unindexKey(path);
          }
        }
      };
```

- [ ] **Step 5: Type-check, then run tests**

Run: `pnpm --filter @neutro/form-core exec tsc --noEmit` — expect no errors.
Run: `pnpm exec vitest run packages/core/test/path-index.test.ts` — expect all PASS.
Run: `pnpm exec vitest run packages/core` — expect full suite PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/path-index.test.ts
git commit -m "feat(core): index pathSubscribers first-subscribe/last-unsubscribe into pathIndex"
```

---

## Task 8: Wire bulk-clear sites — `reset()` and `hydrate()`

**Files:**
- Modify: `packages/core/src/index.ts` lines 2537–2545 (`reset()`), 2693–2702 (`hydrate()`)

**Interfaces:**
- Consumes: `unindexKey` from Task 1.

- [ ] **Step 1: Write failing tests**

Add to `packages/core/test/path-index.test.ts`:

```ts
describe('pathIndex — bulk-clear sites', () => {
  it('reset() unindexes every errors/touched/dirty/wasSet/validatedPaths entry, but leaves pathSubscribers-only entries indexed', async () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    const unsub = form.subscribeToPath('items.0.name' as any, () => {});
    form.set('items.0.name', 'changed', { touch: true });
    await form.validate();
    expect(candidates(form, 'items')).toContain('items.0.name');
    form.reset();
    // pathSubscribers still holds a live subscription on this path -> must remain indexed.
    expect(candidates(form, 'items')).toContain('items.0.name');
    unsub();
    // now nothing holds it -> fully unindexed.
    expect(candidates(form, 'items')).not.toContain('items.0.name');
  });

  it('reset() with nothing else referencing the path fully unindexes it', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.set('items.0.name', 'changed', { touch: true });
    expect(candidates(form, 'items')).toContain('items.0.name');
    form.reset();
    expect(candidates(form, 'items')).not.toContain('items.0.name');
  });

  it('hydrate() unindexes errors/touched/dirty entries it clears (no wasSet/validatedPaths involved)', async () => {
    let stored: any = null;
    const form = createForm({
      initialValues: { items: [{ name: 'a' }] },
      persistence: {
        adapter: {
          read: async () => stored,
          write: async (v: any) => {
            stored = v;
          },
          clear: async () => {
            stored = null;
          },
        },
      } as any,
    });
    form.setErrors({ 'items.0.name': 'bad' });
    expect(candidates(form, 'items')).toContain('items.0.name');
    await form.hydrate();
    expect(candidates(form, 'items')).not.toContain('items.0.name');
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `pnpm exec vitest run packages/core/test/path-index.test.ts`
Expected: the 3 new tests FAIL (`reset()`/`hydrate()` still wholesale-clear without unindexing).

- [ ] **Step 3: Wire `reset()`**

Lines 2537–2545:

```ts
      batch(() => {
        if (newValues) initialValues = deepClone(newValues);
        values = deepClone(initialValues);
        runComputedPass(); // re-derive computed fields from reset state
        errors = {};
        touched = {};
        dirty = {};
        wasSet = {};
        validatedPaths.clear();
```

becomes:

```ts
      batch(() => {
        if (newValues) initialValues = deepClone(newValues);
        values = deepClone(initialValues);
        runComputedPass(); // re-derive computed fields from reset state
        for (const k of Object.keys(errors)) unindexKey(k);
        errors = {};
        for (const k of Object.keys(touched)) unindexKey(k);
        touched = {};
        for (const k of Object.keys(dirty)) unindexKey(k);
        dirty = {};
        for (const k of Object.keys(wasSet)) unindexKey(k);
        wasSet = {};
        for (const k of validatedPaths) unindexKey(k);
        validatedPaths.clear();
```

- [ ] **Step 4: Wire `hydrate()`**

Lines 2693–2702:

```ts
        batch(() => {
          initialValues = deepClone(merged);
          values = deepClone(initialValues);
          errors = {};
          touched = {};
          dirty = {};
          isSubmitting = false;
          isValidating = false;
          hasValidated = false;
        });
```

becomes:

```ts
        batch(() => {
          initialValues = deepClone(merged);
          values = deepClone(initialValues);
          for (const k of Object.keys(errors)) unindexKey(k);
          errors = {};
          for (const k of Object.keys(touched)) unindexKey(k);
          touched = {};
          for (const k of Object.keys(dirty)) unindexKey(k);
          dirty = {};
          isSubmitting = false;
          isValidating = false;
          hasValidated = false;
        });
```

- [ ] **Step 5: Type-check, then run tests**

Run: `pnpm --filter @neutro/form-core exec tsc --noEmit` — expect no errors.
Run: `pnpm exec vitest run packages/core/test/path-index.test.ts` — expect all PASS.
Run: `pnpm exec vitest run packages/core` — expect full suite PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/path-index.test.ts
git commit -m "feat(core): unindex reset()/hydrate() bulk-clear sites, preserving shared subscriber entries"
```

---

## Task 9: Wire form teardown (`destroy()`)

**Files:**
- Modify: `packages/core/src/index.ts` lines 2773–2792 (`destroy()`)

**Interfaces:**
- Consumes: `unindexKey` from Task 1.

- [ ] **Step 1: Write a failing test**

Add to `packages/core/test/path-index.test.ts`:

Note on test design: a test that only checks "the key is still indexed after `destroy()`" would pass even without this task's fix, because without `destroy()` releasing the subscriber's claim, the key stays indexed too — just with a wrong (too-high) refcount, which a single presence check can't distinguish from the correct refcount. The test below forces the refcount to be exercised down to exactly zero through two independent claims, so a missing `unindexKey` call in `destroy()` leaves the key incorrectly still indexed after *both* claims are released, which the test's final assertion catches:

```ts
describe('pathIndex — destroy()', () => {
  it('destroy() releases the pathSubscribers claim on a key, letting it become fully unindexed once errors is also cleared', async () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.subscribeToPath('items.0.name' as any, () => {}); // claim #1: pathSubscribers
    form.setErrors({ 'items.0.name': 'bad' }); // claim #2: errors
    form.destroy(); // should release claim #1 (pathSubscribers), leaving claim #2 (errors)
    expect(candidates(form, 'items')).toContain('items.0.name'); // errors claim still holds it
    form.clearErrors(); // release claim #2
    expect(candidates(form, 'items')).not.toContain('items.0.name'); // fully released now
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run packages/core/test/path-index.test.ts`
Expected: FAILS pre-fix — without `destroy()` calling `unindexKey` for the subscriber claim, the key has refcount 2 after `destroy()`; `clearErrors()` only removes one claim (refcount 1), so the test's final assertion (`not.toContain`) fails because the key is still indexed. Post-fix, `destroy()` correctly drops the refcount to 1, and `clearErrors()` drops it to 0, so the final assertion passes.

- [ ] **Step 3: Wire `destroy()`**

Lines 2773–2792:

```ts
    destroy: () => {
      for (const ctrl of activeAbortControllers.values()) ctrl.abort();
      activeAbortControllers.clear();
      persistenceUnsubscribe?.();
      persistenceUnsubscribe = null;
      globalSubscribers.clear();
      pathSubscribers.clear();
      actionListeners.clear();
```

becomes:

```ts
    destroy: () => {
      for (const ctrl of activeAbortControllers.values()) ctrl.abort();
      activeAbortControllers.clear();
      persistenceUnsubscribe?.();
      persistenceUnsubscribe = null;
      globalSubscribers.clear();
      for (const key of pathSubscribers.keys()) {
        if (key === '*') continue;
        unindexKey(key);
      }
      pathSubscribers.clear();
      actionListeners.clear();
```

(The `key === '*'` guard mirrors the existing convention elsewhere in the file of excluding the wildcard subscriber from path-keyed operations — `indexKey('*')`/`unindexKey('*')` would be a no-op anyway since `'*'` has no dot, so this guard is a clarity choice, not a correctness requirement, but keep it for consistency with `notifyPathSubscribers`'s existing `.filter((p) => p !== '*')` pattern used elsewhere in this file.)

- [ ] **Step 4: Type-check, then run tests**

Run: `pnpm --filter @neutro/form-core exec tsc --noEmit` — expect no errors.
Run: `pnpm exec vitest run packages/core/test/path-index.test.ts` — expect all PASS.
Run: `pnpm exec vitest run packages/core` — expect full suite PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/path-index.test.ts
git commit -m "feat(core): unindex pathSubscribers claims on destroy() teardown"
```

---

## Task 10: Rewrite `shiftStateIndices`'s read path to use `pathIndex` candidates

This is the actual performance fix for `arrayRemove`/`arrayInsert`. All prior tasks were prerequisite index-maintenance; this task changes the six full scans to candidate-set iteration.

**Files:**
- Modify: `packages/core/src/index.ts` lines 1618–1734 (`shiftStateIndices`)

**Interfaces:**
- Consumes: `pathIndex`, `indexKey`, `unindexKey` from Task 1; relies on Tasks 2–9 having made `pathIndex` accurate for all live state.

- [ ] **Step 1: Read the current full implementation to confirm line numbers haven't drifted**

Run: `sed -n '1618,1734p' packages/core/src/index.ts`

Expected: matches the version quoted in the design spec's "Problem" section — six structures (`errors`, `touched`, `dirty`, `wasSet` via `shiftMap`; `validatedPaths` via its own `forEach`; `pathSubscribers` via `pathSubscribers.keys()`), each doing a full scan keyed off `basePath`.

- [ ] **Step 2: Add a scale-sensitive regression test before changing the implementation**

Add to `packages/core/test/path-index.test.ts` (this test passes both before and after the rewrite — it's a correctness guard, not a TDD-red step, since the *behavior* doesn't change, only the enumeration strategy):

Note on test rigor (addressed after round-2 plan review): checking a single shifted index is too weak a regression guard for this rewrite — a bug that mishandles all-but-the-first affected key (e.g. an off-by-one that only shifts the first candidate encountered, or a candidate-set that's silently too narrow and drops keys) would still pass a test that only inspects one index. The tests below instead (a) set distinguishable state at **every** index of a multi-item array, not just one, and assert **all** of them shifted correctly, and (b) assert an exact **count** of tracked state via `_debugRawState()` before and after each op — a too-narrow or too-broad candidate set changes the count even when the specific indices a narrower test happens to check still look right by coincidence.

```ts
describe('shiftStateIndices — candidate-lookup correctness', () => {
  it('arrayRemove shifts EVERY affected index correctly (not just one) and preserves exact state counts', async () => {
    const form = createForm({
      initialValues: {
        items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }, { name: 'e' }],
        unrelatedField1: 'x',
        unrelatedField2: 'y',
      },
      rules: {
        'items.0.name': { required: true },
        'items.1.name': { required: true },
        'items.2.name': { required: true },
        'items.3.name': { required: true },
        'items.4.name': { required: true },
      } as any,
    });
    // Give every index a distinguishable dirty/touched/wasSet footprint so a
    // shift bug affecting any single index is individually detectable.
    for (let i = 1; i <= 4; i++) {
      form.set(`items.${i}.name` as any, `changed-${i}`, { touch: true });
    }
    await form.validate();
    const before = form._debugRawState();
    const beforeErrorCount = Object.keys(before.errors).length;
    const beforeTouchedCount = Object.keys(before.touched).length;
    const beforeDirtyCount = Object.keys(before.dirty).length;
    const beforeWasSetCount = Object.keys(before.wasSet).length;
    const beforeValidatedCount = before.validatedPaths.length;

    form.arrayRemove('items' as any, 0); // every remaining index (1-4) shifts down by 1

    // Every shifted item's value AND its touched/dirty footprint followed it.
    expect(form.get('items.0.name' as any)).toBe('changed-1');
    expect(form.get('items.1.name' as any)).toBe('changed-2');
    expect(form.get('items.2.name' as any)).toBe('changed-3');
    expect(form.get('items.3.name' as any)).toBe('changed-4');
    for (let i = 0; i <= 3; i++) {
      expect(form.isFieldDirty(`items.${i}.name` as any)).toBe(true);
    }

    // Exact count invariants: removing index 0 (which had no dirty/touched/wasSet
    // state of its own, only an error from validation) should drop exactly the
    // removed index's tracked entries and leave every other entry's COUNT
    // unchanged (renamed, not duplicated or dropped) — a too-narrow or
    // too-broad candidate set would change these counts even if the specific
    // assertions above happen to still look right.
    const after = form._debugRawState();
    expect(Object.keys(after.touched).length).toBe(beforeTouchedCount); // no touched state on removed index 0
    expect(Object.keys(after.dirty).length).toBe(beforeDirtyCount); // no dirty state on removed index 0
    expect(Object.keys(after.wasSet).length).toBe(beforeWasSetCount); // no wasSet state on removed index 0
    expect(Object.keys(after.errors).length).toBe(beforeErrorCount - 1); // index 0's error is dropped, not orphaned
    expect(after.validatedPaths.length).toBe(beforeValidatedCount - 1); // same for validatedPaths
  });

  it('arrayRemove leaves state below the removed index completely untouched', async () => {
    const form = createForm({
      initialValues: { items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] },
    });
    form.set('items.0.name' as any, 'unaffected', { touch: true });
    const before = form._debugRawState();
    form.arrayRemove('items' as any, 2); // remove the LAST index; index 0 must not move or be touched
    const after = form._debugRawState();
    expect(after.touched['items.0.name']).toBe(before.touched['items.0.name']);
    expect(after.dirty['items.0.name']).toBe(before.dirty['items.0.name']);
    expect(form.get('items.0.name' as any)).toBe('unaffected');
  });

  it('arrayInsert correctly shifts state up and leaves unrelated fields alone', () => {
    const form = createForm({
      initialValues: { items: [{ name: 'a' }, { name: 'b' }], other: 'unchanged' },
    });
    form.set('items.1.name', 'b-touched', { touch: true });
    form.arrayInsert('items' as any, 0, { name: 'new' } as any);
    expect(form.get('items.2.name' as any)).toBe('b-touched');
    expect(form.get('other' as any)).toBe('unchanged');
  });

  it('pathIndex candidates for the array prefix shrink to zero once all array state is cleared', async () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.set('items.0.name', 'changed', { touch: true });
    expect(candidates(form, 'items').length).toBeGreaterThan(0);
    form.arrayRemove('items' as any, 0);
    expect(candidates(form, 'items').length).toBe(0);
  });
});
```

- [ ] **Step 3: Run to confirm these pass against the current (pre-rewrite) implementation**

Run: `pnpm exec vitest run packages/core/test/path-index.test.ts`
Expected: all 3 new tests PASS already (behavior is unchanged so far — this rewrite only changes the internal enumeration strategy, verified next).

- [ ] **Step 4: Rewrite `shiftStateIndices`**

Replace the full function body (lines 1618–1734) with:

```ts
  const shiftStateIndices = (
    basePath: string,
    fromIndex: number,
    action: 'remove' | 'insert',
    targetIndex?: number
  ): string[] => {
    const shiftedKeys: string[] = [];
    const candidates = Array.from(pathIndex.get(basePath)?.keys() ?? []);
    const shiftMap = (stateMap: Record<string, any>) => {
      const updated: Record<string, any> = { ...stateMap };
      const prefix = `${basePath}.`;
      for (const key of candidates) {
        if (!(key in stateMap)) continue;
        if (!key.startsWith(prefix)) continue;
        const remaining = key.substring(prefix.length);
        const match = remaining.match(/^(\d+)(.*)$/);
        if (!match) continue;
        const index = parseInt(match[1], 10);
        const tail = match[2];
        if (action === 'remove') {
          if (index === fromIndex) {
            delete updated[key];
            unindexKey(key);
          } else if (index > fromIndex) {
            const newKey = `${prefix}${index - 1}${tail}`;
            updated[newKey] = stateMap[key];
            delete updated[key];
            unindexKey(key);
            indexKey(newKey);
            shiftedKeys.push(newKey);
          }
        } else if (action === 'insert' && targetIndex !== undefined) {
          if (index >= targetIndex) {
            const newKey = `${prefix}${index + 1}${tail}`;
            updated[newKey] = stateMap[key];
            delete updated[key];
            unindexKey(key);
            indexKey(newKey);
            shiftedKeys.push(newKey);
          }
        }
      }
      return updated;
    };
    batch(() => {
      errors = shiftMap(errors);
      touched = shiftMap(touched);
      dirty = shiftMap(dirty);
      wasSet = shiftMap(wasSet) as Record<string, boolean>;
      // Update validatedPaths for the structural change.
      // For insert: shift existing indices ≥ targetIndex up by 1 so tracking follows items.
      // For remove: drop the removed index, renumber survivors above it.
      const arrPrefix = `${basePath}.`;
      for (const key of candidates) {
        if (!validatedPaths.has(key)) continue;
        if (!key.startsWith(arrPrefix)) continue;
        const remaining = key.substring(arrPrefix.length);
        const match = remaining.match(/^(\d+)(.*)$/);
        if (!match) continue;
        const index = parseInt(match[1], 10);
        const tail = match[2];
        if (action === 'remove') {
          if (index === fromIndex) {
            validatedPaths.delete(key);
            unindexKey(key);
          } else if (index > fromIndex) {
            validatedPaths.delete(key);
            unindexKey(key);
            const newKey = `${arrPrefix}${index - 1}${tail}`;
            validatedPaths.add(newKey);
            indexKey(newKey);
          }
        } else if (action === 'insert' && targetIndex !== undefined) {
          if (index >= targetIndex) {
            validatedPaths.delete(key);
            unindexKey(key);
            const newKey = `${arrPrefix}${index + 1}${tail}`;
            validatedPaths.add(newKey);
            indexKey(newKey);
          }
        }
      }
      // Also notify any actively-registered subscriber path under this array index whose
      // slot content shifted, even when no error/touched/dirty/wasSet state exists there -
      // otherwise arrayRemove/arrayInsert would have no way to reach a per-item VALUE
      // subscriber except by falling back to notifying the whole array (which, since
      // notify() cascades to descendants, re-fires every unaffected sibling too, not just
      // the shifted items). Unlike the state maps above (which relocate data to a new key),
      // subscriptions are registered against a fixed slot path - by the time this runs,
      // `values` has already been mutated (splice happened before this call), so re-running
      // notify() on the *same* key re-reads the new content that shifted into that slot.
      // Note: pathSubscribers itself is NOT renamed here (subscriptions stay registered at
      // their original path — only the notify-list is computed), so no indexKey/unindexKey
      // calls are needed for this loop; it only reads pathSubscribers, never writes it.
      for (const key of candidates) {
        if (!pathSubscribers.has(key) || key === '*') continue;
        if (!key.startsWith(arrPrefix)) continue;
        const remaining = key.substring(arrPrefix.length);
        const match = remaining.match(/^(\d+)(.*)$/);
        if (!match) continue;
        const index = parseInt(match[1], 10);
        if (action === 'remove') {
          if (index >= fromIndex) shiftedKeys.push(key);
        } else if (action === 'insert' && targetIndex !== undefined) {
          if (index >= targetIndex) shiftedKeys.push(key);
        }
      }
    });
    return [...new Set(shiftedKeys)];
  };
```

- [ ] **Step 5: Type-check**

Run: `pnpm --filter @neutro/form-core exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Run tests**

Run: `pnpm exec vitest run packages/core/test/path-index.test.ts` — expect all PASS.
Run: `pnpm exec vitest run packages/core` — expect the **full existing suite** to PASS unmodified, including every `arrayRemove`/`arrayInsert` test in `form.test.ts` (lines 384–530, 2924–2973, 4265–4430 per the earlier audit).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/path-index.test.ts
git commit -m "perf(core): rewrite shiftStateIndices to use pathIndex candidate lookup

Replaces six O(total-form-state) Object.keys()/forEach() scans with a
single pathIndex.get(basePath) lookup, bounding arrayRemove/arrayInsert
shift cost to state actually attached to the mutated array. No behavior
change — same shift/rename/drop semantics, existing test suite passes
unmodified. v0.5.0 release-gate item 1 (see project_v050_release_gate memory)."
```

---

## Task 11: Rewrite `rekeyArrayState` (used by `arrayMove`) to use `pathIndex` candidates

**Files:**
- Modify: `packages/core/src/index.ts` lines 1736–1794 (`rekeyArrayState`) — read the current implementation first, since this plan was drafted from the design spec's description rather than a fresh read of every line; confirm exact structure before editing.

**Interfaces:**
- Consumes: `pathIndex`, `indexKey`, `unindexKey` from Task 1.

- [ ] **Step 1: Confirm the current implementation matches this plan's transcription**

Run: `sed -n '1736,1794p' packages/core/src/index.ts`

Confirm the output matches (function signature `rekeyArrayState(basePath, fromIndex, toIndex)`; a `shiftMap` closure applied to `errors`/`touched`/`dirty`/`wasSet` that first collects `affectedKeys` via `Object.keys(stateMap).forEach`, then computes each one's `newIndex` via the sliding-window rule and writes it into `updated`; an equivalent two-pass `validatedPaths.forEach` + `affectedKeys.forEach` block; and, confirmed by reading: **no `pathSubscribers` handling at all** — `arrayMove`'s caller notifies the affected index range directly via `notify()` in a loop, so `rekeyArrayState` itself never touches `pathSubscribers` and this task does not need to add any `pathSubscribers`-related candidate lookup here). If the live code differs from this description, stop and re-derive the diff from the actual code rather than applying Step 4 blindly.

- [ ] **Step 2: Write a failing/guard test**

Add to `packages/core/test/path-index.test.ts`:

```ts
describe('rekeyArrayState (arrayMove) — candidate-lookup correctness', () => {
  it('arrayMove correctly moves errors/touched/dirty/wasSet and updates pathIndex, ignoring unrelated fields', async () => {
    const form = createForm({
      initialValues: {
        items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
        unrelated: 'x',
      },
      rules: { 'items.0.name': { required: true } } as any,
    });
    form.set('items.0.name', '', { touch: true });
    await form.validate();
    expect(candidates(form, 'items')).toContain('items.0.name');
    form.arrayMove('items' as any, 0, 2); // 'a' (with its error/touched state) moves to index 2
    expect(form.get('items.2.name' as any)).toBe('');
    expect(candidates(form, 'items')).not.toContain('items.0.name');
    expect(candidates(form, 'items')).toContain('items.2.name');
    expect(form.get('unrelated' as any)).toBe('x');
  });

  it('pathIndex candidates for the array shrink correctly after arrayMove when the moved item had no tracked state', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }, { name: 'b' }] } });
    form.set('items.1.name', 'tracked', { touch: true });
    expect(candidates(form, 'items')).toContain('items.1.name');
    form.arrayMove('items' as any, 0, 1); // index 1 ('b', tracked) moves to index 0
    expect(candidates(form, 'items')).toContain('items.0.name');
    expect(candidates(form, 'items')).not.toContain('items.1.name');
  });
});
```

- [ ] **Step 3: Run to confirm these pass against the current implementation (behavior baseline)**

Run: `pnpm exec vitest run packages/core/test/path-index.test.ts`
Expected: PASS (arrayMove's existing correctness is unaffected until Step 4 changes its internals).

- [ ] **Step 4: Rewrite `rekeyArrayState`**

Replace the full function body (lines 1736–1794) with:

```ts
  const rekeyArrayState = (basePath: string, fromIndex: number, toIndex: number) => {
    const prefix = `${basePath}.`;
    const candidates = Array.from(pathIndex.get(basePath)?.keys() ?? []);
    const computeNewIndex = (index: number): number => {
      if (index === fromIndex) return toIndex;
      if (fromIndex < toIndex && index > fromIndex && index <= toIndex) return index - 1;
      if (fromIndex > toIndex && index >= toIndex && index < fromIndex) return index + 1;
      return index;
    };
    const shiftMap = (stateMap: Record<string, any>) => {
      const updated: Record<string, any> = { ...stateMap };
      for (const key of candidates) {
        if (!(key in stateMap)) continue;
        if (!key.startsWith(prefix)) continue;
        const remaining = key.substring(prefix.length);
        const match = remaining.match(/^(\d+)(.*)$/);
        if (!match) continue;
        const index = parseInt(match[1], 10);
        const tail = match[2];
        const newIndex = computeNewIndex(index);
        if (newIndex === index) continue; // untouched by this move, leave as-is
        const newKey = `${prefix}${newIndex}${tail}`;
        updated[newKey] = stateMap[key];
        delete updated[key];
        unindexKey(key);
        indexKey(newKey);
      }
      return updated;
    };
    batch(() => {
      errors = shiftMap(errors);
      touched = shiftMap(touched);
      dirty = shiftMap(dirty);
      wasSet = shiftMap(wasSet) as Record<string, boolean>;
      // Re-key validatedPaths (Set) with the same sliding-window logic.
      for (const key of candidates) {
        if (!validatedPaths.has(key)) continue;
        if (!key.startsWith(prefix)) continue;
        const remaining = key.substring(prefix.length);
        const match = remaining.match(/^(\d+)(.*)$/);
        if (!match) continue;
        const index = parseInt(match[1], 10);
        const tail = match[2];
        const newIndex = computeNewIndex(index);
        if (newIndex === index) continue;
        const newKey = `${prefix}${newIndex}${tail}`;
        validatedPaths.delete(key);
        unindexKey(key);
        validatedPaths.add(newKey);
        indexKey(newKey);
      }
    });
  };
```

Note on correctness of the rewrite versus the original: the original built a brand-new `updated`/`updatedValidated` object/set by copying through *every* key (affected or not) via the `forEach`'s early-return branches, then applied the sliding-window rename to the collected `affectedKeys`. The rewrite instead starts from `{ ...stateMap }` (a shallow copy that already includes every key, affected or not) and only mutates the subset that both (a) appears in `candidates` (i.e., was ever indexed under this `basePath`) and (b) actually changes index under `computeNewIndex`. Keys under this array's prefix that exist in `stateMap` but aren't in `candidates` cannot occur, because Tasks 2–9 guarantee every write to `errors`/`touched`/`dirty`/`wasSet`/`validatedPaths` under a dotted path is paired with `indexKey` — so `candidates` is a complete enumeration of everything that could possibly be under `basePath` in any of these five structures at this point in time.

- [ ] **Step 5: Type-check**

Run: `pnpm --filter @neutro/form-core exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Run tests**

Run: `pnpm exec vitest run packages/core/test/path-index.test.ts` — expect all PASS.
Run: `pnpm exec vitest run packages/core` — expect full suite PASS, including all `arrayMove` tests (lines 508–530, 2950–2973, 4386–4399 per the earlier audit).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/path-index.test.ts
git commit -m "perf(core): rewrite rekeyArrayState to use pathIndex candidate lookup"
```

---

## Task 12: Rewrite `arraySwap`'s inline `swapKeys` and `validatedPaths` swap to use `pathIndex` candidates

**Files:**
- Modify: `packages/core/src/index.ts` lines 2442–2509 (`arraySwap`, including the `swapKeys` closure at 2458–2480 and the `validatedPaths` swap at 2486–2503)

**Interfaces:**
- Consumes: `pathIndex`, `indexKey`, `unindexKey` from Task 1.

- [ ] **Step 1: Write a failing/guard test**

Add to `packages/core/test/path-index.test.ts`:

```ts
describe('arraySwap — candidate-lookup correctness', () => {
  it('arraySwap correctly swaps errors/touched/dirty/wasSet/validatedPaths and pathIndex, ignoring unrelated fields', async () => {
    const form = createForm({
      initialValues: {
        items: [{ name: 'a' }, { name: 'b' }],
        unrelated: 'x',
      },
      rules: { 'items.0.name': { required: true } } as any,
    });
    form.set('items.0.name', '', { touch: true });
    await form.validate();
    expect(candidates(form, 'items')).toContain('items.0.name');
    form.arraySwap('items' as any, 0, 1);
    expect(form.get('items.1.name' as any)).toBe('');
    expect(candidates(form, 'items')).not.toContain('items.0.name');
    expect(candidates(form, 'items')).toContain('items.1.name');
    expect(form.get('unrelated' as any)).toBe('x');
  });

  it('arraySwap with neither index carrying tracked state leaves pathIndex empty for that array', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }, { name: 'b' }] } });
    form.arraySwap('items' as any, 0, 1);
    expect(candidates(form, 'items')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to confirm these pass against the current implementation**

Run: `pnpm exec vitest run packages/core/test/path-index.test.ts`
Expected: PASS (baseline behavior check before the rewrite).

- [ ] **Step 3: Rewrite `swapKeys` and the `validatedPaths` swap**

Lines 2458–2480 (`swapKeys`, currently used for `errors`/`touched`/`dirty`/`wasSet`):

```ts
        const swapKeys = (stateMap: Record<string, any>) => {
          const prefix = `${targetPath}.`;
          const updated = { ...stateMap };
          const prefixA = `${prefix}${indexA}`;
          const prefixB = `${prefix}${indexB}`;
          Object.keys(stateMap).forEach((key) => {
            // Use exact-or-dot-child match to avoid "items.1" matching "items.10", "items.11", etc.
            const matchesA = key === prefixA || key.startsWith(`${prefixA}.`);
            const matchesB = key === prefixB || key.startsWith(`${prefixB}.`);
            if (matchesA) {
              const tail = key.substring(prefixA.length);
              const bKey = `${prefixB}${tail}`;
              updated[bKey] = stateMap[key];
              if (stateMap[bKey] === undefined) delete updated[key];
            } else if (matchesB) {
              const tail = key.substring(prefixB.length);
              const aKey = `${prefixA}${tail}`;
              updated[aKey] = stateMap[key];
              if (stateMap[aKey] === undefined) delete updated[key];
            }
          });
          return updated;
        };
```

becomes:

```ts
        const candidates = Array.from(pathIndex.get(targetPath)?.keys() ?? []);
        const swapKeys = (stateMap: Record<string, any>) => {
          const prefix = `${targetPath}.`;
          const updated = { ...stateMap };
          const prefixA = `${prefix}${indexA}`;
          const prefixB = `${prefix}${indexB}`;
          for (const key of candidates) {
            if (!(key in stateMap)) continue;
            // Use exact-or-dot-child match to avoid "items.1" matching "items.10", "items.11", etc.
            const matchesA = key === prefixA || key.startsWith(`${prefixA}.`);
            const matchesB = key === prefixB || key.startsWith(`${prefixB}.`);
            if (matchesA) {
              const tail = key.substring(prefixA.length);
              const bKey = `${prefixB}${tail}`;
              updated[bKey] = stateMap[key];
              indexKey(bKey);
              if (stateMap[bKey] === undefined) {
                delete updated[key];
                unindexKey(key);
              }
            } else if (matchesB) {
              const tail = key.substring(prefixB.length);
              const aKey = `${prefixA}${tail}`;
              updated[aKey] = stateMap[key];
              indexKey(aKey);
              if (stateMap[aKey] === undefined) {
                delete updated[key];
                unindexKey(key);
              }
            }
          }
          return updated;
        };
```

Note the swap logic's existing subtlety: when both `prefixA` and `prefixB` slots hold state, `updated[bKey] = stateMap[key]` (copying A's value to B's key) is immediately followed by `stateMap[bKey] === undefined` — since `stateMap[bKey]` (the *original*, pre-swap* value at B) is checked, not `updated[bKey]`, this correctly detects "B had no original value" without being confused by the just-written `updated[bKey]`. This existing logic is preserved as-is; only the enumeration and the new `indexKey`/`unindexKey` calls are added. Because both `matchesA` and `matchesB` branches can fire for their respective original keys within the same loop (once for the A-side key, once for the B-side key, since `candidates` contains both), each key's own `indexKey`/`unindexKey` pair is self-contained per iteration — no double-processing of a single key occurs since a key can only match one of `matchesA`/`matchesB`, never both.

Lines 2486–2503 (`validatedPaths` swap):

```ts
        const updatedValidated = new Set<string>();
        const prefixA = `${targetPath}.${indexA}`;
        const prefixB = `${targetPath}.${indexB}`;
        validatedPaths.forEach((key) => {
          const matchesA = key === prefixA || key.startsWith(`${prefixA}.`);
          const matchesB = key === prefixB || key.startsWith(`${prefixB}.`);
          if (matchesA) {
            const tail = key.substring(prefixA.length);
            updatedValidated.add(`${prefixB}${tail}`);
          } else if (matchesB) {
            const tail = key.substring(prefixB.length);
            updatedValidated.add(`${prefixA}${tail}`);
          } else {
            updatedValidated.add(key);
          }
        });
        validatedPaths.clear();
        for (const k of updatedValidated) validatedPaths.add(k);
```

becomes:

```ts
        const prefixA = `${targetPath}.${indexA}`;
        const prefixB = `${targetPath}.${indexB}`;
        for (const key of candidates) {
          if (!validatedPaths.has(key)) continue;
          const matchesA = key === prefixA || key.startsWith(`${prefixA}.`);
          const matchesB = key === prefixB || key.startsWith(`${prefixB}.`);
          if (matchesA) {
            const tail = key.substring(prefixA.length);
            const newKey = `${prefixB}${tail}`;
            validatedPaths.delete(key);
            unindexKey(key);
            validatedPaths.add(newKey);
            indexKey(newKey);
          } else if (matchesB) {
            const tail = key.substring(prefixB.length);
            const newKey = `${prefixA}${tail}`;
            validatedPaths.delete(key);
            unindexKey(key);
            validatedPaths.add(newKey);
            indexKey(newKey);
          }
        }
```

(The old version rebuilt the *entire* `validatedPaths` set including untouched keys via the `else { updatedValidated.add(key) }` branch and a full clear-and-repopulate; the new version only touches keys that actually match A or B, leaving all other `validatedPaths` entries — and their `pathIndex` entries — untouched, which is both correct and avoids the old version's implicit O(total validatedPaths size) clear-and-rebuild.)

- [ ] **Step 4: Type-check**

Run: `pnpm --filter @neutro/form-core exec tsc --noEmit`
Expected: no errors. (Note: `candidates` is now declared once near the top of the `batch(() => { ... })` callback and reused by both `swapKeys` and the `validatedPaths` block — confirm no duplicate `const candidates` declarations if `shiftStateIndices`/`rekeyArrayState`-style naming collides in scope; since `arraySwap` is a separate function from those, there is no actual scope collision, only naming similarity.)

- [ ] **Step 5: Run tests**

Run: `pnpm exec vitest run packages/core/test/path-index.test.ts` — expect all PASS.
Run: `pnpm exec vitest run packages/core` — expect full suite PASS, including all `arraySwap` tests (lines 530–555ish, 2973–2995ish, 4399–4415ish per the earlier audit — exact ranges confirmed by the existing `describe('Array — arraySwap', ...)` blocks).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/path-index.test.ts
git commit -m "perf(core): rewrite arraySwap's swapKeys/validatedPaths swap to use pathIndex candidate lookup"
```

---

## Task 13: Fuzz/property test across all operations, including shared-key refcount scenarios

**Files:**
- Test: `packages/core/test/path-index.test.ts` (add to existing file)

**Interfaces:**
- Consumes: the public `FormInstance<T>` API plus `_debugPathIndex()` from Task 1.

Note on test rigor (addressed after round-2 plan review): the first draft of this task compared `_debugPathIndex()` against itself under the name "brute-force scan," which is tautological — it cannot detect a wrong index, only an index that's inconsistent with itself. Real ground truth requires comparing against the six tracked structures directly, which `_debugRawState()` (added to Task 1's debug accessors above; if not yet present, add it there before this task) exposes. The helper below builds a genuine independent candidate set by scanning `_debugRawState()`'s six structures for keys under `prefix` — the same logic `pathIndex` is supposed to encode, but computed from the raw state, not from `pathIndex` itself.

- [ ] **Step 1: Write the fuzz test**

Add to `packages/core/test/path-index.test.ts`:

```ts
describe('pathIndex — fuzz: index matches an independently-computed ground truth', () => {
  // Independent oracle: scans the six RAW tracked structures (not pathIndex)
  // for keys under `prefix`, exactly mirroring what pathIndex is supposed to
  // contain. This can actually fail if pathIndex is wrong, unlike comparing
  // pathIndex against itself.
  function groundTruthCandidates(form: ReturnType<typeof createForm>, prefix: string): Set<string> {
    const raw = form._debugRawState();
    const matches = (key: string) => key === prefix || key.startsWith(`${prefix}.`);
    const result = new Set<string>();
    for (const key of Object.keys(raw.errors)) if (matches(key)) result.add(key);
    for (const key of Object.keys(raw.touched)) if (matches(key)) result.add(key);
    for (const key of Object.keys(raw.dirty)) if (matches(key)) result.add(key);
    for (const key of Object.keys(raw.wasSet)) if (matches(key)) result.add(key);
    for (const key of raw.validatedPaths) if (matches(key)) result.add(key);
    for (const key of raw.pathSubscriberKeys) if (key !== '*' && matches(key)) result.add(key);
    return result;
  }

  function assertIndexMatchesGroundTruth(form: ReturnType<typeof createForm>, prefix: string) {
    const expected = groundTruthCandidates(form, prefix);
    const actual = form._debugPathIndex().get(prefix) ?? new Set<string>();
    expect(actual).toEqual(expected);
  }

  it('interleaved operations keep pathIndex exactly equal to the ground truth, not just non-crashing', async () => {
    const form = createForm({
      initialValues: {
        items: Array.from({ length: 6 }, (_, i) => ({ name: `item-${i}` })),
        other: Array.from({ length: 4 }, (_, i) => ({ label: `other-${i}` })),
        top: 'unrelated',
      },
      rules: {
        'items.0.name': { required: true },
        'items.1.name': { required: true },
      } as any,
    });

    const unsubs: Array<() => void> = [];
    unsubs.push(form.subscribeToPath('items.2.name' as any, () => {}));
    unsubs.push(form.subscribeToPath('other.1.label' as any, () => {}));

    // A deliberately varied sequence exercising every write/delete site touched
    // by this plan: setValue, touch, validate (full and scoped), arrayInsert,
    // arrayRemove, arrayMove, arraySwap, setErrors/clearErrors, resetField.
    form.set('items.0.name', '', { touch: true });
    await form.validate();
    assertIndexMatchesGroundTruth(form, 'items');

    form.arrayRemove('items' as any, 0); // shifts remaining items down
    assertIndexMatchesGroundTruth(form, 'items');

    form.arrayInsert('items' as any, 0, { name: 'inserted' } as any);
    assertIndexMatchesGroundTruth(form, 'items');
    form.arrayMove('items' as any, 0, 3);
    assertIndexMatchesGroundTruth(form, 'items');
    form.arraySwap('items' as any, 1, 2);
    assertIndexMatchesGroundTruth(form, 'items');

    form.setErrors({ 'other.1.label': 'bad' }); // shares 'other.1.label' with the subscriber above
    assertIndexMatchesGroundTruth(form, 'other');
    form.clearErrors(); // releases the errors claim; subscriber claim should keep it indexed
    assertIndexMatchesGroundTruth(form, 'other');
    expect(groundTruthCandidates(form, 'other').has('other.1.label')).toBe(true); // still held by the subscriber
    unsubs[1](); // releases the subscriber claim too
    assertIndexMatchesGroundTruth(form, 'other');
    expect(groundTruthCandidates(form, 'other').has('other.1.label')).toBe(false);

    form.resetField('items.1.name' as any);
    assertIndexMatchesGroundTruth(form, 'items');
    form.reset();
    assertIndexMatchesGroundTruth(form, 'items');
    // After a full reset, only the still-live subscriber on 'items.2.name'
    // (now relocated by the moves/swaps above) should keep anything indexed
    // under 'items' — confirmed by the ground-truth ­equality check above,
    // not assumed.
    unsubs[0]();
    assertIndexMatchesGroundTruth(form, 'items');
    assertIndexMatchesGroundTruth(form, 'other');
  });

  it('repeated random-ish interleavings across many independent arrays stay consistent', async () => {
    const form = createForm({
      initialValues: {
        a: Array.from({ length: 5 }, (_, i) => ({ v: i })),
        b: Array.from({ length: 5 }, (_, i) => ({ v: i })),
        c: Array.from({ length: 5 }, (_, i) => ({ v: i })),
      },
    });

    const ops: Array<() => void> = [
      () => form.set('a.0.v' as any, Math.random(), { touch: true }),
      () => form.set('b.2.v' as any, Math.random(), { touch: true }),
      () => form.arrayRemove('a' as any, 1),
      () => form.arrayInsert('b' as any, 1, { v: 99 } as any),
      () => form.arrayMove('c' as any, 0, 2),
      () => form.arraySwap('a' as any, 0, 1),
      () => form.resetField('c.1.v' as any),
    ];

    for (let i = 0; i < 200; i++) {
      const op = ops[i % ops.length];
      try {
        op();
      } catch {
        // Some ops become invalid as arrays shrink (e.g. arrayRemove on an
        // empty array) — that's fine, the point is pathIndex never desyncs
        // regardless of which ops actually succeed.
      }
      // Ground-truth equality check after EVERY operation, not just at the
      // end — catches a desync at the exact op that caused it, and a too-
      // narrow/too-broad candidate set that a final-state-only "doesn't
      // throw" check would miss entirely.
      for (const prefix of ['a', 'b', 'c']) {
        assertIndexMatchesGroundTruth(form, prefix);
      }
    }
  });
});
```

- [ ] **Step 2: Run**

Run: `pnpm exec vitest run packages/core/test/path-index.test.ts`
Expected: all tests PASS. If any assertion fails, it indicates a missed call site from Tasks 2–12 — do not proceed to Task 14 until this is green, since Task 14's benchmark assumes correctness is already locked in.

- [ ] **Step 3: Run the full existing suite one more time**

Run: `pnpm exec vitest run packages/core`
Expected: full suite PASSES.

- [ ] **Step 4: Commit**

```bash
git add packages/core/test/path-index.test.ts
git commit -m "test(core): add fuzz/interleaving tests for pathIndex consistency across all array/state operations"
```

---

## Task 14: Fix the confounded `array-ops-scale` benchmark and capture the before/after number

**Files:**
- Modify: `bench/suites/core/array-ops-scale.bench.ts`

**Interfaces:**
- Consumes: the `neutroAdapter`/`largeArrayFixture`/`largeArrayWithUnrelatedFieldsFixture` helpers already present in this file (no changes to those).

- [ ] **Step 1: Read the current confound**

The current `remove-start-with-unrelated-fields` benchmark (and its siblings) creates a brand-new form adapter *inside* the timed `bench()` callback:

```ts
  bench('neutro/form', () => {
    const a = neutroAdapter(largeArrayWithUnrelatedFieldsFixture)
    const cleanup = wireItemSubscribers(a, 500)
    a.arrayRemove('items', 0)
    cleanup()
  })
```

Per the design spec, this makes instantiation cost (creating a fresh 500-item form) dominate the measured time, masking whatever `arrayRemove`'s own cost is.

- [ ] **Step 2: Rewrite to isolate shift cost from instantiation cost**

Replace the full file content with:

```ts
import { bench, describe } from 'vitest'
import { createAdapter as neutroAdapter } from '../../adapters/neutro.js'
import { largeArrayFixture, largeArrayWithUnrelatedFieldsFixture } from '../../fixtures/large-array.js'

function wireItemSubscribers(adapter: ReturnType<typeof neutroAdapter>, count: number) {
  const unsubscribes: Array<() => void> = []
  for (let i = 0; i < count; i++) {
    unsubscribes.push(adapter.subscribeToPath(`items.${i}.name`, () => {}))
  }
  return () => unsubscribes.forEach(fn => fn())
}

// Each describe block instantiates ONE form outside the timed callback, then
// the timed callback repeatedly removes-then-reinserts the same item so the
// array stays at a stable size across iterations. This isolates the cost of
// the shift itself (shiftStateIndices) from the cost of building a fresh
// 500-item form + 500 subscribers, which previously dominated the signal.
describe('array-ops-scale/remove-start', () => {
  const a = neutroAdapter(largeArrayFixture)
  wireItemSubscribers(a, 500)
  const item = a.get('items.0')
  // Worst case for a shift-based engine: removing index 0 shifts all remaining items.
  bench('neutro/form', () => {
    a.arrayRemove('items', 0)
    a.arrayInsert('items', 0, item)
  })
})

describe('array-ops-scale/remove-end', () => {
  const a = neutroAdapter(largeArrayFixture)
  wireItemSubscribers(a, 500)
  const lastIndex = (a.get('items') as unknown[]).length - 1
  const item = a.get(`items.${lastIndex}`)
  // Best case: removing the last index shifts nothing.
  bench('neutro/form', () => {
    a.arrayRemove('items', lastIndex)
    a.arrayInsert('items', lastIndex, item)
  })
})

describe('array-ops-scale/remove-start-with-unrelated-fields', () => {
  const a = neutroAdapter(largeArrayWithUnrelatedFieldsFixture)
  wireItemSubscribers(a, 500)
  const item = a.get('items.0')
  // Same worst-case removal, but the form also has 500 unrelated top-level fields.
  // Isolates whether cost scales with array size alone or with total form state
  // size. Before the pathIndex fix (docs/superpowers/specs/2026-07-03-shift-
  // state-indices-prefix-index-design.md), shiftStateIndices's unconditional
  // Object.keys(stateMap).forEach scans over errors/touched/dirty/wasSet/
  // validatedPaths, plus the pathSubscribers scan, iterated the ENTIRE
  // respective collection every call, not just the array's own keys — this
  // benchmark's whole purpose is to make that difference visible.
  bench('neutro/form', () => {
    a.arrayRemove('items', 0)
    a.arrayInsert('items', 0, item)
  })
})
```

- [ ] **Step 3: Confirm the bench file itself has no lint/type errors**

Run: `pnpm --dir bench exec tsc --noEmit` (or the bench package's equivalent check script — confirm the exact command via `cat bench/package.json | grep -A2 '"scripts"'` if this one doesn't exist)

- [ ] **Step 4: Run the benchmark against the pre-Task-1 code to get the "before" number**

This requires running the benchmark twice — once on the code as it stood before this plan's changes, once after. Since all 13 prior tasks are already committed by this point, capture the "before" number from git history:

```bash
git stash # if any uncommitted changes exist (there shouldn't be, since Task 13 committed everything)
git log --oneline | grep "docs(specs): add design for shiftStateIndices" # find the commit just before Task 1's implementation began
```

Check out that commit in a scratch worktree (do not disrupt the current branch) to run the "before" benchmark:

```bash
git worktree add /tmp/shift-state-before <commit-hash-from-above>
cd /tmp/shift-state-before/bench && pnpm install && pnpm exec vitest bench suites/core/array-ops-scale.bench.ts
```

Record the `remove-start-with-unrelated-fields` timing.

- [ ] **Step 5: Run the "after" benchmark on the current branch**

```bash
cd /Users/kofi/_/agw-form/bench && pnpm exec vitest bench suites/core/array-ops-scale.bench.ts
```

Record the `remove-start-with-unrelated-fields` timing and compare against Step 4's number. Expect a clear improvement proportional to how large `largeArrayWithUnrelatedFieldsFixture`'s unrelated-field count is relative to the array size (confirm the fixture's actual unrelated-field count via `cat bench/fixtures/large-array.ts` if the improvement is smaller than expected).

- [ ] **Step 6: Clean up the scratch worktree**

```bash
git worktree remove /tmp/shift-state-before
```

- [ ] **Step 7: Commit the benchmark fix**

```bash
git add bench/suites/core/array-ops-scale.bench.ts
git commit -m "fix(bench): isolate array-ops-scale shift cost from form-instantiation cost

Previously each bench() iteration re-instantiated a fresh 500-item form
with 500 subscribers inside the timed callback, so instantiation cost
dominated the signal and masked shiftStateIndices's own cost (the reason
Task 7 of the original array-ops-scale design spec never got a clean
number). Now each describe block instantiates once and the timed callback
does a stable remove+reinsert cycle, isolating the shift itself.

Before/after numbers for remove-start-with-unrelated-fields captured via
a scratch worktree comparison against the pre-pathIndex-fix commit —
see PR description for the recorded numbers."
```

- [ ] **Step 8: Report the before/after numbers**

Since this is the last task, summarize the captured numbers (from Steps 4–5) back to the user/reviewer rather than baking them into a commit message with placeholder text — do not write "TBD" into the commit; only commit once the real numbers from Steps 4–5 are in hand.

---

## Plan self-review notes

- **Spec coverage:** every named site in the design spec's "Design" and "Bulk-clear sites" sections (shiftStateIndices, rekeyArrayState, arraySwap, reset(), hydrate(), resetField, DOM-pruning, setErrors/clearErrors, connect() blur handler, subscribeToPath/subscribeToPathDynamic, destroy(), and the plan-time-discovered runValidation/reindexErrors gap) has a task. The two "Open questions" the spec left for planning — extracting a shared `remapArrayKeys` helper, and whether `arraySwap`'s missing `pathSubscribers` handling is a separate bug — are deliberately **not** implemented in this plan: the first is optional per the spec ("secondary to correctness... can be decided during planning" — decided here as **not worth doing**, since Tasks 10–12 show the three functions' index-transform logic diverges enough — remove/insert shift vs. move-with-sliding-window vs. two-way-swap — that a shared parameterized helper would need a nontrivial `transformIndex` abstraction for marginal DRY benefit); the second is explicitly flagged in the spec as **out of scope, not to be silently expanded** — Task 12 preserves `arraySwap`'s existing (lack of) `pathSubscribers` handling exactly.
- **Type consistency:** `pathIndex`, `indexKey`, `unindexKey`, `reindexErrors` are named identically from Task 1 through Task 14. `_debugPathIndex`/`_debugIndexKey`/`_debugUnindexKey` are introduced once in Task 1 and reused verbatim in every subsequent task's tests.
- **Placeholder scan:** no task contains "TBD"/"add error handling"/"similar to Task N" — Task 11 explicitly instructs re-reading the source before writing its diff rather than presenting an unverified diff, because this plan was drafted without transcribing every line of `rekeyArrayState` in full; this is a deliberate hand-off instruction, not a placeholder, since the read-and-confirm step is itself a concrete, actionable step.
