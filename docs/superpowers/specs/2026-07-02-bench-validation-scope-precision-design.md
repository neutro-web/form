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

Not a speed benchmark — a **count** benchmark. **Axiom note: this must be measured entirely from `bench/`-side code, never by adding instrumentation to `packages/core/src/index.ts` itself** — the shipped package should never carry bench-only counting/tracing code.

**Correction from initial draft on the mechanism.** The initial draft assumed the validator gets invoked once per field, and proposed counting invocations. That's not how it works: per `createForm`'s `validator` config signature (`(values: T, scopePaths?: string[], signal?: AbortSignal) => ...`), the validator is called **once per validation trigger**, and receives the *already-resolved* dependency scope as `scopePaths` — the precomputed-graph expansion (`expandedScope`) is passed in as an argument, not inferred by counting calls. This is actually a simpler and more direct measurement than originally proposed: wrap the fixture's `validator` function (bench-side only) to record `scopePaths?.length` on each invocation — that length *is* the "how many fields got included in this validation scope" number directly, with no need to count separate per-field invocations at all. Zero changes to `runValidation` or any other core engine code required; `scopePaths` is already an externally-observable argument at the exact boundary a bench-side wrapper needs.

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

Measurement: `set('trigger', 1)`, then read the `scopePaths.length` the validator wrapper recorded (per the corrected mechanism above). **Verified against `compileDependencyScopes`'s actual traversal** (`resolveTransitiveClosure` adds the seed path itself to `visited` before resolving its dependents): `preComputedScopes['trigger']` includes `trigger` itself plus its three declared dependents, so the expected count is **4**, not 3 — `trigger` (the changed field) + `dependent1` + `dependent2` + `dependent3`, out of 504 total fields in the fixture. A library with no scoping (or coarse whole-form revalidation) would show up to 504.

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

New correctness-suite test, run via `bench:correctness`, reported alongside existing correctness surfaces. Needs a `Why` column entry (matching the pattern from the earlier benchmark-page-cleanup work) explaining the count for each row, since a raw number without the "what does 4 vs 504 mean" framing is not self-explanatory to a reader.

## Out of Scope

- Async/debounced dependency chains (the existing `async-latency`/`async-cancellation` surfaces already cover async timing; this spec is about validation-count precision, not timing).
- Public scorecard Win/Tied/Behind badge for this surface — a count-based "Why" table entry (like correctness surfaces) fits the existing page pattern better than trying to force a numeric verdict onto what's fundamentally a capability-explanation surface.
