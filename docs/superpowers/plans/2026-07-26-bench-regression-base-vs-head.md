# Bench Regression Base-vs-Head Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `bench-regression.yml`'s systematic false-positive (comparing CI-runner numbers against a local-machine-captured `results/baseline.json`) by measuring the PR's base ref in the same CI job, interleaved with the head measurements, and comparing the two live medians directly instead of against the static file.

**Architecture:** `compare-baseline.ts` gains a second, symmetric median calculation (base) alongside the existing one (head), and `computeRegressions` compares the two medians directly instead of reading `results/baseline.json`. `bench-regression.yml` interleaves 3 rounds of head/base sampling, scoping the base measurement to `git rm -rqf --ignore-unmatch -- packages/core && git checkout <base-sha> -- packages/core` (restored the same way, targeting `HEAD`, after each round) rather than a full ref switch — `bench/`'s own harness must never change mid-job, only the engine source being measured. The `git rm` before each checkout is required, not optional: a bare `git checkout <sha> -- packages/core` only overlays files present in that tree and never deletes files absent from it, which would leak added/removed files across rounds — confirmed by empirical reproduction during this plan's spec review.

**Tech Stack:** TypeScript (Vitest), GitHub Actions (YAML), git, `vitest bench`.

## Global Constraints

- Never push to `origin`, merge a PR, or create a tag without the user's explicit go-ahead for that specific action — prior authorization does not carry forward.
- `results/baseline.json` must not be touched, read, or referenced by `compare-baseline.ts` after this plan — it remains solely for `bench:generate`'s public benchmarks page, an entirely separate concern from this plan.
- The `git checkout` used to materialize the base ref's `packages/core` must be scoped to that one path (`git checkout <sha> -- packages/core`), never a full-tree ref switch (`git checkout <sha>`) — a full switch would also replace `bench/scripts/compare-baseline.ts` itself with the base ref's old version, hard-failing the compare step. This was a confirmed, fatal bug found during this plan's spec review — do not reintroduce it.
- Every scoped checkout (both directions) must be preceded by `git rm -rqf --ignore-unmatch -- packages/core` — a bare `git checkout <tree-ish> -- packages/core` alone leaks files (see Architecture above). This was confirmed by empirical reproduction, not theory — do not simplify it away.
- No `pnpm install` or build step belongs anywhere in the base-ref measurement path — `vitest bench` transpiles `packages/core/src` directly via `bench/vitest.config.ts`'s alias, confirmed by reading that file; a build step is unnecessary overhead, not a correctness requirement.
- Sampling order must interleave head and base (head-1, base-1, head-2, base-2, head-3, base-3), never block them (all head then all base) — a block order introduces a systematic runner-drift bias between the two sides, which this plan exists to eliminate, not reintroduce in a different shape.
- Whether `vitest bench` actually re-reads `packages/core/src` fresh on every invocation (vs. serving a stale Vite transform cache from a prior round in the same job) was an unproven assumption before Task 2.5's smoke test — that part is now confirmed genuinely safe (no stale caching, in either direction). The smoke test also found a real, separate bug in the process: plain `git rm -rq --ignore-unmatch` fails (exit 1) when the index has staged content differing from `HEAD`, which is exactly the state after a base-sha checkout — every restore-to-`HEAD` step would abort the job. Fixed with `-f` (`git rm -rqf --ignore-unmatch`). Do not remove the `-f` or treat it as redundant.

---

## File Structure

- Modify: `bench/scripts/compare-baseline.ts` — `computeRegressions`'s signature and body change to accept two median maps; `main()` reads `BENCH_HEAD_FILES`/`BENCH_BASE_FILES` instead of `BENCH_INPUT_FILES`/`results/baseline.json`; PR comment column header wording updated.
- Modify: `bench/scripts/compare-baseline.test.ts` — `computeRegressions` tests updated to the new two-median-map signature.
- Modify: `.github/workflows/bench-regression.yml` — interleaved head/base sampling steps replacing the current 3 head-only steps; compare step's env changes to `BENCH_HEAD_FILES`/`BENCH_BASE_FILES`.

---

### Task 1: Rewrite `computeRegressions` and `main()` to compare head vs base medians (TDD)

**Files:**
- Modify: `bench/scripts/compare-baseline.ts`
- Modify: `bench/scripts/compare-baseline.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `computeRegressions(headMedians: Record<string, number>, baseMedians: Record<string, number>, threshold: number): Regression[]` — Task 2 (the workflow) doesn't call this directly, but its correctness is what Task 2's `bench:compare` invocation depends on. `main()`'s new env var names `BENCH_HEAD_FILES` and `BENCH_BASE_FILES` are the exact names Task 2 must set in the workflow.

- [ ] **Step 1: Update the existing `computeRegressions` tests to the new two-median-map signature**

In `bench/scripts/compare-baseline.test.ts`, replace the entire `describe('computeRegressions', ...)` block (currently lines 61-85) with:

```typescript
describe('computeRegressions', () => {
  test('flags a surface whose head median is more than the threshold below base', () => {
    const regressions = computeRegressions(
      { 'set-get/small': 80 },
      { 'set-get/small': 100 },
      0.15,
    )
    expect(regressions).toHaveLength(1)
    expect(regressions[0]).toMatchObject({ surface: 'set-get/small', baselineHz: 100, currentHz: 80 })
  })

  test('does not flag a surface within the threshold', () => {
    const regressions = computeRegressions(
      { 'set-get/small': 92 },
      { 'set-get/small': 100 },
      0.15,
    )
    expect(regressions).toHaveLength(0)
  })

  test('skips a surface with no base entry', () => {
    const regressions = computeRegressions({ 'new-surface': 10 }, {}, 0.15)
    expect(regressions).toHaveLength(0)
  })

  test('skips a surface with no head entry, even if base has it', () => {
    const regressions = computeRegressions({}, { 'set-get/small': 100 }, 0.15)
    expect(regressions).toHaveLength(0)
  })
})
```

(The fourth test is new — it wasn't meaningful under the old signature since `currentMedians` was always iterated as the driving set, but it's worth asserting explicitly now that both sides are symmetric plain number maps: a surface only present in `baseMedians` produces no regression, since the loop drives off `headMedians`.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --dir bench exec vitest run scripts/compare-baseline.test.ts`
Expected: FAIL — `computeRegressions`'s current implementation calls `baselineSurface.find(r => r.library === 'neutro/form')` on what the test now passes as a plain number (`100`), which has no `.find` method; TypeScript compilation will also fail since the test now passes `Record<string, number>` where `computeRegressions` still declares `Record<string, LibraryBenchResult[]>`.

- [ ] **Step 3: Rewrite `computeRegressions` to the new signature**

In `bench/scripts/compare-baseline.ts`, replace:

```typescript
export function computeRegressions(
  currentMedians: Record<string, number>,
  baselineCore: Record<string, LibraryBenchResult[]>,
  threshold: number,
): Regression[] {
  const regressions: Regression[] = []
  for (const [surface, currentHz] of Object.entries(currentMedians)) {
    const baselineSurface = baselineCore[surface]
    if (!baselineSurface) continue
    const baseline = baselineSurface.find(r => r.library === 'neutro/form')
    if (!baseline?.opsPerSec) continue
    const pct = (baseline.opsPerSec - currentHz) / baseline.opsPerSec
    if (pct > threshold) {
      regressions.push({ surface, baselineHz: baseline.opsPerSec, currentHz, pct })
    }
  }
  return regressions
}
```

with:

```typescript
export function computeRegressions(
  headMedians: Record<string, number>,
  baseMedians: Record<string, number>,
  threshold: number,
): Regression[] {
  const regressions: Regression[] = []
  for (const [surface, currentHz] of Object.entries(headMedians)) {
    const baselineHz = baseMedians[surface]
    if (baselineHz == null) continue
    const pct = (baselineHz - currentHz) / baselineHz
    if (pct > threshold) {
      regressions.push({ surface, baselineHz, currentHz, pct })
    }
  }
  return regressions
}
```

The `Regression` interface itself (`surface`, `baselineHz`, `currentHz`, `pct`) is unchanged — only `computeRegressions`'s parameters and body change.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --dir bench exec vitest run scripts/compare-baseline.test.ts`
Expected: PASS, all tests in the file (the pre-existing `median` and `collectMedianOpsPerSec` describe blocks are untouched and should still pass unchanged).

- [ ] **Step 5: Rewrite `main()` to read two file lists and drop `results/baseline.json`**

In `bench/scripts/compare-baseline.ts`, first change the top-of-file import line (`BenchResults` becomes unused once `main()` no longer reads `results/baseline.json` — dropping it now avoids leaving a dead import that neither `tsc` nor `biome` will catch here, since `bench/**` isn't covered by this repo's biome config and `noUnusedLocals` isn't set):

Change:
```typescript
import type { BenchResults, LibraryBenchResult } from '../types/schema.js'
```
to:
```typescript
import type { LibraryBenchResult } from '../types/schema.js'
```

Then replace the entire current `main()` function:

```typescript
async function main() {
  const inputFiles = (process.env.BENCH_INPUT_FILES ?? process.env.BENCH_INPUT_FILE ?? 'results/core.json')
    .split(',').map(s => s.trim()).filter(Boolean)
  const samples = inputFiles.map(f => readJson(f) as Record<string, LibraryBenchResult[]>)
  const baselineRaw = readJson('results/baseline.json') as BenchResults

  const { medians, skipped } = collectMedianOpsPerSec(samples)
  const regressions = computeRegressions(medians, baselineRaw.core ?? {}, REGRESSION_THRESHOLD)

  if (skipped.length) console.log(`[compare] skipped (insufficient valid samples): ${skipped.join(', ')}`)
  if (!regressions.length) {
    console.log(`[compare] no regressions found (median of ${inputFiles.length} sample(s))`)
    process.exit(0)
  }

  console.log(`[compare] ${regressions.length} regression(s) found (median of ${inputFiles.length} sample(s)):`)
  for (const r of regressions) {
    console.log(`  ${r.surface}: ${r.baselineHz.toFixed(0)} → ${r.currentHz.toFixed(0)} ops/s (-${(r.pct * 100).toFixed(1)}%)`)
  }

  const token = process.env.GH_TOKEN
  const prNumber = process.env.PR_NUMBER
  const repo = process.env.GITHUB_REPOSITORY

  if (token && prNumber && repo) {
    const rows = regressions.map(r =>
      `| ${r.surface} | ${Math.round(r.baselineHz).toLocaleString()} | ${Math.round(r.currentHz).toLocaleString()} | **-${(r.pct * 100).toFixed(1)}%** |`
    ).join('\n')

    const body = [
      '## Benchmark Regression Detected',
      '',
      `> Threshold: ${(REGRESSION_THRESHOLD * 100).toFixed(0)}%. Median of ${inputFiles.length} samples per surface; entries with rme > 10% or fewer than ${MIN_VALID_SAMPLES} valid samples are skipped.`,
      '',
      '| Surface | Baseline (ops/s) | Current (ops/s, median) | Delta |',
      '|---|---|---|---|',
      rows,
      '',
      skipped.length ? `**Skipped (insufficient valid samples):** ${skipped.join(', ')}` : '',
    ].filter(Boolean).join('\n')

    await fetch(`https://api.github.com/repos/${repo}/issues/${prNumber}/comments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    }).catch(e => console.warn('[compare] PR comment failed:', e))
  }

  if (process.env.BENCH_HARD_FAIL === 'true') {
    console.error('[compare] exiting 1 (BENCH_HARD_FAIL=true)')
    process.exit(1)
  }
  process.exit(0)
}
```

with:

```typescript
async function main() {
  const headFiles = (process.env.BENCH_HEAD_FILES ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const baseFiles = (process.env.BENCH_BASE_FILES ?? '').split(',').map(s => s.trim()).filter(Boolean)

  const headSamples = headFiles.map(f => readJson(f) as Record<string, LibraryBenchResult[]>)
  const baseSamples = baseFiles.map(f => readJson(f) as Record<string, LibraryBenchResult[]>)

  const { medians: headMedians, skipped: headSkipped } = collectMedianOpsPerSec(headSamples)
  const { medians: baseMedians, skipped: baseSkipped } = collectMedianOpsPerSec(baseSamples)
  const regressions = computeRegressions(headMedians, baseMedians, REGRESSION_THRESHOLD)

  if (headSkipped.length) console.log(`[compare] skipped on head (insufficient valid samples): ${headSkipped.join(', ')}`)
  if (baseSkipped.length) console.log(`[compare] skipped on base (insufficient valid samples): ${baseSkipped.join(', ')}`)
  if (!regressions.length) {
    console.log(`[compare] no regressions found (median of ${headFiles.length} head vs ${baseFiles.length} base sample(s))`)
    process.exit(0)
  }

  console.log(`[compare] ${regressions.length} regression(s) found (median of ${headFiles.length} head vs ${baseFiles.length} base sample(s)):`)
  for (const r of regressions) {
    console.log(`  ${r.surface}: ${r.baselineHz.toFixed(0)} → ${r.currentHz.toFixed(0)} ops/s (-${(r.pct * 100).toFixed(1)}%)`)
  }

  const token = process.env.GH_TOKEN
  const prNumber = process.env.PR_NUMBER
  const repo = process.env.GITHUB_REPOSITORY

  if (token && prNumber && repo) {
    const rows = regressions.map(r =>
      `| ${r.surface} | ${Math.round(r.baselineHz).toLocaleString()} | ${Math.round(r.currentHz).toLocaleString()} | **-${(r.pct * 100).toFixed(1)}%** |`
    ).join('\n')

    const skippedNotes = [
      headSkipped.length ? `**Skipped on head (insufficient valid samples):** ${headSkipped.join(', ')}` : '',
      baseSkipped.length ? `**Skipped on base (insufficient valid samples):** ${baseSkipped.join(', ')}` : '',
    ].filter(Boolean)

    const body = [
      '## Benchmark Regression Detected',
      '',
      `> Threshold: ${(REGRESSION_THRESHOLD * 100).toFixed(0)}%. Median of ${headFiles.length} head samples vs ${baseFiles.length} base samples per surface, both measured on the same CI runner in this job; entries with rme > 10% or fewer than ${MIN_VALID_SAMPLES} valid samples are skipped.`,
      '',
      '| Surface | Base branch (ops/s, median) | Current (ops/s, median) | Delta |',
      '|---|---|---|---|',
      rows,
      '',
      ...skippedNotes,
    ].filter(Boolean).join('\n')

    await fetch(`https://api.github.com/repos/${repo}/issues/${prNumber}/comments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    }).catch(e => console.warn('[compare] PR comment failed:', e))
  }

  if (process.env.BENCH_HARD_FAIL === 'true') {
    console.error('[compare] exiting 1 (BENCH_HARD_FAIL=true)')
    process.exit(1)
  }
  process.exit(0)
}
```

Note what's deliberately unchanged: `readJson`'s definition (still exits 1 on a missing/malformed file), the `BENCH_HARD_FAIL` gate at the end, and the `REGRESSION_THRESHOLD`/`HIGH_VARIANCE_RME`/`MIN_VALID_SAMPLES` constants at the top of the file.

- [ ] **Step 6: Verify the full file still type-checks and the test file still passes**

Run: `pnpm --dir bench exec tsc --noEmit 2>&1 | grep -i "compare-baseline"`
Expected: no output (no new type errors introduced in `compare-baseline.ts` specifically — this repo's `bench/` has pre-existing, unrelated `tsc` errors elsewhere per project convention; only confirm none are newly introduced in this file).

Run: `pnpm --dir bench exec vitest run scripts/compare-baseline.test.ts`
Expected: PASS, all tests.

- [ ] **Step 7: Commit**

```bash
git add bench/scripts/compare-baseline.ts bench/scripts/compare-baseline.test.ts
git commit -m "fix(bench): compare-baseline.ts compares head vs base medians

Replaces the static results/baseline.json comparison (captured on a
local machine, causing a systematic false-positive against CI-runner
numbers) with a direct comparison between two live medians, both
computed the same way via collectMedianOpsPerSec."
```

---

### Task 2: Interleave head/base sampling in `bench-regression.yml`

**Files:**
- Modify: `.github/workflows/bench-regression.yml`

**Interfaces:**
- Consumes: `BENCH_HEAD_FILES`/`BENCH_BASE_FILES` env var names and `bench:compare`'s behavior from Task 1 — this task's compare step must set exactly those two env vars, comma-separated file lists, matching what Task 1's `main()` reads.
- Produces: the committed/staged workflow that Task 2.5 smoke-tests before Task 3 lands anything.

- [ ] **Step 1: Replace the current 3 head-sample steps and the compare step's env**

Current file (verify it matches before editing — re-check `.github/workflows/bench-regression.yml` at execution time in case it drifted since this plan was written):
```yaml
      - run: pnpm --dir bench install --frozen-lockfile --ignore-workspace

      - run: BENCH_OUTPUT_FILE=results/core-1.json pnpm --dir bench run bench:core:sample
      - run: BENCH_OUTPUT_FILE=results/core-2.json pnpm --dir bench run bench:core:sample
      - run: BENCH_OUTPUT_FILE=results/core-3.json pnpm --dir bench run bench:core:sample

      - run: pnpm --dir bench run bench:compare
        env:
          BENCH_INPUT_FILES: results/core-1.json,results/core-2.json,results/core-3.json
          BENCH_HARD_FAIL: ${{ vars.BENCH_HARD_FAIL }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          PR_NUMBER: ${{ github.event.number }}
```

Change to:
```yaml
      - run: pnpm --dir bench install --frozen-lockfile --ignore-workspace

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

      - run: pnpm --dir bench run bench:compare
        env:
          BENCH_HEAD_FILES: results/head-1.json,results/head-2.json,results/head-3.json
          BENCH_BASE_FILES: results/base-1.json,results/base-2.json,results/base-3.json
          BENCH_HARD_FAIL: ${{ vars.BENCH_HARD_FAIL }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          PR_NUMBER: ${{ github.event.number }}
```

No other lines in the file change (the `on:`, `permissions:`, `runs-on:`, and the `checkout`/`pnpm`/`setup-node` setup steps above this block are untouched). Note every checkout line combines `git rm -rqf --ignore-unmatch -- packages/core` with the `git checkout` via `&&` — the `git rm` is not optional cleanup, it's what prevents files added/removed under `packages/core` between base and head from leaking across rounds (a confirmed bug in an earlier draft — see Global Constraints).

- [ ] **Step 2: Verify YAML is valid**

Run: `ruby -ryaml -e "YAML.load_file('.github/workflows/bench-regression.yml')" && echo VALID`
Expected: `VALID` printed.

- [ ] **Step 3: Verify the diff matches exactly what's intended**

Run: `git diff .github/workflows/bench-regression.yml`
Expected: the 3 old `core-N.json` sample steps and the old single-env compare step are replaced by: 1 fetch step, then 3 rounds each contributing 4 steps (head-sample, `git rm && checkout` base, base-sample, `git rm && checkout` HEAD) — 13 steps total — followed by the two-env compare step, exactly as shown above. `on:`, `permissions:`, and the setup steps above are byte-identical to before.

- [ ] **Step 4: Stage (do not commit yet — committed together with Task 1 in Task 3's landing commit, or as its own commit — see Task 3)**

Run: `git add .github/workflows/bench-regression.yml`

---

### Task 2.5: Smoke-test the `packages/core` swap mechanism with a deliberate temporary marker

**Why this task exists:** the entire design depends on an unverified assumption — that `git rm && git checkout <sha> -- packages/core` followed by `vitest bench` actually causes the *next* sample to measure the swapped-in version, not a stale Vite transform cache from the previous round in the same job process tree. Reasoning suggests this is fine (fresh `node` process per invocation, `git checkout` changes both content and mtime), but this repo has no prior precedent of swapping source mid-job like this, and both adversarial reviews of this plan flagged it as real, unverified risk — not something to wave away. This task proves it empirically, once, before trusting the mechanism in real PRs.

**Files:**
- Temporarily modify (and then revert): `packages/core/src/index.ts` or another file under `packages/core/src` — pick one line that's trivially observable in a benchmark's output without changing behavior (e.g., a version/marker string logged or embedded somewhere `bench:core:sample`'s output would surface it) — the exact mechanism is left to judgment at execution time since it depends on what's easiest to observe without touching real logic; the requirement is that it must be visibly different between "current HEAD" and a synthetic older commit, and must not change `createForm`'s actual runtime behavior.

**Interfaces:**
- Consumes: Task 2's corrected workflow (this smoke test should run using the *actual* new `bench-regression.yml` from Task 2, not a hand-rolled substitute — the whole point is testing the real mechanism).
- Produces: a go/no-go signal for Task 3 — if this smoke test doesn't confirm a clean swap, Task 3 must not proceed to landing the PR as correct; escalate back to redesign instead.

- [ ] **Step 1: Create a synthetic "base" commit with a detectable marker difference**

On a scratch branch (not this plan's feature branch — use a disposable local branch or a throwaway commit that gets discarded after this task, never pushed), make one trivial, clearly-labeled change under `packages/core/src` that would be observable in a benchmark run without altering behavior — for example, a comment or an unused exported constant containing a distinguishing string. Commit it. Note this commit's SHA — call it `$MARKER_SHA`.

- [ ] **Step 2: Manually exercise the exact swap sequence locally**

From the actual feature branch (with Task 2's workflow changes already staged/committed), run the equivalent of one round's swap by hand:
```bash
grep -n "your-marker-string" packages/core/src/index.ts || echo "marker absent at HEAD (expected if HEAD is the real code)"
git rm -rqf --ignore-unmatch -- packages/core && git checkout $MARKER_SHA -- packages/core
grep -n "your-marker-string" packages/core/src/index.ts && echo "CONFIRMED: marker present after swap to $MARKER_SHA"
git rm -rqf --ignore-unmatch -- packages/core && git checkout HEAD -- packages/core
grep -n "your-marker-string" packages/core/src/index.ts || echo "CONFIRMED: marker absent after restore to HEAD"
```
Expected: both "CONFIRMED" lines print, proving the scoped checkout/restore cycle actually swaps file content correctly, and that the restore leaves no trace.

- [ ] **Step 3: Confirm `vitest bench` itself reflects the swap, not just the filesystem**

With `$MARKER_SHA`'s content checked out (mid-swap, as in Step 2), run `pnpm --dir bench run bench:core:sample` once with `BENCH_OUTPUT_FILE=results/marker-test.json` and inspect the actual benchmark output for any sign the marker-bearing source was what got transpiled and executed — e.g., temporarily make the marker change something that would cause a visible, harmless difference in a benchmark's console output (not just a silent comment), such as a one-time `console.error` guarded by an env var, or (simpler) confirm no stale-cache artifacts exist by checking `bench/node_modules/.vite` isn't serving a pre-optimized bundle for `@neutro/form-core` (it shouldn't be, since the alias points at source, but confirm by inspecting that directory's contents/timestamps before and after the swap).
Expected: no evidence of stale caching; the sample genuinely reflects whichever version of `packages/core/src` was on disk at invocation time. Restore to HEAD afterward (`git rm -rqf --ignore-unmatch -- packages/core && git checkout HEAD -- packages/core`) and confirm `git status` shows no diff in `packages/core` before proceeding.

- [ ] **Step 4: Clean up**

Delete the scratch branch/commit created in Step 1 (`git branch -D <scratch-branch>` if one was created), delete `results/marker-test.json` if created, and confirm `git status` on the feature branch shows only Task 1 and Task 2's intended changes — nothing left over from this smoke test.

---

### Task 3: Land both changes via PR and verify empirically

**Files:** none new — commits Task 1 and Task 2's staged/committed changes and lands them.

**Interfaces:**
- Consumes: Task 1's commit, Task 2's staged change, and Task 2.5's go/no-go confirmation that the checkout/restore swap mechanism actually works — do not proceed with this task if Task 2.5 found a problem.
- Produces: none — final task in the plan.

- [ ] **Step 1: Confirm both tasks' changes are present, and nothing from Task 2.5's smoke test is left behind**

Run: `git log --oneline -3`, `git diff --cached --stat`, and `git status --short`
Expected: Task 1's commit exists in the log (`fix(bench): compare-baseline.ts compares head vs base medians`), `git diff --cached --stat` shows `.github/workflows/bench-regression.yml` staged from Task 2, and `git status --short` shows nothing else — no leftover `results/marker-test.json`, no scratch branch artifacts, no diff in `packages/core` from Task 2.5's smoke test.

- [ ] **Step 2: Commit Task 2's change**

```bash
git commit -m "ci(bench): interleave head/base sampling in bench-regression.yml

Replaces the 3 head-only sample steps with 3 interleaved head/base
rounds, scoping the base measurement to a packages/core-only checkout
(never a full ref switch, which would replace bench/'s own harness
with the base ref's stale version) restored after each round.
Interleaving (not head-then-base blocks) avoids a systematic
runner-drift bias between the two sides."
```

- [ ] **Step 3: Run the full monorepo pipeline before pushing**

```bash
pnpm lint && pnpm exec tsc --noEmit && pnpm build && pnpm test
```
Expected: all four commands exit 0. (This plan's changes don't touch anything under `packages/`, so this is a sanity check that nothing was accidentally broken, not an expectation of new coverage here.)

- [ ] **Step 4: STOP — get explicit user go-ahead before pushing**

- [ ] **Step 5: Push a feature branch and open the PR**

```bash
TASK_BRANCH=$(git branch --show-current)
git push -u origin HEAD:"$TASK_BRANCH"
gh pr create --base main --head "$TASK_BRANCH" \
  --title "fix(bench): compare regression check against base branch, not local baseline" \
  --body "Implements docs/superpowers/specs/2026-07-26-bench-regression-base-vs-head-design.md. This PR's own bench-regression.yml run is the first real empirical test of the fix — see that check's result on this PR."
```

- [ ] **Step 6: Verify the PR's own `bench-regression.yml` run — this is the empirical test the spec calls for**

```bash
gh pr checks --watch
```
Expected: `bench-regression` completes. Since this PR only touches `bench/scripts/*` and `.github/workflows/*` (nothing under `packages/`), the head and base measurements are measuring the *same* `packages/core` source in practice — so the expected, correct outcome is **no regression comment appears**. If one does appear, treat that as a real finding to investigate (per the spec's testing section) before considering this task done — don't dismiss it as expected noise, since this specific PR is exactly the case where noise should be at its lowest.

Also inspect the actual job duration (`gh run view <run-id>` or the Actions UI) and note it — the spec deliberately left the cost estimate unverified ("confirm the real number empirically... rather than trusting either estimate").

- [ ] **Step 7: STOP — get explicit user go-ahead before merging**

- [ ] **Step 8: Merge**

Run: `gh pr merge --squash --delete-branch` (only after go-ahead).

## Testing

No application code changes — this is CI/tooling infrastructure. Task 1's TDD cycle covers `compare-baseline.ts`'s pure logic with real unit tests. Task 2/3's correctness can only be verified empirically, in real CI, per the design spec's own Testing section — this plan's Task 3 Step 6 is that verification, not a stand-in for it.
