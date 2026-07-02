# Benchmark: Large-Form Scale (1,000+ fields)

**Date:** 2026-07-02
**Status:** Draft — pending user review
**Scope:** `bench/fixtures/`, `bench/suites/core/`, `bench/adapters/*.ts`, `bench/results/schema.ts` additions

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

Competitor adapters need a real equivalent — this is the hard part. React Hook Form and Formik have no declarative dependency graph (already documented in `bench/annotations.ts`'s `dependency-trigger` entries), so a "chain" for them means manually wiring 199 `watch()`/`useEffect` calls, which is a fair reflection of what a real consumer would have to do, not a strawman. TanStack Form requires per-field validators; a chain there means 199 field-level validators each reading the previous field's value. Only neutro/form and vee-validate (whose comparison already exists on the `dependency-trigger` boolean surface) can express this declaratively — the others get an honest "no equivalent API, benchmark reflects the escape-hatch cost."

### Schema addition

`bench/types/schema.ts`'s `LibraryBenchResult` is already generic (`opsPerSec`, `median`, `rme`) — no schema change needed, just new surface keys (`set-get/xlarge`, `subscriptions/xlarge`, `dependency-graph/deep-chain`) in `results/core.json`, same pattern as `nested-set` added in the notify-cascade-fix release.

## Expected outcome / hypothesis

- `set-get/xlarge`, `subscriptions/xlarge`: neutro/form should scale linearly with the same constant factor as `large` (100 fields) — flat Map operations don't care about total form size beyond the specific key touched. If this ISN'T linear, that's a real bug worth finding (e.g. an accidental O(n) scan somewhere in `set()`'s dirty/touched bookkeeping).
- `dependency-graph/deep-chain`: this is where the architecture story should show up. neutro's O(1) precomputed-scope lookup means `set(f0)` triggers exactly the validation work for the chain, no more — the cost should be O(chain length touched), not O(total form size) and not O(chain length²). Competitors using manual `watch()`/`useEffect` wiring for the same behavior likely pay React re-render + effect-scheduling overhead per hop, which could show real, meaningful daylight — this is the best candidate among all six specs for demonstrating an actual architectural advantage, not just parity.

## Verification

New surfaces regenerate via `bench:core` as usual; no `bench:compare`/scorecard changes needed unless this becomes a public comparison table (out of scope for this spec — start as an internal core surface, promote to the public scorecard only if the numbers turn out to be genuinely differentiating and fairly measurable across competitors).

## Out of Scope

- Public scorecard/docs page integration (evaluate after first results come in).
- Browser-rendered large forms (this spec is core-engine-only; a 1,000-field DOM-rendered form is a separate, much larger undertaking — real browsers choke on 1,000 live inputs regardless of form-library overhead, so it wouldn't isolate the variable we care about).
