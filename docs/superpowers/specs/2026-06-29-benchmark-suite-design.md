# Benchmark Suite Design

**Date:** 2026-06-29
**Status:** Approved
**Scope:** `bench/` directory — not part of any published package

---

## Purpose

Three simultaneous goals, each intentional:

1. **CI regression gate** — every PR gets a pass/warn on neutro/form's own perf baseline. Starts as a soft warn (Phase C); flips to hard fail (Phase A) once the baseline is stable across several releases.
2. **Public evidence page** — `docs/benchmarks/index.md`, generated from committed results JSON after every release. Shows neutro/form vs competitors across performance and correctness dimensions.
3. **Local optimization tool** — the full suite is runnable on-demand by any developer to find where neutro/form is slow or wrong.

Future: this suite's architecture is designed to extract cleanly into `@neutro/bench`, a universal benchmarking library for the neutro ecosystem. No premature abstraction toward that goal now.

---

## Repository Structure

```
bench/                            # root-level, NOT in pnpm-workspace.yaml
  package.json                    # competitors as devDeps only; never leaks into published packages
  vitest.config.ts
  playwright.config.ts
  tsconfig.json

  adapters/
    interface.ts                  # BenchAdapter contract + AdapterCapability type
    neutro.ts
    rhf.ts
    tanstack.ts
    formik.ts
    vee-validate.ts

  fixtures/
    small.ts                      # 10 flat fields
    large.ts                      # 100 fields
    nested.ts                     # 3 levels deep
    array.ts                      # 3 arrays × 20 items
    dependent.ts                  # cross-field dependency graph

  suites/
    core/                         # vitest bench — pure JS, no DOM
      set-get.bench.ts
      subscriptions.bench.ts
      dependency-scopes.bench.ts
      array-ops.bench.ts
      computed-fields.bench.ts
    correctness/                  # vitest test — pass/fail, no perf numbers
      async-race.test.ts
      array-state-integrity.test.ts
      dependency-trigger.test.ts
    browser/                      # Playwright — re-renders + async latency
      re-renders.spec.ts
      async-latency.spec.ts

  scripts/
    generate-page.ts              # results/*.json → docs/benchmarks/index.md
    compare-baseline.ts           # CI regression check; reads BENCH_HARD_FAIL env flag

  results/
    baseline.json                 # committed; updated manually via bench:update-baseline
    latest.json                   # gitignored; written at bench run time
```

`bench/` is self-contained. `pnpm install` inside it installs competitors independently. Nothing in it can leak into published packages because it is outside the pnpm workspace graph (`pnpm-workspace.yaml` does not list it).

---

## Adapter Interface

The shared contract that makes comparison honest. Shaped around the problem domain, not around neutro/form's API.

```ts
// adapters/interface.ts

export interface FormFixture {
  initialValues: Record<string, any>
  dependencies?: Record<string, string[]>   // mapped to closest equivalent per library
  validator?: (values: any) => Promise<Record<string, string>>
}

export interface BenchAdapter {
  readonly name: string
  readonly capabilities: AdapterCapability[]

  set(path: string, value: any): void
  get(path: string): any

  subscribeToPath(path: string, fn: () => void): () => void
  subscribeGlobal(fn: () => void): () => void

  validate(paths?: string[]): Promise<Record<string, string>>

  arrayRemove(path: string, index: number): void
  arrayMove(path: string, from: number, to: number): void

  getErrors(): Record<string, string>
  getTouched(): Record<string, boolean>
}

export type AdapterCapability =
  | 'path-subscriptions'      // fine-grained, not whole-form
  | 'scoped-validation'       // validate subset of fields
  | 'array-move'              // native move without reset
  | 'cross-field-deps'        // declarative dependency graph
  | 'async-cancellation'      // aborts stale async validation
```

**Missing features:** Each adapter declares its `capabilities`. When a competitor lacks a capability, it is not excluded — it competes using its best available approach, documented as a shim. A library missing `array-move` uses remove + insert; this is noted in the results. A library missing `async-cancellation` earns a `FAIL` on the async correctness test — no perf number is shown for that surface.

---

## Suites

### `suites/core/` — vitest bench, pure JS

No DOM. No framework. Ops/sec. Competitors included where the adapter can implement the surface.

Each benchmark runs at three scales: the named fixture, 10× field count, 100× field count. This surfaces O(n) regressions that do not appear at small scale.

| File | Measures | Fixtures |
|---|---|---|
| `set-get.bench.ts` | Field write + read throughput | small, large |
| `subscriptions.bench.ts` | Path-level subscriber fan-out cost per `set()` | small, large |
| `dependency-scopes.bench.ts` | Cross-field validation trigger latency: field A changes → field B validates | dependent |
| `array-ops.bench.ts` | Remove, move, swap throughput; state map consistency cost | array |
| `computed-fields.bench.ts` | Derived value propagation per `set()` | small |

### `suites/correctness/` — vitest test, pass/fail

No timing. Binary assertions. Every library either passes or fails. A failure on a correctness test suppresses the perf number for that surface in the public page.

| File | Asserts |
|---|---|
| `async-race.test.ts` | Stale async result does not appear after a newer validation completes |
| `array-state-integrity.test.ts` | `errors`, `touched`, `dirty` keys correctly renumbered after remove, move, swap |
| `dependency-trigger.test.ts` | Changing field A causes field B's validator to fire when declared as dependent |

### `suites/browser/` — Playwright, Chromium only

Two files. React adapter for re-renders. Both React and Vue for async latency.

| File | Measures |
|---|---|
| `re-renders.spec.ts` | React render count per keystroke: controlled input at 10-field and 50-field scale |
| `async-latency.spec.ts` | Wall-clock time from field change to validated error appearing in the DOM, under simulated concurrent async calls |

**Re-render counting method:** each field component wraps a `renderCount` ref that increments on every render. Test types 20 characters into a single field and counts total renders across all fields. A well-isolated library produces ~20 renders for the active field and 0 for all others.

**Why Playwright for these two surfaces and not jsdom:** jsdom's `setTimeout` is synthetic — async latency numbers from it are not real. React 18's concurrent scheduler yields to the real browser event loop; jsdom falls back to `setTimeout`-based yielding. Render counts and batching patterns can diverge for concurrent-mode scenarios. For correctness and pure-JS surfaces, jsdom is sufficient. For these two surfaces, Playwright in Chromium is the only credible measurement.

---

## CI Pipeline

Three jobs. None touch the existing PR test pipeline.

### Job 1: `bench-regression` — every PR

Runs `suites/core/` against neutro/form only. No competitors (their install cost and variance would make this flaky).

```bash
pnpm --prefix bench install
pnpm --prefix bench run bench:core --reporter=json > bench/results/latest.json
node bench/scripts/compare-baseline.ts
```

**Phase C (current):** `compare-baseline.ts` posts a PR comment table for any metric that regresses >5%. Job exits 0. Merge is never blocked.

**Phase A (later):** Job exits 1 if any metric regresses >10%. PR cannot merge.

The flip is one env flag: `BENCH_HARD_FAIL=true` in the CI workflow. No code restructuring needed.

### Job 2: `bench-full` — push to `release` branch only

Runs all three suites against all competitors. Produces the public page.

```bash
pnpm --prefix bench install
pnpm --prefix bench run bench:core:all
pnpm --prefix bench run bench:correctness
pnpm --prefix bench run bench:browser
node bench/scripts/generate-page.ts
```

`generate-page.ts` writes `docs/benchmarks/index.md`. The existing docs deploy workflow picks it up. `bench/results/baseline.json` is committed back to the repo.

### Job 3: `bench-weekly` — cron, Sunday 02:00 UTC

Same as `bench-full` but runs on `main`. Catches competitor regressions (a competitor ships a performance fix that changes the comparison) without waiting for a release. Posts a summary to a GitHub issue tagged `benchmark-drift`.

### Baseline update process

When neutro/form legitimately gets faster, `baseline.json` is updated manually:

```bash
pnpm --prefix bench run bench:update-baseline
```

This requires a human decision. There is no automatic ratchet that silently accepts regressions.

---

## Public Benchmark Page

`docs/benchmarks/index.md` — static markdown, rebuilt by `generate-page.ts` after every `bench-full` run.

### Page structure

```
# Benchmarks

> Measured on: Apple M-series, Node 22.x, Chromium 130
> Last updated: <date> | neutro/form v<version>

## Methodology
Two dimensions: performance (ops/sec or ms) and correctness (PASS/FAIL).
Three runners: vitest bench (pure JS), vitest test (correctness), Playwright (browser).
N/A = library has no equivalent surface. FAIL = correctness test failed; perf number withheld.

## Correctness
Table: surface × library → PASS / FAIL / N/A

## Core Performance  (Node.js / Tinybench)
One table per surface. Columns: library, ops/sec, vs neutro/form (ratio).
Rows sorted by ops/sec descending.
Shim footnote per table where applicable.

## Re-renders  (Chromium / Playwright)
Renders per keystroke per library — 10-field and 50-field form.
React table. Vue table separate.

## Async Validation Latency  (Chromium / Playwright)
Library, p50 latency, p99 latency, concurrent-race handled (PASS/FAIL).
```

### Honesty rules enforced by `generate-page.ts`

Three rules, non-negotiable, enforced before the file is written:

1. **No cherry-picking:** every surface in the results JSON must appear in the output. Generator throws if a surface is present in JSON but absent from the page template.
2. **FAIL before numbers:** if a library fails the correctness test for a surface, its perf number for that surface is replaced with `FAIL — see correctness table`. A fast-but-wrong result never appears as a clean number.
3. **Shim disclosure:** if an adapter used a shim for a missing feature, the table cell appends `*` and a footnote explains exactly what the shim does.

---

## Summary

| Layer | Runner | Trigger | Output |
|---|---|---|---|
| Core perf (neutro only) | vitest bench | Every PR | Regression comment / gate |
| Core perf (all libs) | vitest bench | Release branch | `baseline.json` |
| Correctness (all libs) | vitest test | Release branch | `baseline.json` |
| Re-renders + async latency | Playwright | Release branch | `baseline.json` |
| Weekly drift check | All three | Sunday cron | GitHub issue |
| Public page | generate-page.ts | Post bench-full | `docs/benchmarks/index.md` |
