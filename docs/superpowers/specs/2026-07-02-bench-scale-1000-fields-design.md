# Benchmark: Large-Form Scale (1,000+ fields)

**Date:** 2026-07-02
**Status:** Draft — pending user review
**Scope:** `bench/fixtures/`, `bench/suites/core/`. No `bench/adapters/*.ts` changes needed — the existing `neutroAdapter` (`bench/adapters/neutro.ts`) already passes `fixture.dependencies` through to `createForm` unmodified, so new fixtures alone are sufficient. (No schema type changes needed either — see "Schema addition" below; the file is `bench/types/schema.ts`, not `bench/results/schema.ts` as an earlier draft of this line said.)

---

## Problem

`set-get/small` (10 fields) and `set-get/large` (100 fields) are the largest core fixtures today. At both sizes every library — neutro/form included — is already fast enough that the numbers don't meaningfully differentiate architecture; they mostly measure constant-factor overhead (function call cost, Map lookups). None of the current fixtures stress the part of neutro's architecture that's actually supposed to matter at scale: the **precomputed dependency graph** (`compileDependencyScopes`, O(1) lookup) and flat `values`/`errors`/`touched`/`dirty` maps keyed by dot-path.

Real large forms (admin panels, multi-section surveys, generated forms from a schema) commonly have hundreds to low-thousands of fields. This is exactly where a library that re-derives validation scope per call, or walks a nested object tree per `set()`, should show quadratic-ish degradation that neutro's precomputed-scope design is designed to avoid — but nothing today measures it.

## Design

### New fixture: `bench/fixtures/xlarge.ts`

```ts
import type { FormFixture } from '../adapters/interface.js'

export const xlargeFixture: FormFixture = {
  initialValues: Object.fromEntries(
    Array.from({ length: 1000 }, (_, i) => [`field${i}`, ''])
  ),
}
```

Mirrors `small.ts`/`large.ts` exactly (flat string fields) — same shape, 10x `large.ts`'s size. This isolates the scale question from the "does this fixture measure something else" question; existing `set-get`/`subscriptions` suites already prove the pattern works for 10/100, so 1,000 is a pure scale extrapolation.

### New surfaces: `set-get/xlarge`, `subscriptions/xlarge`

Extend `bench/suites/core/set-get.bench.ts` and `subscriptions.bench.ts` with a third `describe` block each, following the existing pattern exactly (see current 10/100 blocks) — `set('field0', 'x')` / `get('field0')` for set-get, and 1,000 registered `subscribeToPath` listeners with a single `set('field0', 'x')` for subscriptions (this is also where the descendant-scan cost from the notify-cascade fix would show up if it were ever mistakenly triggered on a large flat form — it shouldn't be, since these are primitive-leaf fixtures, but 1,000 registered subscribers is a good stress case for that guard specifically).

### New surface: `dependency-graph/deep-chain`

This is the one that actually tests the architectural claim. A fixture with a **long dependency chain** — field N depends on field N-1, for N up to some depth (e.g. 200) — and a benchmark measuring the cost of `set()` on the first field in the chain, forcing a cascade of dependent re-validations.

```ts
// bench/fixtures/dependency-chain.ts
export const dependencyChainFixture: FormFixture = {
  initialValues: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`f${i}`, 0])),
  dependencies: Object.fromEntries(
    Array.from({ length: 199 }, (_, i) => [`f${i + 1}`, [`f${i}`]])
  ),
}
```

**Correction from initial draft: this must be a neutro-only core surface, not a competitor throughput race.** The initial draft proposed measuring competitor equivalents (199 manually-wired `watch()`/`useEffect` calls for RHF, per-field validators for TanStack) at what implied a core/Node-level throughput comparison. That conflicts with an established, deliberate project decision: commit `3da9090` ("strip Node.js competitor shims; core suites are now neutro-only") removed Node-level competitor adapters specifically because they couldn't faithfully exercise RHF/Formik/etc.'s real hook machinery outside a component render context, with the explicit policy "real competitor comparisons live in browser Playwright tests." Every existing `bench/suites/core/` surface (`set-get`, `subscriptions`, `dependency-scopes`, `computed-fields`, `array-ops`) is neutro-only for this reason, and `dependency-graph/deep-chain` should follow the same convention: measure neutro/form's own chain-depth scaling, don't try to race competitors at the core level.

If a competitor comparison for deep dependency chains is wanted later, it belongs in the browser suite (real `watch()`/`useEffect` wiring inside `bench/apps/react/src/App.tsx`, a real vee-validate composable chain in the Vue app, etc.) as its own follow-on spec — the existing `dependency-trigger` correctness surface already gives the qualitative capability comparison (declarative graph vs. no declarative graph); this spec's job is to quantify neutro's own scaling behavior, which stands on its own without a competitor number.

### Schema addition

`bench/types/schema.ts`'s `LibraryBenchResult` is already generic (`opsPerSec`, `median`, `rme`) — no schema change needed, just new surface keys (`set-get/xlarge`, `subscriptions/xlarge`, `dependency-graph/deep-chain`) in `results/core.json`, same pattern as `nested-set` added in the notify-cascade-fix release.

## Expected outcome / hypothesis

- `set-get/xlarge`, `subscriptions/xlarge`: neutro/form should scale linearly with the same constant factor as `large` (100 fields) — flat Map operations don't care about total form size beyond the specific key touched. If this ISN'T linear, that's a real bug worth finding (e.g. an accidental O(n) scan somewhere in `set()`'s dirty/touched bookkeeping).
- `dependency-graph/deep-chain`: this is where the architecture story should show up. neutro's O(1) precomputed-scope lookup means `set(f0)` triggers exactly the validation work for the chain, no more — the cost should be O(chain length touched), not O(total form size) and not O(chain length²), and this surface (neutro-only, per the correction above) directly quantifies that. The competitive angle — whether a competitor's manual `watch()`/`useEffect` wiring pays real, meaningful additional overhead per hop — is a real and worthwhile question, but belongs in the browser-suite follow-on described above, not this spec's neutro-only core surface.

## Verification

New surfaces regenerate via `bench:core` as usual; no `bench:compare`/scorecard changes needed unless this becomes a public comparison table (out of scope for this spec — start as an internal core surface, promote to the public scorecard only if the numbers turn out to be genuinely differentiating and fairly measurable across competitors).

## Out of Scope

- Public scorecard/docs page integration (evaluate after first results come in).
- Browser-rendered large forms (this spec is core-engine-only; a 1,000-field DOM-rendered form is a separate, much larger undertaking — real browsers choke on 1,000 live inputs regardless of form-library overhead, so it wouldn't isolate the variable we care about).
