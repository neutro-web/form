# Benchmark: Validation-Scope Precision (dependency graph payoff, quantified)

**Date:** 2026-07-02
**Status:** Draft — pending user review
**Scope:** `bench/suites/core/`, `bench/annotations.ts`, `bench/types/schema.ts`

---

## Problem

`bench/suites/correctness/dependency-trigger.test.ts` (surface: `dependency-trigger`) already proves neutro/form's dependency graph triggers correctly — it's a pass/fail boolean. What it doesn't show is **how much work** gets done per trigger. The architecture claim (`compileDependencyScopes` resolves the full transitive closure at init time, giving O(1) runtime lookup — see CLAUDE.md's Core Engine Design section) is currently only a qualitative claim, never a number. A library without a precomputed graph might re-derive "what needs to revalidate" on every call (e.g. walking a config object, or re-running every registered validator) — that's the actual cost difference this spec measures.

This is a natural companion to the large-form scale spec (`2026-07-02-bench-scale-1000-fields-design.md`) — that one stresses total form size, this one isolates the **specific cost of triggering N dependent validations**, independent of how large the rest of the form is.

## Design

### New surface: `dependency-graph/scoped-validate-count`

Not a speed benchmark — a **count** benchmark. Instrument `runValidation` (or wrap it in the bench adapter) to count how many field validators actually execute when a single upstream field changes, in a fixture where only a few fields depend on the changed one out of a much larger total form.

```ts
// bench/fixtures/sparse-deps.ts
export const sparseDepsFixture: FormFixture = {
  initialValues: {
    trigger: 0,
    ...Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`unrelated${i}`, 0])),
    dependent1: 0, dependent2: 0, dependent3: 0,
  },
  dependencies: { dependent1: ['trigger'], dependent2: ['trigger'], dependent3: ['trigger'] },
  validator: /* counts invocations per field path */,
}
```

Measurement: `set('trigger', 1)`, then count how many of the 503 other fields had their validator invoked. neutro/form should show exactly 3 (the three declared dependents) — this is what `preComputedScopes` is for. A library with no scoping (or coarse whole-form revalidation) would show up to 503.

This is a **correctness-suite-shaped** surface (count-based, like `array-state-integrity`), not a `vitest bench` throughput surface — put it in `bench/suites/correctness/` alongside `dependency-trigger.test.ts`, reporting a `CorrectnessResult`-like structure but with a `count` field instead of `pass`/`fail`. Requires a small, additive extension to `bench/types/schema.ts`'s correctness result shape (or a new `CountResult` type) — this is the one schema change in this spec, kept minimal:

```ts
export interface ScopeCountResult {
  library: string
  status: 'ok' | 'na' | 'error'
  validatedCount?: number   // how many fields got (re-)validated
  totalFields?: number      // form size, for context
}
```

### Competitor equivalents

- **react-hook-form, formik**: no declarative dependency graph (`dependency-trigger` already documents this as N/A). For this count surface, "no scoping mechanism" typically means the library either validates only the touched field (in which case it would show `1`, misleadingly looking *better* than neutro's `3` — this needs the annotation from `dependency-trigger` copied over verbatim, explaining that a low count here reflects "no cross-field triggering support," not superior precision) or validates the whole form on submit-time strategies (out of scope for onChange-mode comparison).
- **vee-validate**: has declarative dependency support in some configurations — worth checking whether a fair comparable setup exists before committing to including it; if not, mark N/A with the same annotation pattern as `dependency-trigger`.
- **tanstack-form**: per-field validators only, no cross-field graph — same N/A treatment as `dependency-trigger`.

## Expected outcome / hypothesis

neutro/form shows a flat, small `validatedCount` (matching the number of *actual* declared dependents) regardless of total form size — this is the direct, quantified proof of the O(1) scoped-validation claim. Competitors either show N/A (no equivalent capability, same story as `dependency-trigger`) or a count that's either misleadingly low (single-field-only validation, not real cross-field triggering) or high (whole-form revalidation). This surface's real value isn't a race to win a number — it's making the *existing* `dependency-trigger` pass/fail claim concrete and auditable, which strengthens the credibility of a claim we already make rather than opening a new competitive front.

## Verification

New correctness-suite test, run via `bench:correctness`, reported alongside existing correctness surfaces. Needs a `Why` column entry (matching the pattern from the earlier benchmark-page-cleanup work) explaining the count for each row, since a raw number without the "what does 3 vs 503 mean" framing is not self-explanatory to a reader.

## Out of Scope

- Async/debounced dependency chains (the existing `async-latency`/`async-cancellation` surfaces already cover async timing; this spec is about validation-count precision, not timing).
- Public scorecard Win/Tied/Behind badge for this surface — a count-based "Why" table entry (like correctness surfaces) fits the existing page pattern better than trying to force a numeric verdict onto what's fundamentally a capability-explanation surface.
