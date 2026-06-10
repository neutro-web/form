# @agw/form — Hardening, Fixes & Documentation Design Spec

**Date:** 2026-06-09
**Author:** koficodedat
**Status:** Approved

---

## 1. Overview

This spec covers the full hardening pass on the `agw-form` monorepo: fixing all confirmed bugs (including newly discovered engine-level issues), completing the build infrastructure, expanding test coverage to production-grade, and launching a consumer-facing documentation site via VitePress on GitHub Pages.

---

## 2. Bug Inventory

### 2.1 Previously Identified Issues (from CLAUDE.md)

| # | Issue | Fix |
|---|---|---|
| 1 | React `useFormPath` broken — wrong subscriber signature | Wrap `subscribeToPath` to adapt React's `() => void` notifier |
| 2 | `arrayInsert` missing from public API | Wire existing `shiftStateIndices('insert')` into a public method |
| 3 | `valibotAdapter`, `yupAdapter`, `classValidatorAdapter` orphaned in root file | Move into `packages/core/src/index.ts`, delete orphan files |
| 4 | Alias package `"types"` fields point to package names, not file paths | Create stub re-export `.ts` source files, build to `.d.ts` |
| 5 | Adapter packages have no build scripts | Add `tsup.config.ts` + `build` script to all 5 adapters |
| 6 | Adapter package names don't match white paper spec | Rename all adapter packages |

### 2.2 Engine Bugs Discovered During Technical Review

| # | Bug | Severity | Fix |
|---|---|---|---|
| 7 | **Nested `batch()` breaks outer batch** | Critical | Replace `isBatching: boolean` with `batchDepth: number`; flush only when depth reaches zero |
| 8 | **Single global async debounce timer** | High | Each `runValidation` invocation should create its own debounce slot keyed by scope; concurrent field validations must not cancel each other's timers |
| 9 | **`notify()` unconditionally deep-clones entire values tree** | High | Guard `getState()` behind `globalSubscribers.size > 0`; path subscriber callbacks should receive `deepClone(getNestedValue(values, path))` only, not a full state clone |
| 10 | **`isDeepEqual` is O(N²) — `keysB.includes(key)` on array** | Medium | Convert `Reflect.ownKeys(b)` result to a `Set` before the loop for O(1) key membership |
| 11 | **`isDeepEqual` uses `Map` for circular ref tracking, not `WeakMap`** | Low | Change to `WeakMap` to avoid holding strong references to compared objects during traversal |
| 12 | **`compileDependencyScopes` misses wildcard deps on initially-empty arrays** | Medium | Register wildcard path patterns (e.g. `destinations.*.url`) directly in `preComputedScopes` independently of `extractAllPaths`; do not rely solely on concrete paths present at init time |
| 13 | **Validator receives live mutable `values` reference, not a snapshot** | Medium | Pass a snapshot to the validator: freeze or shallow-copy before handing to async validators to prevent mid-await mutations from contaminating validation state |

### 2.3 Performance Corrections to White Paper Claims

The following claims in the white paper are inaccurate or overstated and must not be repeated in the new docs:

- **"Trie-based"** — the notification system does `path.split('.') + sequential Map.get()`. This is O(depth) hierarchical pub/sub fan-out, not a trie. Documentation will say "path-scoped pub/sub" or "hierarchical subscription routing."
- **"Sub-millisecond keystroke latency"** — true for sync validation on small forms only. With bug #9 present (deep-clone on every notify), large forms with global subscribers pay significant clone cost per keystroke. The claim becomes accurate only after bug #9 is fixed.
- **"O(1) path subscription routing"** — the dependency lookup is O(1) (correct). The notification fan-out is O(depth × subscriber_count), not O(1). Docs will not conflate these.

### 2.4 Accurate Performance Positioning

After fixes #7, #8, #9 are applied, the library's genuine advantages over industry standards are:

- **vs. Formik:** Path subscriptions eliminate the global re-render storm. Formik re-renders the full component tree on every change; agw/form re-renders only components subscribed to the mutated path. Genuine win.
- **vs. React Hook Form:** RHF uses uncontrolled inputs + refs for zero re-renders during typing. agw/form's `useFormPath` is controlled and does re-render on path change, but scoped. The framework-agnostic headless core is a structural advantage RHF cannot match. Performance is comparable after fix #9.
- **vs. Zustand-based forms:** Comparable selective subscription model. agw/form adds built-in validation lifecycle, array operations, and DOM bridge that Zustand does not provide.
- **Genuine differentiators (defensible, no exaggeration):**
  - Pre-computed transitive dependency scopes: real O(1) runtime lookup with zero per-keystroke allocation
  - WeakRef + MutationObserver automatic GC: novel, no competing library does this
  - Single headless core with verified framework adapters for React, Svelte, Vue, Solid, Angular
  - AbortController-aware async validation with epoch protection

---

## 3. Package Renames

| Old name | New name |
|---|---|
| `@agnostic-web/form-adapters-react` | `@agnostic-web/form-react` |
| `@agnostic-web/form-adapters-svelte` | `@agnostic-web/form-svelte` |
| `@agnostic-web/form-adapters-vue` | `@agnostic-web/form-vue` |
| `@agnostic-web/form-adapters-solid` | `@agnostic-web/form-solid` |
| `@agnostic-web/form-adapters-angular` | `@agnostic-web/form-angular` |

Update sites: each adapter's `package.json` `"name"`, alias `package.json` dependencies + workspace refs, root `tsconfig.json` path aliases.

---

## 4. Files Deleted

- `production_grade_ts_engine.ts` (orphan draft — content absorbed into core package)
- `framework_reactivity_adapters.ts` (orphan draft — content absorbed into adapter packages)
- `White Paper & Documentation.md` (content absorbed into docs/; inaccurate claims removed)
- `Monorepo & Packaging Strategy.md` (content absorbed into docs/)
- `NPM Installation and Usage Guide.md` (content absorbed into docs/getting-started.md)

---

## 5. Final Repository Structure

```
packages/
  core/                              @agnostic-web/form-core
    src/index.ts
    test/form.test.ts
    tsup.config.ts
    package.json
    tsconfig.json
  adapters/
    react/                           @agnostic-web/form-react
    svelte/                          @agnostic-web/form-svelte
    vue/                             @agnostic-web/form-vue
    solid/                           @agnostic-web/form-solid
    angular/                         @agnostic-web/form-angular
      (each has src/index.ts, test/index.test.ts, tsup.config.ts, package.json)
  alias/                             @agw/form
    src/
      core.ts
      adapters/
        react.ts / svelte.ts / vue.ts / solid.ts / angular.ts
    tsup.config.ts
    package.json

docs/
  .vitepress/
    config.ts
  public/
    logo.svg
  index.md                           Landing page
  getting-started.md
  api/
    index.md
    core.md
    connect.md
    array-operations.md
    validation.md
  guides/
    react.md
    svelte.md
    vue.md
    solid.md
    angular.md
    async-validation.md
    dependency-graph.md
    multi-step-forms.md
  playground.md

.github/
  workflows/
    docs.yml                         VitePress → GitHub Pages on push to main

CLAUDE.md                            Updated
README.md                            Updated (links to docs site)
```

---

## 6. Core Engine Changes (`packages/core/src/index.ts`)

### 6.1 Bug Fix: Batch Depth Counter + Path Notification Flush (Bug #7)

Reading the actual source confirms two compounding problems:

1. `isBatching: boolean` means nested batches (e.g. `arrayRemove` → `shiftStateIndices`, each wrapping their own `batch()`) cause the inner batch to flip `isBatching = false` and fire mid-outer-batch.
2. When the batch flushes, it calls `notify()` with **no path argument**, so path subscribers inside the batch (e.g. the per-index `notify(\`${targetPath}.${i}\`)` calls inside `arrayMove`) are silently swallowed — only global subscribers see the update.

Both are fixed together by replacing the boolean with a depth counter and a path accumulator:

```ts
// Replace:
let isBatching = false;
let hasPendingNotification = false;

// With:
let batchDepth = 0;
const pendingPaths = new Set<string | undefined>();

// In notify() — first guard:
if (batchDepth > 0) {
  pendingPaths.add(mutatedPath);
  return;
}

// In batch():
const batch = (fn: () => void) => {
  batchDepth++;
  try { fn(); } finally {
    batchDepth--;
    if (batchDepth === 0 && pendingPaths.size > 0) {
      const paths = [...pendingPaths];
      pendingPaths.clear();
      _flushNotifications(paths);
    }
  }
};

// New internal helper — called only from batch flush, never directly:
const _flushNotifications = (paths: Array<string | undefined>) => {
  if (globalSubscribers.size > 0) {
    const snapshot = getState();
    globalSubscribers.forEach((fn) => fn(snapshot));
  }
  const uniquePaths = [...new Set(paths.filter((p): p is string => p !== undefined))];
  uniquePaths.forEach((mutatedPath) => {
    const parts = mutatedPath.split('.');
    const candidatePaths: string[] = ['*'];
    let accum = '';
    for (const part of parts) {
      accum = accum ? `${accum}.${part}` : part;
      candidatePaths.push(accum);
    }
    candidatePaths.forEach((p) => {
      const listeners = pathSubscribers.get(p);
      if (listeners) {
        const val = p === '*' ? deepClone(values) : deepClone(getNestedValue(values, p));
        listeners.forEach((cb) => cb(val, { error: errors[p], touched: touched[p], dirty: dirty[p] }));
      }
    });
  });
};
```

### 6.2 Bug Fix: Per-Invocation Async Debounce (Bug #8)

Remove the single shared `asyncDebounceTimer`. Each `runValidation` call creates its own debounce promise internally. The epoch counter (`asyncEpoch`) already handles stale result rejection; the debounce only needs to delay the await, not cancel other fields' timers. Implementation: move `asyncDebounceTimer` inside the `runValidation` scope per call using a locally scoped variable and `clearTimeout` keyed to the specific invocation.

### 6.3 Bug Fix: Conditional Deep Clone in `notify()` (Bug #9)

The source confirms `getState()` (full deep clone) is called unconditionally on every `notify()` invocation regardless of whether any global subscriber is registered. Additionally, the pathless `notify()` call used by `reset()` and `runValidation` does not fan out to path subscribers, meaning components subscribed via `subscribeToPath` do not receive updated error state after validation completes.

**Architectural rule:** `notify(mutatedPath)` handles field-data mutations. `notify()` with no argument is reserved for global-flag-only state changes (`isValidating`, `isSubmitting`). All calls that change field data — including `reset()` and the validation-error update at the end of `runValidation` — must call `notify(path)` for each affected path, not a bare `notify()`.

```ts
const notify = (mutatedPath?: string) => {
  if (batchDepth > 0) {
    pendingPaths.add(mutatedPath);
    return;
  }

  // Global subscribers always receive a full snapshot when notified
  if (globalSubscribers.size > 0) {
    const stateSnapshot = getState();
    globalSubscribers.forEach((fn) => fn(stateSnapshot));
  }

  if (mutatedPath) {
    // Path subscribers receive only their specific value, cloned individually
    const parts = mutatedPath.split('.');
    const candidatePaths: string[] = ['*'];
    let accum = '';
    for (const part of parts) {
      accum = accum ? `${accum}.${part}` : part;
      candidatePaths.push(accum);
    }
    candidatePaths.forEach((p) => {
      const listeners = pathSubscribers.get(p);
      if (listeners) {
        const val = p === '*' ? deepClone(values) : deepClone(getNestedValue(values, p));
        listeners.forEach((cb) => cb(val, { error: errors[p], touched: touched[p], dirty: dirty[p] }));
      }
    });
  }
  // When mutatedPath is undefined: only global subscribers are notified.
  // Callers that change field data (reset, validation end) must supply a path or
  // iterate pathSubscribers.keys() and call notify(path) for each.
};
```

**Callers that need to be updated:**

- `reset()`: replace the terminal `notify()` with a loop over `pathSubscribers.keys()`:
  ```ts
  if (globalSubscribers.size > 0) {
    globalSubscribers.forEach((fn) => fn(getState()));
  }
  pathSubscribers.forEach((_, p) => {
    if (p === '*') return;
    notify(p);
  });
  ```

- `runValidation` end: replace the terminal `notify()` with `notify(path)` for each path in `expandedScope` (or all paths if no scope), so path subscribers see updated error state:
  ```ts
  finally {
    isValidating = false;
    if (globalSubscribers.size > 0) {
      globalSubscribers.forEach((fn) => fn(getState()));
    }
    const pathsToNotify = expandedScope ?? [...pathSubscribers.keys()].filter(p => p !== '*');
    pathsToNotify.forEach((p) => notify(p));
  }
  ```

- `isValidating = true; notify();` at validation start: fine as-is — only global subscribers need to know `isValidating` flipped, no field data changed.

### 6.4 Bug Fix: `isDeepEqual` O(N²) → O(N) (Bug #10)

```ts
const keysA = Reflect.ownKeys(a);
const keysB = new Set(Reflect.ownKeys(b));  // O(1) lookup
if (keysA.length !== keysB.size) return false;
for (const key of keysA) {
  if (!keysB.has(key) || !isDeepEqual(a[key], b[key], hash)) return false;
}
```

### 6.5 Bug Fix: `isDeepEqual` circular ref tracking (Bug #11)

```ts
// Replace: hash = new Map()
// With:    hash = new WeakMap()
```

### 6.6 Bug Fix: Wildcard dependency compilation (Bug #12)

`compileDependencyScopes` must register wildcard path patterns from the `dependencies` config directly, without requiring `extractAllPaths` to have produced those paths from `initialValues`. If a dependency key contains `.*. ` it is stored in `preComputedScopes` as-is so `runValidation`'s wildcard substitution has something to look up.

### 6.7 Bug Fix: Validator receives snapshot, not live reference (Bug #13)

```ts
// In runValidation, before calling config.validator:
const valuesSnapshot = deepClone(values);
const validationResult = config.validator(valuesSnapshot, expandedScope, abortController.signal);
```

### 6.8 New Validator Adapters (Bug #3)

Add alongside the existing `zodAdapter`:

```ts
valibotAdapter<T>(schema, safeParseFn)       // valibot v0.31+ safeParse API (sync)
yupAdapter<T>(schema)                         // yup async schema.validate(values, { abortEarly: false })
classValidatorAdapter<T>(Cls, validateFn)     // async, class-validator
```

Note: `yupAdapter` must use yup's async `validate()` with `abortEarly: false` to collect all errors rather than throwing on the first. `validateSync` is not suitable — it throws and does not return all errors.

### 6.9 New `arrayInsert` Method (Bug #2)

```ts
arrayInsert(path, index, item)
// Inserts item at index, shifts all entries >= index up by 1
// Shifts errors/touched/dirty key indices via shiftStateIndices('insert', index)
// Out-of-bounds index (< 0 or > arr.length) is a no-op
// Triggers runValidation([targetPath]) after mutation
```

---

## 7. Adapter Fixes & Additions

All adapters currently expose only a global-state hook. None provide a path-level subscription hook (the equivalent of `useFormPath` for each framework). This is a gap across the board — without path hooks, consumers cannot get framework-native reactive bindings to individual fields without subscribing to the entire form state, which re-runs all derived computations on every field change.

### 7.1 React — `useFormPath` Signature Fix (Bug #1)

```ts
// Before (broken — passes React's () => void directly to PathSubscriber slot):
(callback: () => void) => form.subscribeToPath(path, callback)

// After (correct — adapts signatures):
(onStoreChange: () => void) => form.subscribeToPath(path, () => onStoreChange())
```

### 7.2 React — New `useFormConnect` Hook

`useForm` and `useFormPath` are controlled-input patterns — they bind field values to React state and re-render on every change. For uncontrolled inputs (the pattern React Hook Form popularised), a third hook is needed that registers the DOM input directly via `form.connect()` without touching React state.

```ts
export function useFormConnect(form: any) {
  return useCallback(
    (path: string, options?: ConnectOptions) =>
      (el: HTMLElement | null) => {
        if (el) form.connect(path, el, options);
        // Disconnect is handled automatically by WeakRef + MutationObserver GC
      },
    [form]
  );
}
```

Usage:
```tsx
const connectRef = useFormConnect(form);
<input ref={connectRef('user.email')} type="email" />
// Zero React re-renders during typing. Values are read via form.getPayload() on submit.
```

This gives parity with RHF's `register()` pattern while using agw/form's DOM bridge and automatic GC.

### 7.3 Svelte 5 — New `useSvelteFormPath`

The current `useSvelteForm` subscribes to global state. Path-level subscriptions are missing. The path hook uses `$state` runes and subscribes only to the specific field.

```ts
export function useSvelteFormPath(form: any, path: string) {
  let value = $state<unknown>(form.get(path));
  let fieldState = $state<{ error?: string; touched?: boolean; dirty?: boolean } | null>(null);

  const unsubscribe = form.subscribeToPath(path, (v: unknown, fs: any) => {
    value = v;
    fieldState = fs;
  });
  onDestroy(unsubscribe);

  return {
    get value() { return value; },
    get fieldState() { return fieldState; }
  };
}
```

### 7.4 Vue 3 — New `useVueFormPath`

The current `useVueForm` subscribes to global state. The path hook uses `shallowRef` and accepts `MaybeRef<string>` so the path itself can be reactive — necessary for fields inside `v-for` loops.

```ts
import { shallowRef, readonly, unref, watch, onUnmounted, type MaybeRef } from 'vue';

export function useVueFormPath(form: any, path: MaybeRef<string>) {
  const value = shallowRef<unknown>(form.get(unref(path)));
  const fieldState = shallowRef<any>(null);

  let unsubscribe = form.subscribeToPath(unref(path), (v: unknown, fs: any) => {
    value.value = v;
    fieldState.value = fs;
  });

  // Re-subscribe if path is a reactive ref and changes
  watch(() => unref(path), (newPath) => {
    unsubscribe();
    value.value = form.get(newPath);
    fieldState.value = null;
    unsubscribe = form.subscribeToPath(newPath, (v: unknown, fs: any) => {
      value.value = v;
      fieldState.value = fs;
    });
  });

  onUnmounted(() => unsubscribe());

  return { value: readonly(value), fieldState: readonly(fieldState) };
}
```

### 7.5 Solid — Critical Fix to `useSolidForm` + New `useSolidFormPath`

**Critical:** The current adapter uses `createSignal(form.getState())` and replaces the entire signal on every change. Solid's fine-grained reactivity is completely bypassed — every derived computation that reads `state()` re-runs on every single field change, regardless of which field changed. This defeats the primary performance advantage of using Solid.

**Fix:** Replace `createSignal` with `createStore` + `reconcile` from `solid-js/store`. `reconcile` diffs the incoming state against the stored state and applies only the changed keys, allowing Solid's reactive system to track granular dependencies as intended.

```ts
import { createStore, reconcile } from 'solid-js/store';
import { createSignal, onCleanup } from 'solid-js';

export function useSolidForm<T extends object>(form: any) {
  const [state, setState] = createStore<any>(form.getState());
  const unsubscribe = form.subscribe((s: any) => {
    setState(reconcile(s));   // granular diff — only changed keys trigger dependent signals
  });
  onCleanup(unsubscribe);
  return [
    state,
    {
      get: form.get,
      set: form.set,
      connect: form.connect,
      submit: form.submit,
      handleSubmit: form.handleSubmit,
      reset: form.reset
    }
  ] as const;
}

export function useSolidFormPath(form: any, path: () => string) {
  const [value, setValue] = createSignal<unknown>(form.get(path()));
  const [fieldState, setFieldState] = createSignal<any>(null);
  const unsubscribe = form.subscribeToPath(path(), (v: unknown, fs: any) => {
    setValue(() => v);
    setFieldState(() => fs);
  });
  onCleanup(unsubscribe);
  return { value, fieldState };
}
// Note: `path()` is evaluated once at call time. The subscription does not re-subscribe
// if the path signal changes after initial call. For dynamic paths, call `useSolidFormPath`
// inside a `createEffect` that re-mounts when the path changes, or use `useSolidForm` and
// derive the field value from the store with `createMemo(() => state.values[path()])`.
```

### 7.6 Angular — New `useAngularFormPath`

The current `useAngularForm` subscribes to global state. The path hook returns two readonly `Signal`s for use directly in templates.

```ts
export function useAngularFormPath(form: any, path: string) {
  const value = signal<unknown>(form.get(path));
  const fieldState = signal<any>(null);
  const unsubscribe = form.subscribeToPath(path, (v: unknown, fs: any) => {
    value.set(v);
    fieldState.set(fs);
  });
  inject(DestroyRef).onDestroy(unsubscribe);
  return { value: value.asReadonly(), fieldState: fieldState.asReadonly() };
}
```

**Note:** `useAngularFormPath` (and `useAngularForm`) must be called inside an injection context — component constructor, `inject()` call site, or a factory called from one. Document this constraint explicitly.

---

## 8. Alias Package (`packages/alias/`)

### 8.1 Stub Source Files

Each stub re-exports everything from its target package:

```ts
// src/core.ts
export * from '@agnostic-web/form-core';

// src/adapters/react.ts
export * from '@agnostic-web/form-react';
// ... etc
```

### 8.2 tsup Config

Multiple entry points, ESM + CJS + `.d.ts`:

```ts
entry: {
  core: 'src/core.ts',
  'adapters/react': 'src/adapters/react.ts',
  'adapters/svelte': 'src/adapters/svelte.ts',
  'adapters/vue': 'src/adapters/vue.ts',
  'adapters/solid': 'src/adapters/solid.ts',
  'adapters/angular': 'src/adapters/angular.ts',
}
```

### 8.3 Fixed `package.json` Exports

```json
"./core": {
  "types": "./dist/core.d.ts",
  "import": "./dist/core.js",
  "require": "./dist/core.cjs"
}
```

---

## 9. Adapter Package Build Config (all 5 adapters)

Each adapter gains:

```
src/index.ts         (already exists; see Svelte note below)
tsup.config.ts       (new)
package.json         (add build script + exports fields)
```

`package.json` gains:
- `"main": "./dist/index.cjs"`
- `"module": "./dist/index.js"`
- `"types": "./dist/index.d.ts"`
- `"exports"` map (types/import/require)
- `"scripts": { "build": "tsup" }`
- `"devDependencies": { "tsup": "^8.0.0" }`

### tsup configs — `external` declarations required

Each adapter's `tsup.config.ts` must mark its framework peer as external or tsup will attempt to bundle it, producing an incorrectly bloated package:

```ts
// React
export default defineConfig({ entry: ['src/index.ts'], format: ['esm', 'cjs'], dts: true, external: ['react'] });

// Vue
export default defineConfig({ ..., external: ['vue'] });

// Solid
export default defineConfig({ ..., external: ['solid-js', 'solid-js/store'] });

// Angular
export default defineConfig({ ..., external: ['@angular/core'] });
```

### Svelte adapter — build tool exception

`$state` runes are only valid inside `.svelte` or `.svelte.ts` files; they are not processed by regular TypeScript compilation. The current `packages/adapters/svelte/src/index.ts` uses `$state` and **cannot be compiled by tsup as-is**.

Two options — choose one:

**Option A (recommended for simplicity):** Rewrite the Svelte adapter using `svelte/store` primitives (`readable`, `derived`) instead of runes. The resulting package is a standard TypeScript file buildable by tsup, and consumers use the `$` store prefix in their `.svelte` components:

```ts
import { readable } from 'svelte/store';
import { onDestroy } from 'svelte';

export function useSvelteForm(form: any) {
  const state = readable(form.getState(), (set) => form.subscribe((s: any) => set(s)));
  return { state, get: form.get, set: form.set, connect: form.connect, ... };
}

export function useSvelteFormPath(form: any, path: string) {
  const field = readable({ value: form.get(path), fieldState: null as any }, (set) =>
    form.subscribeToPath(path, (v: any, fs: any) => set({ value: v, fieldState: fs }))
  );
  return field;  // consumer: const { value, fieldState } = $field;
}
```

tsup config: `external: ['svelte', 'svelte/store']`.

**Option B:** Rename `index.ts` → `index.svelte.ts` and build using `@sveltejs/package` (the official Svelte package build tool) instead of tsup. This preserves the rune-based API but requires adding `@sveltejs/package` as a devDependency and a `svelte.config.js`.

---

## 10. Test Suite

Single file: `packages/core/test/form.test.ts`

| Block | Key cases |
|---|---|
| Initialization | Deep clone isolation (no reference leak), initial state shape, `batchDepth` starts at 0 |
| get / set | Nested reads/writes, no-op on deep-equal value, touch flag, `validate:false` skips runValidation |
| Dirty tracking | Marks dirty on change, clears when value returns to initial |
| Sync validation | Valid form returns true, errors keyed by path, scoped merge leaves unrelated errors intact |
| Async validation | Debounce fires after `asyncDebounceMs`, stale epoch results discarded (concurrent race), AbortSignal fires when same path re-validated, concurrent paths do not cancel each other's timers (bug #8 regression) |
| Dependency graph | Direct dep triggers co-validation, transitive chain resolves, circular graph does not loop, wildcard index substitution (`destinations.*.url` → `destinations.1.url`), wildcard paths on initially-empty arrays (bug #12 regression) |
| Batching | Multiple `set` calls inside `batch()` produce exactly one notification (bug #7 regression: nested batch does not fire early) |
| Array — arrayAppend | Adds item, triggers validation |
| Array — arrayInsert | Inserts at index, shifts errors/touched/dirty indices up, out-of-bounds is no-op |
| Array — arrayRemove | Splices, shifts indices down, last-element removal, out-of-bounds no-op |
| Array — arrayMove | Rekeyes state correctly, `fromIndex === toIndex` is no-op |
| Array — arraySwap | Swaps metadata, single-element array is no-op |
| notify() performance | With no global subscribers, `getState()` (deep clone) is NOT called (bug #9 regression) |
| isDeepEqual | O(N) key lookup via Set (not array), circular references handled without infinite loop |
| Reset | Clears errors/touched/dirty, restores initial values, `reset(newValues)` re-seeds baseline so dirty tracks against new initial |
| Payload isolation | `getPayload()` returns only connected + persisted paths, not full values object |
| Subscriptions | `subscribe` fires immediately on attach, unsubscribe stops notifications; `subscribeToPath` fires only on matching path mutations; `'*'` fires on every change |
| Destroy | No notifications fire after `destroy()` |

Adapter integration tests live in each adapter package's `test/` directory and require the relevant framework test environment:

| Adapter | Test environment | Key cases |
|---|---|---|
| React | `@testing-library/react` + `vitest` | `useFormPath` callback receives updated value; `useFormPath` does NOT re-render when an unrelated path changes; `useFormConnect` wires DOM input with no React state re-render |
| Svelte | `@testing-library/svelte` + `vitest` | `useSvelteFormPath` reactive value updates on path change; `onDestroy` unsubscribes correctly |
| Vue | `@testing-library/vue` + `vitest` | `useVueFormPath` updates ref on path change; reactive path (MaybeRef) re-subscribes when path changes |
| Solid | `@solidjs/testing-library` + `vitest` | `useSolidForm` with `reconcile` — unrelated field change does NOT re-run accessor that reads only one field; `useSolidFormPath` returns updated signal |
| Angular | `TestBed` + `vitest` | `useAngularFormPath` signal updates; throws outside injection context |

---

## 11. VitePress Documentation

### 11.1 Site Metadata

- **Title:** `@agw/form`
- **Description:** Zero-dependency, framework-agnostic reactive form engine
- **Base:** `/agw-form/` (GitHub Pages sub-path)
- **Theme:** Default VitePress theme, custom accent color

### 11.2 Navigation

**Top nav:** Home · Getting Started · API · Guides · Playground

**Sidebar — API Reference:** Overview · createForm & Core API · DOM Connect Bridge · Array Operations · Validation Adapters

**Sidebar — Framework Guides:** React · Svelte 5 · Vue 3 · SolidJS · Angular

**Sidebar — Advanced:** Async Validation · Dependency Graph · Multi-Step Forms

### 11.3 Content Standards

- Consumer-facing only — no internal algorithm detail, no complexity notation, no mention of "trie"
- Every page opens with a working code example
- Performance claims are limited to what is demonstrably true after the bug fixes in this spec
- Framework guide pages show minimal wiring first, then path-scoped hook pattern
- `playground.md` embeds `hardened_sandbox_playground.html` via `<iframe>`

### 11.4 GitHub Actions Deployment

`.github/workflows/docs.yml` triggers on push to `main`, runs `pnpm run docs:build`, deploys `docs/.vitepress/dist` to `gh-pages` branch via `actions/deploy-pages`.

---

## 12. CLAUDE.md Updates

- Add `docs:dev`, `docs:build` commands
- Update adapter package names to `form-*` convention
- Remove "Known Issues" section (all fixed)
- Add VitePress section

---

## 13. Implementation Order

1. Engine bug fixes (#7 batch depth + path flush, #8 debounce, #9 notify clone + caller updates, #10 isDeepEqual, #11 WeakMap, #12 wildcard deps, #13 validator snapshot)
2. New validator adapters + `arrayInsert` (#2, #3)
3. Solid adapter: `createStore`/`reconcile` fix + `useSolidFormPath` (§7.5) — correctness issue; fix before any adapter integration testing
4. React adapter: `useFormPath` signature fix (§7.1) + `useFormConnect` (§7.2)
5. Svelte adapter: rewrite to `svelte/store` API (Option A from §9) + `useSvelteFormPath` (§7.3)
6. Vue adapter: `useVueFormPath` with `MaybeRef<string>` (§7.4)
7. Angular adapter: `useAngularFormPath` (§7.6)
8. Package renames (update each adapter `package.json` name, alias `package.json` deps + workspace refs, root `tsconfig.json` paths)
9. Adapter build scripts + tsup configs with correct `external` declarations (§9)
10. Alias package stub re-exports (§8)
11. Delete orphan files
12. Expanded test suite — core blocks first (can run immediately after step 1), adapter integration tests after step 9
13. VitePress setup + config
14. All doc content (framework guide pages show global hook + path hook side-by-side for each adapter)
15. GitHub Actions workflow
16. CLAUDE.md update
