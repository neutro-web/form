# Modular Bundle Splitting — API Design

Date: 2026-07-03
Status: Approved (design phase)
Release gate: v0.5.0, item 2 of 6 (see memory `project_v050_release_gate`)
Supersedes/completes: `docs/superpowers/specs/2026-07-02-modular-bundle-splitting-design.md` (that draft identified the opportunity and explicitly deferred "its own brainstorming pass on the actual public API design before implementation" — this spec is that pass, and is the authoritative design going forward)

## Problem

`packages/core/src/index.ts` (3046 lines) bundles array operations, the DOM bridge (`connect`/`disconnect`/`MutationObserver`), persistence adapters, and computed fields into every consumer's bundle unconditionally, even for a form that only uses `set`/`get`/`validate`. `bundle-size` is `➖ Tied` against react-hook-form/vee-validate — closer than the tanstack-form/felte gaps and, unlike those, has real headroom: RHF's own bundle doesn't ship array-field support unless `useFieldArray` is imported.

The blocker isn't `sideEffects: false` (already set in both `packages/core/package.json` and `packages/alias/package.json`) — it's structural: `.connect()`, `.arrayRemove()`, etc. are methods on the object `createForm` returns, not top-level module exports. Tree-shaking has no visibility into which methods a consumer calls at runtime on an opaque closure object; it can only drop unused *module-level* exports. Making features tree-shakeable requires moving them out of `createForm`'s single closure body into separately-imported composition functions.

## Non-goals

- **No immutable/Redux-style state-tree redesign.** The engine keeps its current hybrid mutation model (state is mutated, not replaced with new objects on every change) — see "The mutation invariant" below for the one adjustment this spec makes to that model. A structural-sharing immutable rewrite was explicitly considered and rejected for this item: it would require rewriting the notify/batching/`pathIndex` machinery around immutable snapshots, reintroduces the exact class of shared-mutable-state risk this release has already hit 3+ times (now with a bigger blast radius), and trades away the O(1)/field-level-reactivity performance story that differentiates this engine from competitors — all for a bundle-size goal that doesn't require it.
- **No runtime feature-flag API** (e.g. `createForm({ features: ['arrayOps'] })`). Tree-shaking operates on which *module* a consumer imports, not on runtime configuration values — a feature flag chosen at call time can't be shaken out of the bundle, since the bundler can't prove the flag is always false. The only mechanism that actually reduces bundle size is separate entry points.
- **No finer-than-two-tier granularity** (e.g. separate entry points per individual feature cluster). Two tiers (`full` / `minimal`) is the pragmatic starting point matching real usage (consumers import the whole package and use most of it, or want the smallest possible footprint); a fully composable pick-your-features API is a much larger design space, out of scope unless the two-tier split proves the hypothesis and there's real demand for finer control.
- **No change to framework adapters' behavior.** `minimal` is a headless/vanilla-JS-only tier for this iteration — React/Vue/Svelte/Solid/Angular adapters continue to require the full `@neutro/form/core`, since they call DOM-bridge methods (`.connect()`) that `minimal` doesn't have.

## Design

### Architecture

`packages/core/src/index.ts` splits into:

- **`src/engine.ts`** (new): the shared core. Exports `createCoreForm<T>(config): { ctx: FormEngineContext<T>; instance: MinimalFormInstance<T> }`. Contains `values`/`errors`/`touched`/`dirty`/`wasSet`/`validatedPaths`/`pathSubscribers`/`pathIndex`, the notify/batch machinery, and validation — everything currently in `createForm`'s closure that isn't array ops, DOM bridge, persistence, or computed fields. `instance` implements `set`/`get`/`validate`/`subscribe`/`subscribeToPath`/`reset`/`resetField`/`submit`/`getState`/`getPayload`/`isFieldValid`/`isFieldDirty`/`isDirty`.
- **`src/features/array-ops.ts`**: exports `attachArrayOps<T>(ctx): ArrayOpsMethods<T>` — `arrayAppend`/`arrayInsert`/`arrayRemove`/`arrayMove`/`arraySwap` and their internal `shiftStateIndices`/`rekeyArrayState` machinery (including the `pathIndex`-based candidate-lookup rewrites from the prior release-gate item — moved verbatim, no behavior change).
- **`src/features/dom-bridge.ts`**: exports `attachDomBridge<T>(ctx): DomBridgeMethods<T>` — `connect`/`disconnect`/`focus`/`focusFirstError`/`getAriaProps`, the `MutationObserver` lifecycle, `connectionRegistry`/`connectedPaths`/`persistedPaths`.
- **`src/features/persistence.ts`**: exports `attachPersistence<T>(ctx): PersistenceMethods<T>` — `hydrate`, adapter wiring (`localStorageAdapter`/`sessionStorageAdapter` stay as standalone exported functions, unaffected — only the `hydrate()` method and its ctx-wiring move).
- **`src/features/computed-fields.ts`**: exports `attachComputedFields<T>(ctx): ComputedFieldsMethods<T>` — `computedMap`, `flattenComputedConfig`, `runComputedPass`.
- **`src/index.ts`** (existing file, now much smaller): the full entry point. Calls `createCoreForm`, then `Object.assign`s the four `attachX(ctx)` results onto `instance`, returning it typed as `FormInstance<T>`. This is the **only** change existing consumers see, and it's invisible: same function signature, same returned object shape, same method behavior.
- **`src/minimal.ts`** (new): the minimal entry point. Calls `createCoreForm` and returns `instance` as-is, typed as `MinimalFormInstance<T>`.

### The `ctx` object and the mutation invariant

`ctx: FormEngineContext<T>` is a single plain object holding every field currently captured by `createForm`'s closure (`values`, `errors`, `touched`, `dirty`, `wasSet`, `validatedPaths`, `pathSubscribers`, `pathIndex`, `pendingPaths`, `pendingExactPaths`, `batchDepth`, `config`, `initialValues`, `isSubmitting`, `isValidating`, etc.), passed by reference into `createCoreForm` and each `attachX` function. It is purely internal — never exported, never part of any public type.

**Hard invariant, required by this design and enforced going forward: no field on `ctx` is ever reassigned to a new object/array/Set/Map — every field is mutated in place (cleared and repopulated, not replaced).** Today, `touched`/`dirty`/`wasSet`/`validatedPaths`/`pathSubscribers`/`pathIndex` already follow this pattern. `errors` is the one exception (`runValidation` currently does `errors = combined` / `errors = mergeScopedErrors(...)`) and **this spec requires converting it** to clear-and-repopulate-in-place, as part of this implementation (not deferred).

**Why this invariant matters for this specific refactor:** today, `errors` is a `let` in one function scope, so every nested closure automatically observes reassignment — there's no way to hold a "stale" reference to it, because nothing captures it into a separate variable. Splitting feature code into separately-composed functions that receive `ctx` removes that free guarantee: a feature function could destructure `const { errors } = ctx` at setup time and then read a permanently-stale snapshot after the next validation reassigns `ctx.errors` to a new object. The correct discipline ("always read `ctx.errors` fresh, never destructure-and-cache") is necessary but is a convention, not a guarantee — a human or AI implementer can violate it with no automatic backstop. Making `errors` never-reassigned removes the hazard by construction: even a function that destructures `const { errors } = ctx` gets a reference to the *same* object that keeps being mutated under it, so the destructured reference stays live forever. This is not a performance optimization or a stylistic preference — it is the mechanism that makes the `ctx`-based composition safe without relying on every future contributor remembering a rule.

**Practical effect on `runValidation`:** the three `errors = ...` reassignment sites (patched with `reindexErrors`'s diff-by-object-identity logic in the prior release-gate item) become: clear `ctx.errors` of keys not present in the new result (calling `unindexKey` per removed key), then assign each new key onto the *same* `ctx.errors` object (calling `indexKey` per newly-added key) — tracking index changes as the clear/repopulate happens, not via a before/after diff. This removes `reindexErrors` as a separate function; its logic is inlined into the clear/repopulate pass. This is a genuine behavior-preserving refactor of that logic, not new functionality — the observable result (which keys end up in `errors`, when notifications fire) is unchanged; only the mechanism for keeping `pathIndex` in sync changes shape.

**Secondary defense-in-depth (optional polish, not required for correctness):** a custom biome/lint rule flagging `const { X } = ctx` destructuring patterns for known `ctx` fields, catching any future violation attempt at CI time. Since the mutation invariant eliminates the bug class by construction, this lint rule is a "belt" alongside the invariant's "suspenders" — worth adding if low-effort, not a blocker if it turns out to be awkward to write correctly.

### Public API surface

```ts
// FormEngineContext<T> — internal only, never exported

interface MinimalFormInstance<T> {
  set(path, val, options?): void;
  get(path): unknown;
  validate(scopePaths?): Promise<boolean>;
  subscribe(fn): () => void;
  subscribeToPath(path, fn): () => void;
  subscribeToPathDynamic(path, fn): () => void;
  reset(newValues?): void;
  resetField(path, options?): void;
  submit(onSubmit): Promise<boolean>;
  handleSubmit(onSubmit, onInvalid?): (e?) => Promise<void>;
  getState(): FormState<T>;
  getPayload(): Partial<T>;
  batch(fn): void;
  isFieldValid(path): boolean | null;
  isFieldDirty(path): boolean;
  isDirty(): boolean;
  setErrors(errors): void;
  clearErrors(): void;
  getFieldMode(path): ValidationMode;
  watch(paths, callback): () => void;
  // ... every other method NOT tied to array-ops/DOM-bridge/persistence/computed-fields
}

interface FormInstance<T> extends MinimalFormInstance<T> {
  // Array ops
  arrayAppend<P>(path, item): void;
  arrayInsert<P>(path, index, item): void;
  arrayRemove<P>(path, index): void;
  arrayMove<P>(path, from, to): void;
  arraySwap<P>(path, a, b): void;
  // DOM bridge
  connect(path): (el) => void;
  getConnectedCount(): number;
  focus(path): boolean;
  focusFirstError(): boolean;
  getAriaProps(path, options?): AriaProps;
  // Persistence
  hydrate(): Promise<void>;
  // (computed fields have no distinct public methods today — they affect
  //  `values` reactively; excluding attachComputedFields from minimal means
  //  a minimal-tier form simply has no `computed` config option honored)
  destroy(): void;
  _subscribeToActions(fn): () => void;
}
```

`FormInstance<T> extends MinimalFormInstance<T>` is the key ergonomic property: since it's a strict structural superset, upgrading from `minimal` to full is a **pure widening** — switch the import path, and every method already in use still exists, plus the new ones become available. No other code changes are required. The one edge case: a consumer who explicitly annotated a variable with the narrower `MinimalFormInstance<T>` type would need to update that annotation too — an unusual, deliberate choice, not the normal path (normal usage relies on `createForm`'s inferred return type, which changes automatically with the import).

`FormConfig<T>`'s `computed` option is accepted by both entry points' `createForm` signature for type-compatibility (so switching entry points never causes a config-shape type error), but is silently a no-op under `minimal` (computed fields require `attachComputedFields`, not present). This is flagged in JSDoc on the `computed` field and in the documentation (see below) rather than causing a compile error, since detecting "config option provided but its handler isn't attached" at the type level would require conditional types keyed to which entry point is used — disproportionate complexity for a config option that most `minimal` consumers won't set in the first place.

### Compile-time vs. runtime failure mode

A `minimal`-tier consumer calling `.arrayRemove()` fails at **compile time** — `MinimalFormInstance<T>` has no such method, so TypeScript rejects the call before the code ever runs. This is the correct failure mode: an adapter or application code that assumes DOM-bridge/array-op methods exist should never successfully compile against a `minimal` form, not throw a runtime error a user discovers in production.

### Package/build changes

- `packages/core/tsup.config.ts`: `entry: ['src/index.ts', 'src/minimal.ts', 'src/devtools.ts']`.
- `packages/core/package.json` `exports`: add `"./minimal"` mapping to `dist/minimal.{js,cjs}`/`dist/minimal.d.ts`, mirroring the existing `"./devtools"` entry.
- `packages/alias/src/core-minimal.ts` (new): `export * from '@neutro/form-core/minimal'`, mirroring `src/core.ts`'s existing re-export pattern.
- `packages/alias/tsup.config.ts`: add `'core/minimal': 'src/core-minimal.ts'` to `entry`.
- `packages/alias/package.json` `exports`: add `"./core/minimal"` mapping, mirroring the existing `"./core"` entry. Public import path: `@neutro/form/core/minimal`.
- Root `tsconfig.json` path mapping (per existing convention for local dev): add `@neutro/form/core/minimal` → `packages/core/src/minimal.ts`.

## Testing

1. **Full existing suite unmodified.** Every test in `packages/core/test/*.test.ts` must pass against the refactored `src/index.ts` with zero test changes — this is the primary regression guard proving the composition refactor preserves 100% of full-package behavior.
2. **`errors` mutate-in-place conversion.** New/adapted tests covering: scoped validation leaving unrelated errors untouched (mirroring the existing `mergeScopedErrors` test coverage), async validation races (abort/epoch handling unaffected by the reassignment→mutation change), and a fuzz-style check (in the spirit of the `pathIndex` fuzz test) that `errors`'s final key set and `pathIndex` stay consistent across interleaved validate/set/reset operations — this is the same class of correctness risk the prior release-gate item's `pathIndex` work already built tooling for (`_debugRawState()`, `_debugPathIndex()`), so this conversion should reuse those debug accessors rather than inventing new ones.
3. **New `packages/core/test/minimal.test.ts`.** Imports from `src/minimal.ts`; exercises every `MinimalFormInstance` method; includes `// @ts-expect-error` assertions confirming `.arrayRemove`/`.connect`/`.hydrate`/etc. are not callable on the minimal type (a compile-time test, verified by `tsc --noEmit` succeeding — a missing `@ts-expect-error` where one is needed, or a stale one where the method now exists, both surface as `tsc` failures).
4. **Bundle-size fixture.** New `bench/fixtures/bundle/neutro-minimal.ts` importing from `@neutro/form-core/minimal` (or the alias path, matching the existing `neutro.ts` fixture's import convention), calling only `set`/`get`/`validate` — measured as a new `neutro/form (minimal)` row alongside the existing `neutro/form (full)` row in the bundle-size benchmark, per the original draft spec's verification section (report both, don't hide the tradeoff).
5. **Full pipeline sweep** (per this release's established discipline): `pnpm lint && pnpm exec tsc --noEmit && pnpm build && pnpm test` all green before considering any task in the eventual implementation plan complete.

## Documentation (explicit deliverable)

Per explicit instruction: this split must be documented clearly enough to be self-explanatory, not just technically correct.

1. **New VitePress guide page** (`docs/guides/bundle-size-tiers.md` or similar): explains what `minimal` is, the exact four excluded clusters (array ops, DOM bridge, persistence, computed fields), **why those four specifically** (they are the features with genuine DOM/dynamic-array/storage footprint that a meaningful fraction of real forms never touch at all — the same reasoning RHF applies by gating `useFieldArray` behind its own import), and the one-line upgrade path (`@neutro/form/core/minimal` → `@neutro/form/core`).
2. **FAQ entry**: "Which import should I use?" — a short decision tree: need dynamic arrays, OR DOM auto-binding via `.connect()`, OR persistence, OR computed fields → use `@neutro/form/core`; none of the above → `@neutro/form/core/minimal` is smaller and drop-in compatible if you later need more.
3. **Inline JSDoc** on both `createForm` exports, each pointing at the other (`minimal`'s docstring: "Need array operations, DOM binding, persistence, or computed fields? Import from `@neutro/form/core` instead — it's a drop-in superset."; full's docstring: "Only need `set`/`get`/`validate`/`subscribe`? `@neutro/form/core/minimal` ships a smaller bundle.").
4. **README/package description update** if the package's top-level docs currently imply array-ops/DOM-bridge are always bundled at whatever size is quoted — the bundle-size claim should be presented per-tier once this ships, not as a single number.

## Risks

- **Refactor blast radius**: this touches the entire `createForm` closure body — every one of its ~3000 lines gets relocated into one of five files. Given this release's history (3+ rounds of subtle shared-notify-machinery bugs, plus the 4 real bugs found across the `pathIndex` work), the implementation plan for this spec must apply the same discipline: TDD, fresh-subagent-per-task, independent adversarial review per task, and a final whole-branch review — not treated as a mechanical move-code refactor just because no logic is intended to change.
- **`errors` mutate-in-place conversion is a genuine logic change**, not a pure relocation, and is the highest-risk single piece of this spec — it touches validation's error-reporting path directly. It should be its own early task in the implementation plan, landed and fully verified (including against the existing `pathIndex` fuzz-test-style tooling) before the file-splitting work begins, so a regression here isn't conflated with a relocation mistake elsewhere.
- **Silent computed-fields no-op under `minimal`**: a consumer who sets `computed` in `FormConfig` while using `@neutro/form/core/minimal` gets no error, just silently non-functional computed fields (see "Public API surface" above for why this isn't type-checked away). The documentation must make this explicit and prominent, not buried — this is the one place in this design where a consumer's config could look correct and behave incorrectly with no warning.
- **Adapter compatibility must be verified, not assumed**: the design non-goal states adapters require full `@neutro/form/core`, but this should be confirmed against each adapter's actual source (`packages/adapters/*/src/index.ts`) during implementation — if any adapter happens to only use `MinimalFormInstance`-compatible methods today, that's a fact worth knowing (though not a reason to change this spec's scope).

## Open questions for the implementation plan

- Exact enumeration of every method/field in the current `createForm` closure and which of the five destination files (`engine.ts` or one of the four `features/*.ts`) it belongs to — this spec identifies the clusters by name but the plan needs a complete, verified mapping (similar in spirit to the exhaustive call-site audit the `pathIndex` plan required).
- Whether the `errors` mutate-in-place conversion can reuse `pathIndex`'s existing `_debugRawState()`/`_debugPathIndex()` test infrastructure directly or needs its own equivalent — decide during planning by reading that infrastructure's actual current shape.
- Sequencing: `errors` conversion first (as its own fully-verified task), then the five-way file split, then the two entry points' build/export wiring, then documentation — the plan should make this ordering explicit rather than implicit.
