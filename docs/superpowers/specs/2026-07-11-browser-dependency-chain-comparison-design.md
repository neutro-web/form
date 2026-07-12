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

Each field's validator increments a per-field counter in a `window`-scoped object when it runs — the same `window.__<name>Renders`-style convention already used by `re-renders.spec.ts` and `schema-validate-rerenders.spec.ts`, renamed here to make the semantic explicit: `window.__<lib>ChainValidations` (e.g. `window.__neutroChainValidations`, `window.__rhfChainValidations`). The spec polls (via `page.waitForFunction`) until `window.__<lib>ChainValidations.f199` has incremented from its pre-keystroke value, then immediately takes the `chain-end` mark inside that same `page.evaluate`/`waitForFunction` callback to avoid adding polling-interval noise to the measured latency.

**Reset convention:** each app's existing `window.__resetRenders` gets extended to zero the relevant chain-validations object(s) for whichever route is mounted — following the exact fix pattern just landed for the Vue schema-validate bug (Task read the *live* `window.__X` object, never a locally-cached copy in the parent component, since the child route component owns and creates it on mount).

### New fixture (shared shape, not a shared file)

There is no single shared fixture module across apps/libraries (each library's field/validator API differs too much to share code, mirroring `schemaValidateSchema.ts`'s per-app-but-identical-content precedent). Each app defines its own 200-field initial-values object and per-library validator wiring inline in its new route component(s), with the same `f0..f199` naming and the same "differs from previous field" validation rule enforced identically everywhere.

### Per-library wiring

| Library | Wiring | Realism note |
|---|---|---|
| neutro/form (React/Vue/Svelte) | `createForm({ initialValues, dependencies: { f1: ['f0'], f2: ['f1'], ..., f199: ['f198'] } })`, validator per field checks against previous field's value via `form.getState().values` | Native declarative-graph usage — no manual wiring needed, this is the baseline the comparison exists to contextualize |
| react-hook-form | 200 `register()`ed fields; each field `i>0`'s own component `watch()`es `f{i-1}` and calls `trigger('f{i}')` inside a `useEffect` keyed on the watched value; `validate` rule on each field reads `getValues('f{i-1}')` | Realistic manual RHF pattern for cross-field cascades — the same "watch + useEffect + trigger" idiom cited in `dependency-trigger`'s existing correctness-surface annotation |
| vee-validate | 200 `useField()` instances; each field's own component `watch()`es the previous field's `value` ref and calls its own `validate()` when it changes; validation rule reads the previous field's ref value | Same idiom, Vue's reactivity primitives in place of React's |
| tanstack-form | 200 fields; each field's own component subscribes to the previous field's value via `form.useStore(state => state.values.f{i-1})` and calls `form.validateField('f{i}', 'change')` in a `useEffect`/effect-equivalent when that subscribed value changes | Not the most idiomatic TanStack usage (TanStack's own field-level `validators.onChangeListenTo` option is closer, see Open Question below), but exercises a comparable manual-subscription-cascade shape |
| felte, formik | — N/A | Neither exposes a per-field watch/subscribe primitive that can drive a cascade of this shape (Felte has no field-level watch API; Formik's validation model has no live field-to-field subscription); marked N/A with a footnote, same treatment as Formik on `schema-validate-*` in item 3 |

**Open question for spec review:** TanStack Form v1 actually has a first-class `validators: { onChange: ({ value, fieldApi }) => ... }` plus a `listeners`/`onChangeListenTo` mechanism in some versions that may be a *more* idiomatic way to wire this than manual `useStore` subscriptions. Task 1's implementer should check the installed TanStack version's real API (the same "verify against the installed package's actual `.d.ts`, don't guess" discipline used for vee-validate's `validateOnValueUpdate` in item 3) and use whichever is genuinely the idiomatic pattern, adjusting this table's TanStack row if the installed API differs from what's described above.

### New routes

One route per library per app, following the existing `/schema-validate/{lib}` convention:
- React: `/dependency-chain/neutro`, `/dependency-chain/rhf`, `/dependency-chain/tanstack`
- Vue: `/dependency-chain/neutro`, `/dependency-chain/vee`
- Svelte: `/dependency-chain/neutro`, `/dependency-chain/tanstack`

(No Felte/Formik routes, matching the N/A treatment above — the Playwright spec's Formik/Felte test cases assert `status: 'na'` directly with no `page.goto`, matching the existing `schema-validate-rerenders.spec.ts` pattern for Formik.)

### Reporting pipeline

- `bench/types/schema.ts`: `BrowserResult` gains `settleLatencyMs?: number`, placed after `submitLatencyMs` following the same optional-field convention.
- `bench/scripts/generate-page.ts`: `SURFACE_TITLES` gains `'dependency-chain-settle': 'Dependency Chain — Settle Latency (200-field validation cascade)'`; `browserTable()` gains a `settleLatencyMs` column following the exact pattern already used for `submitLatencyMs` (including the `status === 'na'` early-return branch that's already generic across all metrics — no browserTable() logic change needed beyond the new column, since the N/A-branch fix from item 3 already handles any metric-null row generically).
- `bench/annotations.ts`: `ANNOTATIONS['dependency-chain-settle']` gets `felte` and `formik` entries with the N/A reason from the table above.
- New section in `docs/benchmarks/index.md`, placed in `## Browser` after the existing `Schema Validation` sections and before `Re-renders per 20-keystroke sequence (100-field form)`, per the existing ordering (new-est browser surfaces are appended in the order their specs were written, and 100-field re-renders comes right before Async Validation Latency — this new section slots in the same growing tail).

## Expected outcome / hypothesis

neutro's O(1) precomputed-scope lookup should show flat, low settle latency regardless of the manual-wiring competitors' approach, while RHF/vee-validate/TanStack's 199 independently-mounted `watch`/`useEffect`/subscription hooks should show measurably higher latency — each hop pays real per-hop overhead (a watcher callback, a `trigger()`/`validateField()` call, a scheduler tick) that neutro's single graph traversal avoids. If a competitor's manual wiring turns out to be *competitive*, that's a legitimate, disclosable finding (same honesty standard applied to RHF's `0` re-renders in item 3) — not a result to suppress or explain away.

## Verification

New surface regenerates via the existing `bench:browser` → `bench:merge` → `bench:generate` pipeline, no new pipeline steps. Full monorepo sweep (`lint`, `tsc --noEmit`, `build`, `test`) must stay green, matching every prior release-gate item in this cycle.

## Out of Scope

- Value-propagation chains (`f_i = f_{i-1} + 1`) — explicitly rejected per the chain-semantics decision above; would measure a different, non-comparable workload.
- Felte/Formik chain wiring — no realistic API surface exists for either; N/A per the table above.
- Changing the existing neutro-only `dependency-graph/deep-chain` core benchmark — this spec adds a new, separate browser surface; the core surface is untouched.
