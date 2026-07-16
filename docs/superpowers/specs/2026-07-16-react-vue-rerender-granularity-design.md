# React/Vue Adapter Re-render Granularity

**Date:** 2026-07-16
**Status:** Draft — pending user review
**Scope:** `packages/adapters/react/`, `packages/adapters/vue/`. A fix to `packages/adapters/react/src/index.ts` and/or `packages/adapters/vue/src/index.ts` is in scope only if root-cause finds a real, fixable adapter-level inefficiency. No changes to `packages/core/`, no changes to `bench/apps/*` demo components unless a root-cause finding specifically implicates demo-only code (see Out of Scope). This is v0.5.0 release-gate item 8 (added after all 7 original items were RESOLVED — see the `project_v050_release_gate` memory).

---

## Problem

Item 3 of this release cycle (browser-level schema-validate comparison) measured re-render counts across neutro/form's three adapters — React, Vue, Svelte — for the identical engine, same fixture, same 10-field/20-keystroke-into-one-field scenario. The observed counts were **neutro/form (React) 40, neutro/form (Vue) 30, neutro/form (Svelte) 20**. Svelte's count matches the keystroke count exactly (1 render per keystroke); React's is exactly 2x; Vue's is exactly 1.5x. This was recorded at the time as "reflecting each adapter's own subscription granularity, not a neutro-wide constant" and left uninvestigated — item 3's scope was the comparison surface itself, not each adapter's internal behavior.

Investigation for this spec (reading the real demo components, not just the numbers) found:
- Both the React (`bench/apps/react/src/SchemaValidateNeutro.tsx`) and Svelte (`bench/apps/svelte/src/SchemaValidateNeutro.svelte`) demo components already use fine-grained, per-field subscriptions (`subscribeToPath`/`useFormPath`-equivalent), not a whole-form subscription — so the gap is not an obvious "the demo app subscribes too broadly" mistake.
- Neither app uses `StrictMode` (which would double-invoke renders in dev mode); both are served from a production `vite preview` build via the existing Playwright bench infra — so it's not a dev-mode artifact either.
- The measured scenario has a parent component (`SchemaValidateNeutroPage`) that *also* subscribes to the same path (`field0`) as the child `Field` component being typed into — for an error-banner display. This is a plausible, untested hypothesis for the extra renders: two independent subscribers to the same path, in parent and child, might not batch into a single render pass the way a single subscriber would.
- Neither React's nor Vue's adapter package (`packages/adapters/react/`, `packages/adapters/vue/`) currently has any component-level test coverage. React's adapter package has **zero tests of any kind** — no test runner references, no `react-dom`/testing-library devDependency. Vue's one existing test (`packages/adapters/vue/test/set-errors.test.ts`) runs the `useVueForm` composable inside a bare `effectScope()`, never mounting a real component tree — so it could not have caught a parent+child-subscribing-to-the-same-path render-cascade pattern even if one existed.

So the real gap this item closes is: **neutro's React and Vue adapters have never had their own render behavior directly tested at the component level, and a specific, plausible cause of the observed cross-adapter re-render disparity (dual same-path subscribers in parent and child) has never been isolated and confirmed or ruled out.**

## Design

### Phase 1: New component-level test infrastructure

Neither adapter package can currently mount a real component tree and observe render counts. Add that capability:

- **`packages/adapters/react`**: add `react-dom` and `@testing-library/react` as devDependencies (react itself is already a peerDependency; `@types/react` is already present). New `packages/adapters/react/test/` directory, following the file-per-concern convention already established in `packages/adapters/vue/test/`.
- **`packages/adapters/vue`**: add a real DOM-mounting test utility (`@testing-library/vue`, or `@vue/test-utils` if it fits the existing `effectScope`-based test style more naturally — the implementer should pick whichever integrates with the least friction against the existing `set-errors.test.ts` pattern, and document the choice) as a devDependency. Extend `packages/adapters/vue/test/`.
- Both run through the existing root `vitest.config.ts` (which already excludes only `bench/**`/`node_modules/**` and aliases `@neutro/form-core` to source) plus `jsdom` (already a root devDependency, used by other packages already) — no new top-level test runner or config needed. `vue` itself is resolvable today without an explicit devDependency (confirmed by the existing Vue adapter test importing `effectScope` successfully) — the implementer should trace exactly why (workspace hoisting via another package's dependency, e.g. VitePress's own `vue` dependency) and add an explicit `vue` devDependency to `packages/adapters/vue/package.json` if the implicit resolution is fragile, rather than leave it implicit.

### Phase 2: Minimal repro + root-cause

In each new test file, build a minimal repro that mirrors the *actual structure* found in the bench demo — not a synthetic worst case, the real shape:

- A parent component that subscribes to a specific path (e.g., to conditionally show an error banner for that path) and renders a list of child components.
- A child component, for the *same* path the parent is watching, that independently subscribes to that same path (e.g., to render an `<input>` bound to that field's value) via the adapter's own hook (`useFormPath` for React, the Vue adapter's equivalent).
- Trigger a value change on that path (equivalent to a keystroke) and count how many times the child's render function body executes.

Use this repro to test concrete hypotheses via `systematic-debugging` discipline — form a hypothesis, test it against the repro, don't guess-and-patch:
1. Does removing the parent's own same-path subscription (leaving only the child's) eliminate the extra render(s)? This directly tests whether dual-subscriber-to-the-same-path is the mechanism.
2. If (1) confirms the mechanism, is it specific to how each adapter's hook is implemented (e.g., `useSyncExternalStore` call structure in React, `ref`/`computed` wiring in Vue), or is it an inherent property of how each framework batches updates from external stores that neutro's adapter has no control over?
3. Cross-check against Svelte's adapter/demo structure (which shows the clean 1:1 baseline) — does Svelte's demo *not* have a parent-level same-path subscription at all (an apples-to-oranges comparison, meaning the "2x"/"1.5x" framing itself may be measuring different structures, not different adapter efficiency), or does it have the same structure and simply not exhibit the extra renders (meaning Svelte's reactivity model handles it more gracefully, which would be a genuine adapter-level or framework-level finding)? This check matters — Phase 2's investigation must confirm what is actually being compared before concluding React/Vue "over-render" relative to Svelte.

Document whichever hypotheses are confirmed or ruled out, with the repro test as evidence, before proposing any fix.

### Phase 3: Fix (if warranted) + re-verify

- If root-cause finds a genuine, fixable adapter-level inefficiency — e.g., the adapter's hook implementation could avoid triggering a second render for a case a smarter implementation would collapse into one — fix it in `packages/adapters/react/src/index.ts` and/or `packages/adapters/vue/src/index.ts`, confirm the fix via the new repro test(s) added in Phase 2 (render count drops to the expected value), and re-run the existing full package test suite for both adapters plus `packages/core/test/` to confirm no regression.
- Re-run the existing browser-level `bench/suites/browser/schema-validate-rerenders.spec.ts` (already covers all three frameworks, no new browser test needed) to confirm the real, browser-measured numbers for `neutro/form (React)` and `neutro/form (Vue)` moved in the expected direction. If the numbers move enough to be worth republishing, regenerate `docs/benchmarks/index.md` per the established pipeline (`bench:merge`/`bench:generate`, copying `latest.json` → `baseline.json` first per the documented local-run convention) and disclose the before/after numbers plainly — do not silently republish without noting what changed and why.
- If root-cause instead shows the gap is inherent to each framework's own re-render/batching model (not something neutro's adapter code controls or could avoid without a fundamentally different subscription API), document that finding precisely — which mechanism, why it's out of neutro's control, with the repro test kept as permanent regression coverage proving the *current, understood* behavior — and stop. No fix should be forced where none is warranted; this is an acceptable, honest outcome per this cycle's established standard (matching item 6's "no bug found, mechanism confirmed nesting-agnostic" outcome).

## Expected outcome / hypothesis

Not yet known which of Phase 2's hypotheses will hold — this is genuinely open, unlike some of this cycle's earlier items where a specific mechanism was already suspected with reasonable confidence. Two broad possible outcomes, both real findings either way:
- **If Phase 2 confirms a real, fixable adapter inefficiency:** Phase 3 fixes it, both React and Vue's re-render counts should drop measurably in the browser bench, and the adapter packages gain permanent, real component-level test coverage they currently entirely lack (a second, independent value of this item beyond the specific fix).
- **If Phase 2 finds the gap is an inherent framework cost:** this is disclosed precisely (not hand-waved as "just how React/Vue work"), the repro tests still ship as permanent coverage proving the adapters behave as understood, and the finding becomes documentation (likely a note near the schema-validate-rerenders numbers in `docs/benchmarks/index.md`, if not already adequately covered by existing per-adapter-granularity language) rather than a code change.

## Verification

- Phase 1: `pnpm exec vitest run packages/adapters/react/test/` and `pnpm exec vitest run packages/adapters/vue/test/` — new test files run and pass (initially just proving the repro mounts and renders correctly, before any hypothesis-testing assertions are added).
- Phase 2: repro test(s) assert the confirmed render-count mechanism (e.g., "child renders N times for M value changes, with/without the parent's same-path subscription").
- Phase 3 (if a fix lands): repro test(s) updated to assert the corrected render count; `pnpm exec vitest run packages/adapters/` (both packages) and `pnpm exec vitest run packages/core/test/` green; `pnpm --dir bench install` (if new devDependencies require it) then rebuild the affected bench app(s) (`pnpm --dir bench run bench:apps:build:react` / `:vue`) and re-run `pnpm --dir bench exec playwright test suites/browser/schema-validate-rerenders.spec.ts` to confirm real browser numbers.
- Full pipeline: `pnpm lint && pnpm exec tsc --noEmit && pnpm build && pnpm test` (per `CLAUDE.md`'s pre-push checklist) regardless of which outcome (fix vs. documented-inherent-cost) this item lands on.

## Out of Scope

- `packages/core/` — this item is about adapter-level render behavior, not the core engine's `notify`/`pathSubscribers` mechanism itself. If Phase 2's investigation traces the cause back into core engine behavior shared by all adapters (not adapter-specific), that is a genuine scope-expansion trigger — stop and flag it to the user rather than silently expanding scope, since it would change this item's blast radius significantly.
- Solid and Angular adapters — item 3's `schema-validate-rerenders` surface never measured them (no comparable data exists), so there's no signal to investigate for either. A future item, not bundled here.
- `bench/apps/*` demo component changes — the demo components are treated as a faithful, already-correct representation of real per-field-subscription usage (confirmed during this spec's own investigation), not the thing under test. If Phase 2 finds the demo itself is structured in a way that doesn't represent realistic adapter usage (unlikely, but possible), that becomes a disclosed finding for the user to weigh, not an in-scope fix.
- Republishing `docs/benchmarks/index.md` unconditionally — only regenerate if Phase 3 lands a real fix with numbers worth updating; a documented-inherent-cost outcome does not, by itself, require a docs page change (matching the "no docs changes unless genuinely noteworthy" default used throughout this cycle for items 5-7).
- React Native — no such adapter exists in this codebase; irrelevant to this item.
