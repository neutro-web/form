# Modular Bundle Splitting (close the RHF/vee-validate bundle-size gap)

**Date:** 2026-07-02
**Status:** Draft — pending user review
**Scope:** `packages/core/src/index.ts` (export/module structure only — no runtime behavior change), `packages/core/tsup.config.ts` (or equivalent build config), `bench/fixtures/bundle/neutro.ts`

---

## Problem

Unlike the six benchmark-coverage specs above, this one proposes an actual source-code change, not a new measurement. `bundle-size` is currently `➖ Tied` against react-hook-form and vee-validate (within 10%) and `✅ Win` against tanstack-form (17.4 KB) and felte (22.9 KB). The RHF/vee-validate gap is closer and, unlike the tanstack-form gap (already annotated as an inherent architectural tradeoff — `createForm`'s single-closure design can't be tree-shaken at all today), this one has real headroom: `packages/core/src/index.ts` bundles array operations, DOM bridge (`connect`/`disconnect`, `MutationObserver`), and persistence adapters into every consumer's bundle unconditionally, even for a form that only uses `set`/`get`/`validate`.

**Correction from initial draft:** devtools is *not* part of this problem — `src/devtools.ts` is already a separate module with its own tree-shakeable entry point (`@neutro/form/devtools` in `packages/core/package.json`'s `exports` map, wired via `tsup.config.ts`'s `entry: ['src/index.ts', 'src/devtools.ts']`). It's already exactly the pattern this spec proposes for the remaining feature clusters — a useful existing precedent to follow, not something left to do. Similarly, `sideEffects: false` is already set in both `packages/core/package.json` and `packages/alias/package.json` — that's not the blocker (see below).

## Design

### The axiom that must survive: one closure instance, unified state, no external state-management dependency

This spec does **not** propose splitting `createForm` itself into multiple runtime pieces, multiple state stores, or an external composition layer — that would be the actual architectural axiom (unified closure, single source of truth per form instance) that makes the O(1) dependency graph and the notify-cascade fix's design work. What's proposed instead is a **build-time export boundary**: features that a given consumer doesn't import don't ship in their bundle, while `createForm`'s returned object still has every method fully wired at runtime for anyone who imports the full package.

### Approach: internal feature composition, tree-shakeable via separate entry points

1. Identify feature clusters already loosely coupled in `packages/core/src/index.ts` (devtools is already out — see correction above): array operations (`arrayAppend`/`arrayInsert`/`arrayRemove`/`arrayMove`/`arraySwap`/`shiftStateIndices`/`rekeyArrayState`), DOM bridge (`connect`, `MutationObserver` lifecycle), persistence (`localStorageAdapter`/`sessionStorageAdapter` wiring), computed fields (`flattenComputedConfig`, `runComputedPass`).
2. Restructure `createForm` to accept these as **optional composition functions** rather than inline code — e.g. array-op methods get attached to the returned `FormInstance` object by a separate internal function `attachArrayOps(instance, sharedState)`, called unconditionally from `createForm` (so full-package consumers see zero behavior change), but *also* independently exported so a consumer building a custom minimal bundle could theoretically compose only what they need — this is the same idea as how some utility libraries expose both a "kitchen sink" default export and tree-shakeable named exports.
3. **The realistic packaging win, though, is narrower and safer than full custom composition**: most consumers import the whole `@neutro/form/core` package and use most of its features (that's the actual usage pattern — nobody hand-picks "just array ops"). `sideEffects: false` is already set (confirmed in both `packages/core/package.json` and `packages/alias/package.json`), so that flag isn't the blocker — the actual blocker is structural: `.connect()`, `.arrayRemove()`, etc. are *methods on the object `createForm` returns*, not top-level module exports. Tree-shaking operates on unused module-level exports/imports; it has no visibility into which methods a consumer calls on an object at runtime. So even with `sideEffects: false` correctly set, esbuild has no way to drop `connect`'s implementation just because a given consumer's code never calls `.connect()` — the whole `createForm` closure is one opaque unit to the bundler regardless. This is why the bundle-size fixture measurement (`bench/fixtures/bundle/neutro.ts`, which only calls `.set()`/`.validate()`) still pulls in everything.

### Concrete proposal: split by *capability tier*, not by arbitrary file boundary

- `@neutro/form/core` (current default): full `createForm`, everything included — zero change for existing consumers, zero migration required.
- `@neutro/form/core/minimal` (new, optional entry point): a `createForm` variant with array ops, DOM bridge, persistence, and computed fields all omitted from the closure body — just `set`/`get`/`validate`/`subscribe`/`subscribeToPath`/`reset`/`submit`. (Devtools is already excluded from `.` by default via its own separate entry point, so it doesn't need to be part of this list — a `minimal` consumer gets the same devtools-free baseline as a `full` consumer who simply never imports `@neutro/form/devtools`.) For a consumer who genuinely doesn't need array/DOM-bridge/persistence/computed (a common case — many forms don't have dynamic arrays or `connect()`-based DOM binding), this entry point could plausibly get significantly closer to RHF's bundle size, since RHF's own bundle doesn't ship array-field support unless `useFieldArray` is imported either.

This requires **duplicating the shared core** (state maps, validation engine, notify machinery) between the two entry points, OR restructuring so the shared core is one module and each entry point composes it with a different feature set at the module level (preferred — avoids the duplication-drift risk of two parallel implementations of the same notify/validate logic, which given this release's history of subtle notify-machinery bugs is a real risk worth designing around explicitly).

## Verification

New bundle-size fixture: `bench/fixtures/bundle/neutro-minimal.ts` importing from the new `@neutro/form/core/minimal` entry point, measured alongside the existing `neutro.ts` fixture — report both as separate rows (`neutro/form (full)`, `neutro/form (minimal)`) so the tradeoff is honestly visible, not hidden behind picking whichever number is more flattering.

## Risks

- **API surface duplication risk**: two entry points with different `FormInstance` shapes (one has `.arrayRemove()`, one doesn't) is a real TypeScript ergonomics cost — a consumer who imports `minimal` and later needs array ops has to switch imports, not just call a new method. This needs its own brainstorming pass on the actual public API design before implementation — this spec identifies the *opportunity*, not the final interface.
- **Given this release's history** (three separate rounds of subtle bugs in the shared notify machinery, each requiring careful independent re-verification), any refactor that touches how `createForm`'s internals are composed is high-risk and should go through the same TDD-plus-independent-adversarial-review discipline used for the notify-cascade fix, not be treated as a routine bundle-size tweak. Specifically: the "module-level composition" approach in the preferred option above means array-ops/DOM-bridge/persistence/computed-fields would each need read/write access to shared closure state (`values`, `errors`, `touched`, `dirty`, `pathSubscribers`, `pendingPaths`, `pendingExactPaths`) from *outside* `createForm`'s own function body — e.g. via a shared mutable context object passed into each composition function. That's a materially different data-flow shape than today's single-function-scope closures with direct variable capture, and it's exactly the kind of "who updates state, in what order, relative to what else" question that produced this release's bugs (the computed-fields double-notify, the array-root notification gap). This isn't a reason to abandon the approach, but it means the design work (not just the implementation) needs to explicitly enumerate every shared-state read/write per feature module before writing code, not discover the coupling ad hoc during implementation.

## Out of Scope

- Framework-adapter bundle sizes (`@neutro/form-react` etc.) — this spec is core-only; adapters are already thin wrappers and their size is dominated by the framework's own runtime, not neutro's code.
- A full "pick your own features" composition API — the minimal/full two-tier split above is the pragmatic, lower-risk starting point; a fully composable API is a much larger design space, worth revisiting only if the two-tier split proves the bundle-size hypothesis correct and there's real demand for finer-grained control.
