# Benchmark regression check: compare against base branch, not a static local baseline

## Context

`bench-regression.yml` posts a "Benchmark Regression Detected" comment on nearly every PR, showing ~26-33% slowdowns across almost every core benchmark surface (array-ops, computed-fields, dependency-graph, schema-validate, set-get) simultaneously. A real code-caused regression would hit specific surfaces related to what changed, not nearly all of them uniformly — this pattern is the signature of an environment mismatch, not a real regression.

Verified before writing this design:
- `bench-regression.yml` runs 3 samples of `bench:core:sample` (`vitest bench suites/core`) on GitHub's shared `ubuntu-latest` runner, then compares against `results/baseline.json` via `bench/scripts/compare-baseline.ts`.
- `results/baseline.json` is captured via `bench:full` **on a local machine** (per CLAUDE.md's documented convention: "Local runs must copy `results/latest.json` over `results/baseline.json`") — a fundamentally different, typically faster and more consistent environment than a shared CI runner.
- `BENCH_HARD_FAIL` repo variable is unset (`gh api .../actions/variables/BENCH_HARD_FAIL` → 404), so `compare-baseline.ts`'s `process.env.BENCH_HARD_FAIL === 'true'` is false and it always exits 0 — this check is currently non-blocking, just persistent noisy commentary on every PR.
- **Corrected during adversarial review — no build step exists or is needed anywhere in this path.** `bench/vitest.config.ts` aliases `@neutro/form-core` directly to `../packages/core/src/index.ts` (source, not `dist/`) — `vitest bench` transpiles it fresh on every invocation via Vite/esbuild. The *original* `bench-regression.yml` confirms this: it only runs `pnpm --dir bench install --frozen-lockfile --ignore-workspace`, never a core build, and the check works today. An earlier draft of this spec wrongly asserted "they already build packages/core before this point" — that claim was carried over incorrectly from an unrelated investigation (the bundle-size esbuild fixture, which *does* need `dist/` because it resolves through package `exports`, a completely different code path from vitest's direct source alias). No build step belongs anywhere in this design.
- The whole `bench-regression.yml` job currently takes ~1m30s-1m40s (install + 3 samples + compare), confirmed from recent PR check timings.
- `bench/scripts/compare-baseline.test.ts` already exists with unit coverage for `median`, `collectMedianOpsPerSec`, and `computeRegressions`; its existing `computeRegressions` tests all key entries to `library: 'neutro/form'` with no multi-library assertions, so collapsing the second argument to a flat `Record<string, number>` is a lossless, faithful translation — verified by reading the actual test bodies, not assumed.
- `bench-regression.yml`'s trigger (`pull_request: branches: [main, release]`) means a PR could target either branch. `github.event.pull_request.base.sha` resolves generically from GitHub's PR metadata regardless of which branch that is — no release-specific wrinkle.

## Goals

- Eliminate the systematic environment-mismatch false positive by comparing the PR's head against its base branch, both measured on the identical runner, back-to-back, in the same job.
- Keep the existing median-of-3, high-variance-skip, minimum-valid-samples methodology — apply it symmetrically to both sides now, not just the head.
- Preserve `results/baseline.json`'s role for the public benchmarks page (`bench:generate`) — this design does not touch that use case at all.

## Non-goals

- No change to `bench:generate`, `docs/benchmarks/index.md`, or how the public-facing baseline numbers are captured/published.
- No change to the regression threshold (25%) or the high-variance/min-sample constants — those are orthogonal to the environment-mismatch problem this design fixes.
- No change to `BENCH_HARD_FAIL` being unset — whether to turn on hard-fail is a separate decision for later, after this fix has run cleanly on real PRs for a while.
- No change to the PR-comment-per-push behavior — `main()`'s unconditional `POST` to the issues/comments API already posts a fresh comment on every `synchronize` push over a long-lived PR's life, pre-existing and untouched by this design. Worth a future cleanup (update-in-place instead of appending), but orthogonal to the false-positive problem this design fixes.

## Design

### 1. `bench-regression.yml` changes

**Critical design point, found by adversarial review: the checkout must be scoped to `packages/core` only, never a full ref switch.** An earlier draft of this spec did `git checkout <base_sha>` (switching the *entire* working tree). That's self-defeating: it would also switch `bench/` itself — including `bench/scripts/compare-baseline.ts`, the very script this design rewrites — to base's *old* version. The compare step that runs afterward would then execute base's stale comparator (reading the now-removed `BENCH_INPUT_FILES`/`results/baseline.json`), which doesn't exist in the new workflow's env, causing `readJson` to fail and the job to hard-fail — on every PR, including the one that implements this very fix. The correct scope: only `packages/core` (the subject being measured) should ever change between the two measurement phases. `bench/`'s own harness, config, and comparator must stay fixed at HEAD throughout the whole job — bench is the *instrument*, not the *subject under test*, and the instrument must not change mid-measurement.

**Second design point, also found by adversarial review: interleave the sampling order, don't block it head-then-base.** Running all 3 head samples first and all 3 base samples second means base's measurements always happen later in the job's lifetime, under whatever cumulative scheduler/thermal/noisy-neighbor state a shared `ubuntu-latest` runner has built up by then — a systematic, directional bias (not random noise the median-of-3 logic can filter), reintroducing a smaller version of the exact problem this design exists to fix. Alternating head/base per round cancels out any monotonic drift across the job's duration instead of concentrating it on one side.

**Third design point, found by this spec's own adversarial re-review: `git checkout <sha> -- packages/core` alone is not a clean swap — it leaks files.** `git checkout <tree-ish> -- <pathspec>` only *overlays* blobs that exist in that tree at that path; it never removes a file that's present in the current working tree/index but absent from the target tree. Empirically reproduced during review: checking out a tree that lacks a file the current tree has leaves that file untouched, not deleted. Concretely, if the PR being measured adds, removes, or renames any file under `packages/core` (a real, not hypothetical, shape of change — this repo's own `features/*.ts` modular split is exactly this kind of change), the "base" round would run with a head-only file still physically present, and — worse — a file the PR *deleted* could persist through the restore step too, since restoring is the same one-directional operation in the other direction. The fix: remove the tracked path from the index and working tree first, then checkout — so the result always matches the target tree exactly, regardless of what was added or removed:
```bash
git rm -rqf --ignore-unmatch -- packages/core
git checkout <sha> -- packages/core
```
(`git rm -r` only affects tracked files, so gitignored build output like `packages/core/dist` — untracked, never built anyway per this design — is never touched by it.)

**Fourth design point, found empirically by the implementation plan's own mandatory smoke test (see that plan's Task 2.5): plain `git rm -rq --ignore-unmatch` is not enough — it needs `-f`.** After `git checkout <sha> -- packages/core` stages content that differs from `HEAD`, a subsequent bare `git rm` on that same path refuses to run (`error: the following file has changes staged in the index`) — `--ignore-unmatch` only suppresses the "pathspec matched nothing" case, a different condition entirely; it does not override this refusal. Reproduced deterministically: the restore-to-`HEAD` step would fail with exit 1 on the very first round in real CI, right after `base-1.json` is produced, aborting the job before `head-2` ever runs. The fix is `git rm -rqf --ignore-unmatch -- packages/core` (all occurrences, both directions) — shown correctly throughout this spec's step sequence above.

Step sequence, replacing the current 3 head-only sample steps:
```yaml
- name: Fetch base ref
  run: git fetch --depth 1 origin ${{ github.event.pull_request.base.sha }}

- run: BENCH_OUTPUT_FILE=results/head-1.json pnpm --dir bench run bench:core:sample
- run: git rm -rqf --ignore-unmatch -- packages/core && git checkout ${{ github.event.pull_request.base.sha }} -- packages/core
- run: BENCH_OUTPUT_FILE=results/base-1.json pnpm --dir bench run bench:core:sample
- run: git rm -rqf --ignore-unmatch -- packages/core && git checkout HEAD -- packages/core

- run: BENCH_OUTPUT_FILE=results/head-2.json pnpm --dir bench run bench:core:sample
- run: git rm -rqf --ignore-unmatch -- packages/core && git checkout ${{ github.event.pull_request.base.sha }} -- packages/core
- run: BENCH_OUTPUT_FILE=results/base-2.json pnpm --dir bench run bench:core:sample
- run: git rm -rqf --ignore-unmatch -- packages/core && git checkout HEAD -- packages/core

- run: BENCH_OUTPUT_FILE=results/head-3.json pnpm --dir bench run bench:core:sample
- run: git rm -rqf --ignore-unmatch -- packages/core && git checkout ${{ github.event.pull_request.base.sha }} -- packages/core
- run: BENCH_OUTPUT_FILE=results/base-3.json pnpm --dir bench run bench:core:sample
- run: git rm -rqf --ignore-unmatch -- packages/core && git checkout HEAD -- packages/core
```

No `pnpm install`, no build, anywhere in this sequence — per the corrected Context section, `vitest bench` transpiles `packages/core/src` directly on every invocation, so a scoped, leak-free checkout alone is sufficient to swap which version of the engine gets measured; the `HEAD`-targeted restore afterward is correct because `HEAD` never moves — it stays pointed at the job's initial checkout, a `pull_request` event's merge-ref commit — only the working-tree contents of one directory move back and forth.

`git fetch --depth 1 origin <sha>` (not a full/unbounded fetch) — empirically tested against this repo's real GitHub remote during review: fetching by the full 40-character SHA succeeds; a short/abbreviated SHA does not (`fatal: couldn't find remote ref`). `github.event.pull_request.base.sha` is always the full 40-character form, so this works as written. If the base commit were ever force-push-pruned server-side, the fetch fails loudly (non-zero exit) before any checkout happens — an acceptable failure mode consistent with this project's existing "fail loudly rather than silently produce wrong data" philosophy (e.g. `release-branch-drift.yml`'s explicit `exit 1`), not a scenario this design needs to work around.

Using `github.event.pull_request.base.sha` (the exact commit the PR is currently based on) rather than `github.base_ref` (the branch name) — this pins the comparison to a specific commit, immune to `main`/`release` advancing mid-run.

**Residual, explicitly-acknowledged verification gap:** whether `vitest bench`'s Vite-powered transform actually re-reads `packages/core/src` fresh on every invocation (rather than serving a stale cached transform left over from a prior round in the same job) is a reasonable but not yet empirically proven assumption — each `bench:core:sample` invocation is a fresh `node` process with no watch mode, and `git checkout` rewrites both file content and mtime, which should invalidate any transform cache correctly, but this repo has no prior precedent of swapping source mid-job like this. The implementation plan must include a real, deliberate smoke test of this exact mechanism (a temporary, clearly-labeled marker change to `packages/core/src` that differs between the two measured commits, confirmed to actually show up differently in the corresponding round's output, then reverted) — not just trust the theory.

**Cost, honestly re-estimated:** the earlier draft's "~3 minutes" claim assumed an install+build cycle that turns out to be unnecessary — that cost doesn't exist. The real added cost is purely 3 more `vitest bench suites/core` invocations (doubling the sampling portion from 3 to 6) plus 6 near-instant scoped-path checkouts. Expect the job to land somewhere close to double the *sampling* time specifically, not a flat 2x of the whole original job — plausibly less than the original "~3 minutes" estimate, not more. Confirm the real number empirically once this runs in CI rather than trusting either estimate.

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

**Fifth design point, found by a post-implementation 2-pass adversarial review of the shipped code:** `main()` must fail loudly, not silently, if `BENCH_HEAD_FILES`/`BENCH_BASE_FILES` are ever empty or unset (e.g. a future workflow edit typos the env var name). Without a guard, empty file lists produce empty medians and `main()` prints "no regressions found (median of 0 head vs 0 base sample(s))" and exits 0 — indistinguishable at a glance from a healthy run, and a real regression versus the *old* code's behavior (`readJson('results/baseline.json')` would hard-fail on a missing file in the equivalent misconfiguration). Fixed with an explicit check before proceeding. This same review also found the checkout/restore scope was wider than necessary — `packages/core` (whole directory) rather than `packages/core/src` (the only thing `bench:core:sample` actually measures, confirmed via `bench/vitest.config.ts`'s alias) — meaning a future PR that bumps `packages/core/package.json`'s version (e.g. a release-please PR) would swap that file between rounds too, for no benefit. Narrowed to `packages/core/src` throughout.

**Sixth, self-found during verification of the fifth point:** adding the empty-file-list guard surfaced a pre-existing wart — `main()` is invoked unconditionally at module scope (`main()` as the file's last line), which runs on every `import` of this module, including by `compare-baseline.test.ts`. Previously this produced a quiet `process.exit(0)` "unhandled rejection" in test output (already noted as pre-existing, non-blocking, by Task 1's review). The new guard escalated that same latent issue to a noisier `process.exit(1)`. Fixed properly rather than left noisier than before: `main()` is now only invoked when the file is the actual entry point (`process.argv[1] === fileURLToPath(import.meta.url)`), not merely imported.

## Testing

Unit: `compare-baseline.test.ts`'s existing `computeRegressions` tests currently pass a `Record<string, LibraryBenchResult[]>` as the second argument — update them to pass a plain `Record<string, number>` (the new signature), same assertions otherwise. No new test *behavior* is needed beyond that signature update, since the underlying median/skip logic (`collectMedianOpsPerSec`) is unchanged and already covered — it's just being called twice now instead of once. Run `pnpm --dir bench exec vitest run scripts/compare-baseline.test.ts`.

Integration (can't be unit-tested, needs real CI):
- This PR's own CI run of `bench-regression.yml` is the first real test — confirm no regression comment appears (or if one does, that it reflects an actual difference between head and base, not environment noise).
- Confirm the scoped `packages/core` checkout/restore actually swaps and restores correctly (spot-check a file's content mid-job, or via the run log).
- Record the real job duration rather than trusting either cost estimate above.
- If practical, open a throwaway PR with a deliberate, real slowdown (e.g., an artificial delay in a hot path) to confirm the check still fires correctly when there's a genuine regression — don't want to have fixed a false positive by breaking true-positive detection.
