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

## Scope correction (post-round-1-review)

Round 1 adversarial review found the original draft's cluster boundaries didn't hold up against the real code in several concrete ways. This section documents the corrections; the rest of "Design" below reflects the corrected shape, not the original draft.

1. **`errors` reassignment is not confined to `runValidation`.** `arraySwap`'s `swapKeys`, `shiftStateIndices`, and `rekeyArrayState` (all array-ops) also reassign `errors` wholesale, as does `reset()` (engine-level). The mutation invariant (see below) must apply at every one of these sites, not just the three in `runValidation` — see "Practical effect," corrected below.
2. **`getPayload()`/`submit()` depend on DOM-bridge-only state and would silently break under `minimal`.** `getPayload()` filters `values` by `connectedPaths`/`persistedPaths`, both populated only by `attachDomBridge`'s `connect()`. Under `minimal`, those Sets never populate, so `getPayload()` always returns `{}` and every `submit()` callback receives an empty payload. This is a **pre-existing gap in the current engine**, not one this split introduces — any full-mode consumer today who calls `submit()`/`getPayload()` without ever calling `.connect()` on any field already silently gets `{}` back. The split just surfaces it, since `minimal` is explicitly pitched as usable headlessly. **Decision (confirmed with user): fix this for both tiers.** `getPayload()`/`submit()`'s payload construction falls back to returning the full unfiltered `values` object whenever DOM-bridge was never attached/never used (i.e., `connectedPaths` and `persistedPaths` are both empty because `attachDomBridge` never ran, or ran but nothing was ever connected) — see "Public API surface" corrections below. This is a genuine, intentional behavior change for the narrow existing case of "full-mode app that calls `submit()`/`getPayload()` without using `.connect()`" (today: silently `{}`; after this change: real values) — call this out explicitly in the CHANGELOG for the release this ships in, since it's a user-visible behavior difference, not just an internal refactor.
3. **`reset()`/`resetField()` read from `connectionRegistry` directly** (to push reset values into live DOM elements), which the original draft treated as purely DOM-bridge-owned state.
4. **`computedMap.has(path)` gates writes inside `setFieldValue` itself** (the engine's core write path), and computed-fields execution reaches directly into `batchDepth`/`pendingPaths` (private batch-machinery internals) rather than going through `notify()`. The original draft's framing of computed-fields as "no distinct public methods, just affects values reactively" understated this: it's not a passive bolt-on, it's wired into the write path and batch internals. This requires a real extension-point mechanism — see "Engine extension points" below — not just "feature functions read ctx."
5. **Array-ops methods call `runValidation`/`dispatchAction` directly**, and **`reset()`/`hydrate()` call `notifyGlobalSubscribers`/`notifyPathSubscribers` directly** rather than through `notify()`. Both mean `ctx` must expose these as callable engine-primitive functions, not just data fields.
6. **Confirmed clean**: `notify`/`batch`/`dispatchAction`/`_flushNotifications` contain no cluster-specific branches and are correctly engine-only code as originally described. **Also confirmed**: there is no actual stale-read bug in the *current* `runValidation` (the `oldErrors` capture and reassignment happen synchronously with no `await` between them) — the mutation invariant remains prophylactic for the composition refactor, not a fix for an existing defect, exactly as the original draft stated.

### Engine state reclassification: `connectionRegistry`/`connectedPaths`/`persistedPaths` are engine-level, not DOM-bridge-owned

Per finding 3 (and 2), these three structures must live in `engine.ts`'s `ctx` unconditionally — always present, always empty unless `attachDomBridge` populates them via `connect()`. `attachDomBridge` *populates* them; it does not *own* their existence. This lets `reset()`/`resetField()`/`getPayload()`/`submit()` (all engine-level) reference them without importing anything from `dom-bridge.ts`, and lets the getPayload/submit fallback (finding 2's fix) check "are these empty" without depending on whether `attachDomBridge` ran at all.

### Engine extension points (per finding 4)

Rather than `setFieldValue` hard-coding a `computedMap.has(path)` check and calling `runComputedPass()` directly, `engine.ts` exposes two narrow, generic hook slots on `ctx`, initialized to no-ops and optionally overridden by `attachComputedFields`:

- `ctx.isComputedField: (path: string) => boolean` — defaults to `() => false`. `setFieldValue`/`set`/`setDynamic` call this instead of `computedMap.has(path)` directly.
- `ctx.runComputedPass: () => void` — defaults to a no-op. `setFieldValue` calls this instead of importing/calling `runComputedPass` directly, at the same point in the write path as today (including the existing `batchDepth`/`pendingPaths` interaction — that interaction stays inside `engine.ts`'s `setFieldValue`, since it's genuinely part of the engine's batching contract, not something `attachComputedFields` should reach into from outside).

`attachComputedFields(ctx)` overwrites both hooks (`ctx.isComputedField = (path) => computedMap.has(path); ctx.runComputedPass = () => { /* existing logic */ };`) when it runs. Under `minimal` (where `attachComputedFields` never runs), the defaults mean `setFieldValue`'s existing guard/call sites behave exactly as if no computed fields were ever configured — which is correct, since `minimal` doesn't accept a meaningful `computed` config anyway. This is a small, generic pattern (two hook slots, not a general plugin system) — deliberately not overengineered into a broader extension mechanism, since computed-fields is the only cluster with this shape of coupling (array-ops/dom-bridge/persistence don't hook into the write path itself, they're called independently).

## Design

### Architecture

`packages/core/src/index.ts` splits into:

- **`src/engine.ts`** (new): the shared core. Exports `createCoreForm<T>(config): { ctx: FormEngineContext<T>; instance: MinimalFormInstance<T> }`. Contains `values`/`errors`/`touched`/`dirty`/`wasSet`/`validatedPaths`/`pathSubscribers`/`pathIndex`, the notify/batch machinery, validation, and — per the scope correction above — `connectionRegistry`/`connectedPaths`/`persistedPaths` (always present, populated only if `attachDomBridge` runs) and the two `isComputedField`/`runComputedPass` hook slots (defaulted to no-ops). `ctx` exposes not just data fields but callable engine primitives that other clusters need directly: `ctx.runValidation`, `ctx.dispatchAction`, `ctx.notify`, `ctx.notifyGlobalSubscribers`, `ctx.notifyPathSubscribers`, `ctx.batch` — since array-ops (calls `runValidation`/`dispatchAction` directly) and `reset()`/`hydrate()` (call the notify-subscriber functions directly, bypassing `notify()`) both need these as first-class callable primitives, not just data to read. `instance` implements `set`/`get`/`validate`/`subscribe`/`subscribeToPath`/`reset`/`resetField`/`submit`/`getState`/`getPayload`/`isFieldValid`/`isFieldDirty`/`isDirty`.
- **`src/features/array-ops.ts`**: exports `attachArrayOps<T>(ctx): ArrayOpsMethods<T>` — `arrayAppend`/`arrayInsert`/`arrayRemove`/`arrayMove`/`arraySwap` and their internal `shiftStateIndices`/`rekeyArrayState` machinery (including the `pathIndex`-based candidate-lookup rewrites from the prior release-gate item). Per the scope correction above, this module's own `errors` reassignment sites (`arraySwap`'s `swapKeys`, `shiftStateIndices`, `rekeyArrayState`) are converted to the same mutate-in-place pattern as `runValidation`'s (see "Practical effect," corrected below) — this is **not** a verbatim move for those specific lines, though the surrounding shift/rekey/swap logic itself is unchanged.
- **`src/features/dom-bridge.ts`**: exports `attachDomBridge<T>(ctx): DomBridgeMethods<T>` — `connect`/`disconnect`/`focus`/`focusFirstError`/`getAriaProps`, the `MutationObserver` lifecycle. Populates (but per the scope correction above, does not own the existence of) `ctx.connectionRegistry`/`ctx.connectedPaths`/`ctx.persistedPaths`.
- **`src/features/persistence.ts`**: exports `attachPersistence<T>(ctx): PersistenceMethods<T>` — `hydrate`, adapter wiring (`localStorageAdapter`/`sessionStorageAdapter` stay as standalone exported functions, unaffected — only the `hydrate()` method and its ctx-wiring move).
- **`src/features/computed-fields.ts`**: exports `attachComputedFields<T>(ctx): ComputedFieldsMethods<T>` — `computedMap`, `flattenComputedConfig`, `runComputedPass`.
- **`src/index.ts`** (existing file, now much smaller): the full entry point. Calls `createCoreForm`, then `Object.assign`s the four `attachX(ctx)` results onto `instance`, returning it typed as `FormInstance<T>`. This is the **only** change existing consumers see, and it's invisible: same function signature, same returned object shape, same method behavior.
- **`src/minimal.ts`** (new): the minimal entry point. Calls `createCoreForm` and returns `instance` as-is, typed as `MinimalFormInstance<T>`.

### The `ctx` object and the mutation invariant

`ctx: FormEngineContext<T>` is a single plain object holding every field currently captured by `createForm`'s closure (`values`, `errors`, `touched`, `dirty`, `wasSet`, `validatedPaths`, `pathSubscribers`, `pathIndex`, `pendingPaths`, `pendingExactPaths`, `batchDepth`, `config`, `initialValues`, `isSubmitting`, `isValidating`, etc.), passed by reference into `createCoreForm` and each `attachX` function. It is purely internal — never exported, never part of any public type.

**Hard invariant, required by this design and enforced going forward: no field on `ctx` is ever reassigned to a new object/array/Set/Map — every field is mutated in place (cleared and repopulated, not replaced).** Today, `touched`/`dirty`/`wasSet`/`validatedPaths`/`pathSubscribers`/`pathIndex` already follow this pattern. `errors` is the one exception (`runValidation` currently does `errors = combined` / `errors = mergeScopedErrors(...)`) and **this spec requires converting it** to clear-and-repopulate-in-place, as part of this implementation (not deferred).

**Why this invariant matters for this specific refactor:** today, `errors` is a `let` in one function scope, so every nested closure automatically observes reassignment — there's no way to hold a "stale" reference to it, because nothing captures it into a separate variable. Splitting feature code into separately-composed functions that receive `ctx` removes that free guarantee: a feature function could destructure `const { errors } = ctx` at setup time and then read a permanently-stale snapshot after the next validation reassigns `ctx.errors` to a new object. The correct discipline ("always read `ctx.errors` fresh, never destructure-and-cache") is necessary but is a convention, not a guarantee — a human or AI implementer can violate it with no automatic backstop. Making `errors` never-reassigned removes the hazard by construction: even a function that destructures `const { errors } = ctx` gets a reference to the *same* object that keeps being mutated under it, so the destructured reference stays live forever. This is not a performance optimization or a stylistic preference — it is the mechanism that makes the `ctx`-based composition safe without relying on every future contributor remembering a rule.

**Practical effect — all `errors` reassignment sites, not just `runValidation` (corrected per round-1 review):** round-1 review found the original draft only accounted for `runValidation`'s three `errors = ...` sites (patched with `reindexErrors`'s diff-by-object-identity logic in the prior release-gate item). Grepping the real file surfaces at least four more, all in array-ops: `arraySwap`'s `swapKeys` closure, `shiftStateIndices`, and `rekeyArrayState` each do `errors = shiftMap(errors)`/`errors = swapKeys(errors)`-style reassignment, plus `reset()` (engine-level) does `errors = {}`. **Every one of these converts to the same clear-and-repopulate-in-place pattern**, not just `runValidation`'s: clear `ctx.errors` of keys not present in the new result (calling `unindexKey` per removed key), then assign each new/kept key onto the *same* `ctx.errors` object (calling `indexKey` per newly-added key) — tracking index changes as the clear/repopulate happens, not via a before/after diff. This removes `reindexErrors` as a separate function; its logic is inlined into each clear/repopulate pass, at each of the (at least) five sites now identified. The implementation plan must do its own exhaustive grep-based audit for `errors = ` reassignment (mirroring the discipline used for the `pathIndex` call-site audit) rather than trusting this enumeration to be complete — this spec's own first draft already undercounted these sites once.

This is a genuine behavior-preserving refactor of existing logic at every site, not new functionality — the observable result (which keys end up in `errors`, when notifications fire) is unchanged; only the mechanism for keeping `pathIndex` in sync changes shape. But because it now spans both `engine.ts` and `features/array-ops.ts`, it can't be landed as one isolated "convert runValidation" task the way the original draft implied — the implementation plan needs to treat this as one atomic conversion across every site, verified together (a partial conversion — some sites mutate-in-place, others still reassign — would violate the invariant for exactly the sites not yet converted, silently reintroducing the destructure-staleness hazard for those).

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

**`getPayload()`/`submit()` fallback behavior (fix for finding 2, confirmed with user — applies to both tiers, not just `minimal`):** `getPayload()`'s underlying `_getPayload(values, connectionRegistry, connectedPaths, persistedPaths)` currently filters `values` down to only paths present in `connectedPaths` or `persistedPaths`, both populated exclusively by `attachDomBridge`'s `connect()`. Since (per the engine-state-reclassification correction above) these three structures now live in `engine.ts` unconditionally, `_getPayload` gains one additional check: **if `connectedPaths` and `persistedPaths` are both empty, return the full unfiltered `values` object** (deep-cloned, as today) instead of the filtered (and, in that case, always-empty) result. This covers both `minimal` (structurally can never populate these Sets, since `attachDomBridge` never runs) and full-mode consumers who never call `.connect()` on anything. Once at least one path is connected or persisted, filtering behaves exactly as it does today — this fallback only activates for the specific "nothing has ever been connected" case, not a general behavior change to the filtering logic itself. **This is an intentional, user-confirmed behavior change** for existing full-mode consumers in that narrow case (today: `submit()`/`getPayload()` silently return `{}`; after this change: they return real values) — call it out explicitly in the release's CHANGELOG, not just in this spec, since it's observable to existing consumers who never call `.connect()`.

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
2. **`errors` mutate-in-place conversion, at every site identified in the scope correction (not just `runValidation`).** New/adapted tests covering: scoped validation leaving unrelated errors untouched (mirroring the existing `mergeScopedErrors` test coverage), async validation races (abort/epoch handling unaffected by the reassignment→mutation change), `arraySwap`/`shiftStateIndices`/`rekeyArrayState`'s own error-shifting behavior unchanged, `reset()`'s error-clearing behavior unchanged, and a fuzz-style check (in the spirit of the `pathIndex` fuzz test) that `errors`'s final key set and `pathIndex` stay consistent across interleaved validate/set/array-op/reset operations — this is the same class of correctness risk the prior release-gate item's `pathIndex` work already built tooling for (`_debugRawState()`, `_debugPathIndex()`), so this conversion should reuse those debug accessors rather than inventing new ones.
3. **`getPayload()`/`submit()` fallback behavior.** Tests proving: (a) full-mode with at least one connected/persisted path behaves identically to today (filtered payload, unchanged), (b) full-mode with zero connected/persisted paths now returns full `values` (the intentional behavior change), (c) `minimal` always returns full `values` (since it can never populate those Sets), (d) the fallback correctly re-activates filtering the instant any path becomes connected/persisted mid-session, not just at initialization.
4. **Engine extension points (`isComputedField`/`runComputedPass` hooks).** Tests proving: under `minimal` (hooks at their no-op defaults), setting a value that would have been a computed field under full mode is a normal writable field with no special guard; under full mode, behavior is byte-for-byte identical to today's `computedMap.has(path)`/`runComputedPass()` direct calls.
5. **New `packages/core/test/minimal.test.ts`.** Imports from `src/minimal.ts`; exercises every `MinimalFormInstance` method; includes `// @ts-expect-error` assertions confirming `.arrayRemove`/`.connect`/`.hydrate`/etc. are not callable on the minimal type (a compile-time test, verified by `tsc --noEmit` succeeding — a missing `@ts-expect-error` where one is needed, or a stale one where the method now exists, both surface as `tsc` failures).
6. **Bundle-size fixture.** New `bench/fixtures/bundle/neutro-minimal.ts` importing from `@neutro/form-core/minimal` (or the alias path, matching the existing `neutro.ts` fixture's import convention), calling only `set`/`get`/`validate` — measured as a new `neutro/form (minimal)` row alongside the existing `neutro/form (full)` row in the bundle-size benchmark, per the original draft spec's verification section (report both, don't hide the tradeoff).
7. **Full pipeline sweep** (per this release's established discipline): `pnpm lint && pnpm exec tsc --noEmit && pnpm build && pnpm test` all green before considering any task in the eventual implementation plan complete.

## Documentation (explicit deliverable)

Per explicit instruction: this split must be documented clearly enough to be self-explanatory, not just technically correct.

1. **New VitePress guide page** (`docs/guides/bundle-size-tiers.md` or similar): explains what `minimal` is, the exact four excluded clusters (array ops, DOM bridge, persistence, computed fields), **why those four specifically** (they are the features with genuine DOM/dynamic-array/storage footprint that a meaningful fraction of real forms never touch at all — the same reasoning RHF applies by gating `useFieldArray` behind its own import), and the one-line upgrade path (`@neutro/form/core/minimal` → `@neutro/form/core`).
2. **FAQ entry**: "Which import should I use?" — a short decision tree: need dynamic arrays, OR DOM auto-binding via `.connect()`, OR persistence, OR computed fields → use `@neutro/form/core`; none of the above → `@neutro/form/core/minimal` is smaller and drop-in compatible if you later need more.
3. **Inline JSDoc** on both `createForm` exports, each pointing at the other (`minimal`'s docstring: "Need array operations, DOM binding, persistence, or computed fields? Import from `@neutro/form/core` instead — it's a drop-in superset."; full's docstring: "Only need `set`/`get`/`validate`/`subscribe`? `@neutro/form/core/minimal` ships a smaller bundle.").
4. **README/package description update** if the package's top-level docs currently imply array-ops/DOM-bridge are always bundled at whatever size is quoted — the bundle-size claim should be presented per-tier once this ships, not as a single number.

## Risks

- **Refactor blast radius**: this touches the entire `createForm` closure body — every one of its ~3000 lines gets relocated into one of five files. Given this release's history (3+ rounds of subtle shared-notify-machinery bugs, plus the 4 real bugs found across the `pathIndex` work), the implementation plan for this spec must apply the same discipline: TDD, fresh-subagent-per-task, independent adversarial review per task, and a final whole-branch review — not treated as a mechanical move-code refactor just because no logic is intended to change.
- **`errors` mutate-in-place conversion is a genuine logic change**, not a pure relocation, and is the highest-risk single piece of this spec — it touches validation's error-reporting path directly, **at (at least) five sites spanning both `engine.ts` and `features/array-ops.ts`**, not the single-module change originally scoped. It should be its own early task in the implementation plan, landed and fully verified (including against the existing `pathIndex` fuzz-test-style tooling) before the file-splitting work begins, so a regression here isn't conflated with a relocation mistake elsewhere. Per the correction above: a partial conversion (some sites converted, others not) is worse than no conversion, since it would leave the invariant violated at exactly the unconverted sites while giving false confidence elsewhere — the implementation plan must treat this as one atomic, exhaustively-audited task.
- **`getPayload()`/`submit()` fallback is a genuine, user-confirmed behavior change**, not just an internal refactor detail — existing full-mode consumers who never call `.connect()` will see `submit()`/`getPayload()` start returning real values instead of `{}`. This must be called out in the release CHANGELOG, and the implementation plan should consider whether it warrants its own explicit test asserting the OLD behavior is gone (a regression test in the "this changed on purpose" direction, not just "the new behavior works").
- **Engine extension points (`isComputedField`/`runComputedPass` hooks) are new indirection in the hottest write path** (`setFieldValue`). Two function-pointer calls per write is unlikely to be measurably slower than the direct calls it replaces, but the implementation plan should include a quick sanity check against existing `bench/suites/core/` write-path benchmarks (e.g. `set-get`) to confirm no regression, given this path is the single most frequently executed code in the entire engine.
- **Silent computed-fields no-op under `minimal`**: a consumer who sets `computed` in `FormConfig` while using `@neutro/form/core/minimal` gets no error, just silently non-functional computed fields (see "Public API surface" above for why this isn't type-checked away). The documentation must make this explicit and prominent, not buried — this is the one place in this design where a consumer's config could look correct and behave incorrectly with no warning.
- **Adapter compatibility must be verified, not assumed**: the design non-goal states adapters require full `@neutro/form/core`, but this should be confirmed against each adapter's actual source (`packages/adapters/*/src/index.ts`) during implementation — if any adapter happens to only use `MinimalFormInstance`-compatible methods today, that's a fact worth knowing (though not a reason to change this spec's scope).

## Open questions for the implementation plan

- Exact enumeration of every method/field in the current `createForm` closure and which of the five destination files (`engine.ts` or one of the four `features/*.ts`) it belongs to — this spec identifies the clusters by name but the plan needs a complete, verified mapping (similar in spirit to the exhaustive call-site audit the `pathIndex` plan required). Given this spec's own first draft undercounted the `errors` reassignment sites and missed the `getPayload`/computed-fields/notify-bypass couplings on the first pass, this audit needs to be genuinely exhaustive (grep every cross-reference, not just the "obvious" methods) rather than a quick pass.
- Whether the `errors` mutate-in-place conversion can reuse `pathIndex`'s existing `_debugRawState()`/`_debugPathIndex()` test infrastructure directly or needs its own equivalent — decide during planning by reading that infrastructure's actual current shape.
- Whether `ctx.notify`/`ctx.notifyGlobalSubscribers`/`ctx.notifyPathSubscribers`/`ctx.runValidation`/`ctx.dispatchAction`/`ctx.batch` (the engine-primitive functions identified in the scope correction) should be plain function properties on `ctx`, or whether some should be bound/curried differently — decide during planning by reading each call site's actual current signature and closure-capture needs.
- Sequencing: `errors` conversion (all five-plus sites, as one fully-verified task) first, then the engine-state reclassification (`connectionRegistry` et al. becoming engine-level) and extension-point hooks, then the `getPayload`/`submit` fallback fix, then the five-way file split, then the two entry points' build/export wiring, then documentation — the plan should make this ordering explicit rather than implicit, since several of these are now prerequisites for the file split rather than independent concerns.
