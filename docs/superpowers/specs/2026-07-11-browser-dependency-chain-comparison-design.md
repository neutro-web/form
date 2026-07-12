# Browser Dependency-Chain Comparison — Design

**Date:** 2026-07-11
**Status:** Draft — pending user review
**Scope:** `bench/apps/{react,vue,svelte}/src/`, `bench/suites/browser/`, `bench/types/schema.ts`, `bench/annotations.ts`, `bench/scripts/generate-page.ts`, `docs/benchmarks/index.md`.

---

## Problem

`dependency-graph/deep-chain` (`docs/superpowers/specs/2026-07-02-bench-scale-1000-fields-design.md`) is a neutro-only Node/Vitest core benchmark. It quantifies neutro's own O(chain-length-touched) scaling for a 200-field validation-dependency chain (`f_{i+1}` depends on `f_i`), but that spec explicitly deferred any competitor comparison to a future browser-suite follow-on, since core-level competitor shims were removed project-wide (commit `3da9090`) for not faithfully exercising real hook machinery outside a component render context.

Release-gate item 4 closes that gap: a real, browser-rendered head-to-head between neutro's precompiled dependency graph and each competitor's realistic manual-wiring equivalent for the same 200-field chain shape, following the pattern already established by release-gate item 3 (`docs/superpowers/specs/2026-07-09-browser-schema-validate-comparison-design.md`).

## Design

### Chain semantics

Matches the core fixture exactly — **validation-only cascade**, no value propagation. Each field `f_i` (for `i` from 1 to 199) has a validator that reads the current value of `f_{i-1}` and fails if it equals it (e.g. `"must differ from previous field"`). `f0` has no such validator (nothing precedes it). Typing a new value into `f0` should cascade a validation *run* through all 200 fields for every library that supports a chain wiring, but no field's *displayed value* changes as a result — only validation state does.

This keeps the browser number conceptually comparable to the existing core number: both measure "cost of cascading 199 dependent validations triggered by one field's change," not "cost of propagating and rendering 199 new values."

### Metric: set-to-settle latency

One metric, `settleLatencyMs`, following the `schema-validate-submit` bracketing pattern (`bench/suites/browser/schema-validate-submit.spec.ts`):

1. `performance.mark('chain-start')` immediately before typing a single character into `f0`.
2. Type the character.
3. Wait for `f199` (the last field in the chain) to report that its own validator has run at least once more than it had before the keystroke.
4. `performance.mark('chain-end')` and `performance.measure('chain-settle', 'chain-start', 'chain-end')`.
5. Read the measured duration back via `page.evaluate`, matching `schema-validate-submit`'s existing `performance.measure` retrieval code exactly (no new helper needed — reuse the pattern, not the file).

### "Settled" detection

Each field's validator increments a per-field counter in a `window`-scoped object when it *runs* (not when its pass/fail result changes — a run-counter, not a result-change-counter; since `f0`'s new value need not ever equal its downstream neighbor's, a field's validation outcome may never flip, but it still re-runs on every cascade, and that re-run is what "settled" means here. Detecting "outcome stabilized" would require a fundamentally different, much harder polling target and is explicitly not what this spec measures) — the same `window.__<name>Renders`-style convention already used by `re-renders.spec.ts` and `schema-validate-rerenders.spec.ts`, renamed here to make the semantic explicit: `window.__<lib>ChainValidations` (e.g. `window.__neutroChainValidations`, `window.__rhfChainValidations`). The spec polls (via `page.waitForFunction`) until `window.__<lib>ChainValidations.f199` has incremented from its pre-keystroke value, then immediately takes the `chain-end` mark inside that same `page.evaluate`/`waitForFunction` callback to avoid adding polling-interval noise between detecting the change and recording the mark.

**Measurement-bias caveat:** this technique eliminates the callback-to-mark gap, but not the underlying detection lag between the real DOM/state mutation and Playwright's `waitForFunction` polling loop next running (governed by `requestAnimationFrame` by default, or a configured `polling` interval). For a library whose real cascade is sub-millisecond (neutro's expected case), the measured `settleLatencyMs` is dominated by this polling-loop granularity rather than real work, while for a slower competitor (199 real hook re-renders, likely tens of milliseconds) the same polling floor is comparatively negligible. This means the reported gap between neutro and the competitors is a **floor on the true gap, not an exact figure** — call this out explicitly in the docs-page narrative/annotations for this surface (a Task in the implementation plan), the same way item 3's RHF-`0` and neutro/Svelte-`20` results got honest annotations rather than being presented as unqualified numbers.

**Reset convention:** each app's existing `window.__resetRenders` gets extended to zero the relevant chain-validations object(s) for whichever route is mounted — following the exact fix pattern just landed for the Vue schema-validate bug (Task read the *live* `window.__X` object, never a locally-cached copy in the parent component, since the child route component owns and creates it on mount).

### New fixture (shared shape, not a shared file)

There is no single shared fixture module across apps/libraries (each library's field/validator API differs too much to share code, mirroring `schemaValidateSchema.ts`'s per-app-but-identical-content precedent). Each app defines its own 200-field initial-values object and per-library validator wiring inline in its new route component(s), with the same `f0..f199` naming and the same "differs from previous field" validation rule enforced identically everywhere.

### Per-library wiring

| Library | Wiring | Realism note |
|---|---|---|
| neutro/form (React/Vue/Svelte) | `createForm({ initialValues, dependencies: { f0: ['f1'], f1: ['f2'], ..., f198: ['f199'] } })`; `f0`'s own `onChange` handler calls `form.set('f0', e.target.value, { validate: true })` — the explicit `{ validate: true }` option is what triggers `runValidation`, per `docs/guides/dependency-graph.md`'s own canonical dependency-graph example; `f1..f199` need no `onChange`-time trigger of their own, since they never change value — they are only revalidated as members of `f0`'s precomputed cascade scope | Native declarative-graph usage — no manual wiring needed, this is the baseline the comparison exists to contextualize. **`validationMode` is irrelevant here and must not appear in this config** — that setting only gates auto-validation for fields wired via `form.connect(path, element)` (`packages/core/src/features/dom-bridge.ts`); a plain `onChange={e => form.set(...)}` handler (the pattern already used elsewhere in these bench apps) never consults it — `setFieldValue` only runs validation when `{ validate: true }` is passed explicitly (`packages/core/src/engine.ts`), regardless of `validationMode` |
| react-hook-form | 200 `register()`ed fields; each field `i>0`'s own component `watch()`es `f{i-1}` and calls `trigger('f{i}')` inside a `useEffect` keyed on the watched value; `validate` rule on each field reads `getValues('f{i-1}')` | Realistic manual RHF pattern for cross-field cascades — the "watch + useEffect + trigger" idiom that a real RHF user would reach for absent a declarative dependency graph (not itself present in the existing `dependency-trigger` correctness suite, which only asserts the qualitative "no declarative graph" N/A for RHF/vee/TanStack via skipped stubs — this spec introduces the concrete manual-wiring implementation, it does not cite a pre-existing one) |
| vee-validate | 200 `useField()` instances; each field's own component `watch()`es the previous field's `value` ref and calls its own `validate()` when it changes; validation rule reads the previous field's ref value | Same idiom, Vue's reactivity primitives in place of React's |
| tanstack-form | 200 fields; each field's own component subscribes to the previous field's value via `useStore(form.store, state => state.values.f{i-1})` (`useStore` is a free-standing hook re-exported from `@tanstack/react-store`/`@tanstack/svelte-store`, taking the store and a selector — not a method on `form` itself) and calls `form.validateField('f{i}', 'change')` in an effect when that subscribed value changes | Not the most idiomatic TanStack usage (TanStack's own field-level `validators.onChangeListenTo` option may be closer — see Task-1 verification note below), but exercises a comparable manual-subscription-cascade shape |
| felte, formik | — N/A | Neither exposes a per-field watch/subscribe primitive that can drive a cascade of this shape (Felte has no field-level watch API; Formik's validation model has no live field-to-field subscription); marked N/A with a footnote, same treatment as Formik on `schema-validate-*` in item 3 |

**All four wiring rows must cascade the same physical direction** — a change to `f0` propagating forward to `f199` (`f0 → f1 → f2 → ... → f199`). The neutro `dependencies` config above is keyed by *trigger* field (confirmed against `compileDependencyScopes` in `packages/core/src/index.ts` and the existing `docs/guides/dependency-graph.md` example: the key is "when this field is validated," the array is "also validate these"), so `f0: ['f1']` means "validating `f0` also validates `f1`," which is the forward direction this spec requires — this is the reverse of the pre-existing core fixture `bench/fixtures/dependency-chain.ts`'s `f199: ['f198']`-style backward mapping (see Task-1 note below), and implementers must not copy that fixture's direction.

**Note on the pre-existing core fixture:** `bench/fixtures/dependency-chain.ts` (from the 2026-07-02 core-scale spec) maps `f{i+1}: [f{i}]` — keyed backward relative to the direction its own benchmark drives (`a.set('f0', ...)`). Given the key/array semantics above, that means the existing `dependency-graph/deep-chain` core benchmark's `set('f0', ...)` call currently exercises `preComputedScopes['f0'] = {f0}` only (no cascade), not the 199-field cascade its own hypothesis describes. This spec's new browser surface is unaffected (it defines its own, correctly-forward-mapped config per the table above), but Task 1 of the implementation plan must flag this pre-existing core-fixture bug to the user as a separate, out-of-band finding — fixing it is not in this spec's scope (scope is limited to the files listed in the header), but leaving a known-broken sibling benchmark undocumented would be dishonest.

**Task-1 verification note (TanStack API):** TanStack Form's exact validators/listeners API differs across versions; Task 1's implementer must check the installed version's real `.d.ts` (the same "verify against the installed package, don't guess" discipline used for vee-validate's `validateOnValueUpdate` in item 3) and use whichever mechanism (`useStore` subscription vs. a native `listeners`/`onChangeListenTo` option, if present in the installed version) is genuinely idiomatic, adjusting this table's TanStack row and wiring accordingly if it differs from the `useStore`-based approach described above.

### Field locator convention

Each field's input gets `data-testid="${lib}-field-${i}"` (e.g. `neutro-field-f0`, `rhf-field-f199`) — a new, explicit convention for this surface rather than reusing either pre-existing pattern verbatim (`re-renders.spec.ts`'s `${prefix}-field0`-style single-digit suffix doesn't extend cleanly to `f0..f199`, and `schema-validate-*`'s `${prefix}-${name}` pattern collides if `name` itself already contains a hyphen). The Playwright spec locates `f0` via `getByTestId('${lib}-field-f0')` to type into, and polls `window.__<lib>ChainValidations.f199` (not a DOM locator) for settle detection — so `f199` itself only needs a `data-testid` for optional manual/debug inspection, not for the automated wait.

### New routes

One route per library per app, following the existing `/schema-validate/{lib}` convention:
- React: `/dependency-chain/neutro`, `/dependency-chain/rhf`, `/dependency-chain/tanstack`
- Vue: `/dependency-chain/neutro`, `/dependency-chain/vee`
- Svelte: `/dependency-chain/neutro`, `/dependency-chain/tanstack`

(No Felte/Formik routes, matching the N/A treatment above — the Playwright spec's Formik/Felte test cases assert `status: 'na'` directly with no `page.goto`, matching the existing `schema-validate-rerenders.spec.ts` pattern for Formik.)

### Reporting pipeline

- New spec file: `bench/suites/browser/dependency-chain-settle.spec.ts`, with `test.describe('dependency-chain-settle', ...)` — this exact string is the surface key consumed by `reporters/json-playwright.ts`/`generate-page.ts` (per the mechanism confirmed in the item-3 spec: `browserSurfaces = Object.keys(baseline.browser ?? {})`, driven verbatim by each spec file's `describe` title). `SURFACE_TITLES`, `ANNOTATIONS`, and `BrowserResult` below must all key off this exact string, or the surface silently falls back to displaying the raw key instead of a friendly title.
- `bench/types/schema.ts`: `BrowserResult` gains `settleLatencyMs?: number`, placed after `submitLatencyMs` following the same optional-field convention.
- `bench/scripts/generate-page.ts`: `SURFACE_TITLES` gains `'dependency-chain-settle': 'Dependency Chain — Settle Latency (200-field validation cascade)'`; `browserTable()` gains a `settleLatencyMs` column following the exact pattern already used for `submitLatencyMs` (including the `status === 'na'` early-return branch that's already generic across all metrics — no browserTable() logic change needed beyond the new column, since the N/A-branch fix from item 3 already handles any metric-null row generically).
- `bench/annotations.ts`: `ANNOTATIONS['dependency-chain-settle']` gets `felte` and `formik` entries with the N/A reason from the table above, plus a `neutro/form (React)`/`(Vue)`/`(Svelte)` annotation (or a shared note) disclosing the polling-floor measurement caveat from §"Settled detection" above, so the published numbers aren't read as an unqualified exact gap.
- New section in `docs/benchmarks/index.md`, placed in `## Browser` after the existing `Schema Validation` sections and before `Re-renders per 20-keystroke sequence (100-field form)`, per the existing ordering (new-est browser surfaces are appended in the order their specs were written, and 100-field re-renders comes right before Async Validation Latency — this new section slots in the same growing tail).

## Expected outcome / hypothesis

neutro's dependency graph is precomputed once at `createForm` init (an O(n²) one-time cost for a chain shape, since `compileDependencyScopes` walks each field's full transitive closure independently — cheap in absolute terms at n=200, ~19,900 Set insertions, but not itself O(1); this spec's `settleLatencyMs` metric only measures *post-init* runtime behavior, not construction cost). At runtime, each `set()` call is an O(1) precomputed-scope lookup, so neutro should show flat, low settle latency regardless of the manual-wiring competitors' approach, while RHF/vee-validate/TanStack's 199 independently-mounted `watch`/`useEffect`/subscription hooks should show measurably higher latency — each hop pays real per-hop overhead (a watcher callback, a `trigger()`/`validateField()` call, a scheduler tick) that neutro's single graph traversal avoids. If a competitor's manual wiring turns out to be *competitive*, that's a legitimate, disclosable finding (same honesty standard applied to RHF's `0` re-renders in item 3) — not a result to suppress or explain away.

### Feasibility risk: 200-field cascades in real Chromium

Every existing browser surface (`mount-cost`, `re-renders`, `schema-validate-*`) uses 10-100 fields. This spec proposes 200 live DOM inputs per route, and — for RHF/vee-validate/TanStack — up to 199 independently-mounted `watch`/`useEffect`/subscription hooks per library, a meaningfully heavier workload than anything previously benchmarked (the 2026-07-02 core-scale spec explicitly kept its own multi-hundred-field work at the Node/Vitest level and listed "browser-rendered large forms" as Out of Scope for exactly this reason — "real browsers choke on 1,000 live inputs"; 200 is far short of 1,000, but still a step up from this project's existing browser-surface precedent). Mitigations, both mandatory for Task 1:
- Bump the relevant Playwright test's timeout above the suite default before assuming a slow first run is a bug rather than expected cascade latency.
- Run each new route manually (headed or via a throwaway script) once, before wiring the real spec assertions, to confirm the keystroke-to-`f199`-increment cascade actually completes in a reasonable time and doesn't hang — matching the "observe real numbers before calibrating limits" discipline already used in `schema-validate-rerenders.spec.ts`'s Task 6.

## Verification

New surface regenerates via the existing `bench:browser` → `bench:merge` → `bench:generate` pipeline, no new pipeline steps. Full monorepo sweep (`lint`, `tsc --noEmit`, `build`, `test`) must stay green, matching every prior release-gate item in this cycle.

## Out of Scope

- Value-propagation chains (`f_i = f_{i-1} + 1`) — explicitly rejected per the chain-semantics decision above; would measure a different, non-comparable workload.
- Felte/Formik chain wiring — no realistic API surface exists for either; N/A per the table above.
- Changing the existing neutro-only `dependency-graph/deep-chain` core benchmark — this spec adds a new, separate browser surface; the core surface is untouched.
