# Benchmark regression check: compare against base branch, not a static local baseline

## Context

`bench-regression.yml` posts a "Benchmark Regression Detected" comment on nearly every PR, showing ~26-33% slowdowns across almost every core benchmark surface (array-ops, computed-fields, dependency-graph, schema-validate, set-get) simultaneously. A real code-caused regression would hit specific surfaces related to what changed, not nearly all of them uniformly — this pattern is the signature of an environment mismatch, not a real regression.

Verified before writing this design:
- `bench-regression.yml` runs 3 samples of `bench:core:sample` (`vitest bench suites/core`) on GitHub's shared `ubuntu-latest` runner, then compares against `results/baseline.json` via `bench/scripts/compare-baseline.ts`.
- `results/baseline.json` is captured via `bench:full` **on a local machine** (per CLAUDE.md's documented convention: "Local runs must copy `results/latest.json` over `results/baseline.json`") — a fundamentally different, typically faster and more consistent environment than a shared CI runner.
- `BENCH_HARD_FAIL` repo variable is unset (`gh api .../actions/variables/BENCH_HARD_FAIL` → 404), so `compare-baseline.ts`'s `process.env.BENCH_HARD_FAIL === 'true'` is false and it always exits 0 — this check is currently non-blocking, just persistent noisy commentary on every PR.
- `bench/suites/core` (what `bench:core:sample` runs) only imports `@neutro/form-core` — no other package needs building for this specific check to run correctly.
- The whole `bench-regression.yml` job currently takes ~1m30s-1m40s (install + 3 samples + compare), confirmed from recent PR check timings.
- `bench/scripts/compare-baseline.test.ts` already exists with unit coverage for `median`, `collectMedianOpsPerSec`, and `computeRegressions`.

## Goals

- Eliminate the systematic environment-mismatch false positive by comparing the PR's head against its base branch, both measured on the identical runner, back-to-back, in the same job.
- Keep the existing median-of-3, high-variance-skip, minimum-valid-samples methodology — apply it symmetrically to both sides now, not just the head.
- Preserve `results/baseline.json`'s role for the public benchmarks page (`bench:generate`) — this design does not touch that use case at all.

## Non-goals

- No change to `bench:generate`, `docs/benchmarks/index.md`, or how the public-facing baseline numbers are captured/published.
- No change to the regression threshold (25%) or the high-variance/min-sample constants — those are orthogonal to the environment-mismatch problem this design fixes.
- No change to `BENCH_HARD_FAIL` being unset — whether to turn on hard-fail is a separate decision for later, after this fix has run cleanly on real PRs for a while.

## Design

### 1. `bench-regression.yml` changes

Current step sequence (unchanged, but sample output files renamed for clarity now that there are two sides):
```yaml
- run: BENCH_OUTPUT_FILE=results/head-1.json pnpm --dir bench run bench:core:sample
- run: BENCH_OUTPUT_FILE=results/head-2.json pnpm --dir bench run bench:core:sample
- run: BENCH_OUTPUT_FILE=results/head-3.json pnpm --dir bench run bench:core:sample
```
(These run against whatever `actions/checkout@v4`'s default ref is for a `pull_request`-triggered job — the PR's merge ref. No change to the checkout/install/build steps that precede these — they already build `packages/core` before this point.)

New steps appended after the head samples:
```yaml
- name: Checkout base ref
  run: |
    git fetch origin ${{ github.event.pull_request.base.sha }}
    git checkout ${{ github.event.pull_request.base.sha }}

- name: Install and build core at base ref
  run: |
    pnpm install --frozen-lockfile
    pnpm --filter @neutro/form-core run build

- run: BENCH_OUTPUT_FILE=results/base-1.json pnpm --dir bench run bench:core:sample
- run: BENCH_OUTPUT_FILE=results/base-2.json pnpm --dir bench run bench:core:sample
- run: BENCH_OUTPUT_FILE=results/base-3.json pnpm --dir bench run bench:core:sample
```

Using `github.event.pull_request.base.sha` (the exact commit the PR is currently based on) rather than `github.base_ref` (the branch name) — this pins the comparison to a specific commit, immune to `main` advancing mid-run.

The compare step's env changes from a single `BENCH_INPUT_FILES` to two explicit sets:
```yaml
- run: pnpm --dir bench run bench:compare
  env:
    BENCH_HEAD_FILES: results/head-1.json,results/head-2.json,results/head-3.json
    BENCH_BASE_FILES: results/base-1.json,results/base-2.json,results/base-3.json
    BENCH_HARD_FAIL: ${{ vars.BENCH_HARD_FAIL }}
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    PR_NUMBER: ${{ github.event.number }}
```

### 2. `bench/scripts/compare-baseline.ts` changes

`computeRegressions`'s signature changes from `(currentMedians: Record<string, number>, baselineCore: Record<string, LibraryBenchResult[]>, threshold: number)` to `(headMedians: Record<string, number>, baseMedians: Record<string, number>, threshold: number)` — fully symmetric now, both sides produced by the same `collectMedianOpsPerSec` function. Internally, `computeRegressions` no longer does `baselineSurface.find(r => r.library === 'neutro/form')` — it looks up `baseMedians[surface]` directly, since that's already a plain number.

`main()` changes:
- Reads `BENCH_HEAD_FILES` and `BENCH_BASE_FILES` (replacing the old `BENCH_INPUT_FILES`/`BENCH_INPUT_FILE` env vars) — no fallback to a single-file default needed, since this script is only ever invoked by `bench-regression.yml`, which will always set both.
- No longer reads `results/baseline.json` at all — that file is not touched or referenced by this script anymore.
- Calls `collectMedianOpsPerSec` twice — once for head samples, once for base samples — instead of once for current and a raw read of the static baseline file.
- The PR comment table's "Baseline (ops/s)" column header becomes "Base branch (ops/s, median)", making it explicit this is a live same-run measurement of the PR's actual base commit, not the published `baseline.json` numbers — the wording that caused the original confusion.

The `Regression` interface's `baselineHz` field is kept as-is (renaming it is pure churn with no behavior change — not worth the diff noise), but the comment table's column header text changes per above.

### 3. Testing

`compare-baseline.test.ts`'s existing `computeRegressions` tests currently pass a `Record<string, LibraryBenchResult[]>` as the second argument — these need updating to pass a plain `Record<string, number>` (the new signature), same assertions otherwise. No new test *behavior* is needed beyond that signature update, since the underlying median/skip logic (`collectMedianOpsPerSec`) is unchanged and already covered — it's just being called twice now instead of once.

Empirical verification (can't be unit-tested, needs real CI):
- Open a normal, no-op-ish PR (e.g. this very design's implementation PR) and confirm the "regression" comment does *not* appear — this is the actual bug fix, proven by its absence.
- If practical, open a throwaway PR with a deliberate, real slowdown (e.g., an artificial `Atomics.wait`-style delay in a hot path) to confirm the check still fires correctly when there's a genuine regression — don't want to have fixed a false positive by breaking true-positive detection.

## Testing

Unit: update `compare-baseline.test.ts`'s `computeRegressions` tests to the new two-median-map signature; run `pnpm --dir bench exec vitest run scripts/compare-baseline.test.ts`.
Integration: this PR's own CI run of `bench-regression.yml` is the first real test — confirm no regression comment appears (or if one does, that it reflects an actual difference between head and base, not environment noise) and confirm the job duration lands around ~3 minutes as expected (2x compute + one checkout/install/build cycle).
