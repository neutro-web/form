# Benchmark Suite Design

**Date:** 2026-06-29
**Status:** Approved
**Scope:** `bench/` directory — not part of any published package

---

## Purpose

Three simultaneous goals, each intentional:

1. **CI regression gate** — every PR gets a pass/warn on neutro/form's own perf baseline. Starts as soft warn (Phase C); flips to hard fail (Phase A) once the baseline is stable across several releases.
2. **Public evidence page** — `docs/benchmarks/index.md`, generated from committed results JSON after every release. Shows neutro/form vs competitors across performance and correctness dimensions.
3. **Local optimization tool** — the full suite is runnable on-demand by any developer to find where neutro/form is slow or wrong.

Future: this suite's architecture is designed to extract cleanly into `@neutro/bench`. No premature abstraction toward that goal now.

---

## Repository Structure

```
bench/                            # root-level, NOT in pnpm-workspace.yaml
  package.json                    # competitors as devDeps only; never leaks into published packages
  vitest.config.ts
  playwright.config.ts
  tsconfig.json

  types/
    schema.ts                     # BenchResults, LibraryBenchResult, CorrectnessResult, BrowserResult

  adapters/
    interface.ts                  # BenchAdapter contract, AdapterCapability type, hasCapability helper
    neutro.ts
    rhf.ts
    tanstack.ts
    formik.ts
    vee-validate.ts

  fixtures/
    small.ts                      # 10 flat fields
    large.ts                      # 100 fields
    array.ts                      # 3 arrays × 20 items
    dependent.ts                  # cross-field dependency graph

  reporters/
    json-bench.ts                 # custom vitest Reporter — onFinished(files) → JSON
    json-playwright.ts            # custom Playwright Reporter — onEnd(result) → JSON

  apps/
    react/                        # minimal Vite + React 18 app; no StrictMode; built in prod mode
      package.json
      vite.config.ts
      src/App.tsx
    vue/
      package.json
      vite.config.ts
      src/App.vue

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
    merge-results.ts              # merges core + correctness + browser JSON → results/latest.json
    generate-page.ts              # results/baseline.json → docs/benchmarks/index.md
    compare-baseline.ts           # CI regression check; reads BENCH_INPUT_FILE (default: results/core.json) and BENCH_HARD_FAIL
    post-drift-issue.ts           # opens/updates GitHub issue on competitor drift

  results/
    baseline.json                 # committed; CI-only update via bench:update-baseline
    .gitignore                    # ignores latest.json, core.json, correctness.json, browser.json
    latest.json                   # gitignored; written at bench run time
    core.json                     # gitignored; intermediate output from bench:core
    correctness.json              # gitignored; intermediate output from bench:correctness
    browser.json                  # gitignored; intermediate output from bench:browser
```

`bench/` is self-contained. `pnpm install` inside it installs competitors independently. Nothing in it can leak into published packages because it is outside the pnpm workspace graph.

The `nested.ts` fixture is intentionally absent — no suite references 3-level nested forms. Add it only when a suite requires it.

---

## Package Scripts

All scripts live in `bench/package.json`. CI uses `pnpm --dir bench run <script>` (`--prefix` is deprecated in pnpm v10). `cross-env` is a devDependency so inline env var assignment works on all platforms.

```json
{
  "devDependencies": {
    "cross-env": "^7.0.3",
    "npm-run-all2": "^6.0.0",
    "tsx": "^4.0.0"
  },
  "scripts": {
    "bench:core":           "cross-env BENCH_OUTPUT_FILE=results/core.json vitest bench suites/core --reporter=./reporters/json-bench.ts",
    "bench:core:all":       "cross-env BENCH_ALL=true BENCH_OUTPUT_FILE=results/core.json vitest bench suites/core --reporter=./reporters/json-bench.ts",
    "bench:correctness":    "vitest run suites/correctness --reporter=json --outputFile=results/correctness.json",
    "bench:browser":        "playwright test suites/browser",
    "bench:apps:build":     "run-p \"pnpm --dir apps/react install && pnpm --dir apps/react build\" \"pnpm --dir apps/vue install && pnpm --dir apps/vue build\"",
    "bench:merge":          "tsx scripts/merge-results.ts",
    "bench:generate":       "tsx scripts/generate-page.ts",
    "bench:compare":        "tsx scripts/compare-baseline.ts",
    "bench:post-drift":     "tsx scripts/post-drift-issue.ts",
    "bench:full":           "run-s bench:apps:build bench:core:all bench:correctness bench:browser bench:merge bench:generate",
    "bench:update-baseline": "node -e \"if (!process.env.CI) { console.error('[bench] bench:update-baseline must run on CI only'); process.exit(1); }\" && cp results/latest.json results/baseline.json"
  }
}
```

`bench:update-baseline` guards against local execution by checking `process.env.CI`. Developers cannot accidentally corrupt the committed baseline from their machines.

The `bench:full` script (for local on-demand use) runs the complete pipeline: all suites → merge → generate page. The CI workflow runs the same steps individually to get better per-step failure messages.

---

## Schema

All intermediate and final JSON files conform to this schema. It is the single source of truth — imported by `merge-results.ts`, `compare-baseline.ts`, and `generate-page.ts`.

```ts
// types/schema.ts

export interface BenchResults {
  meta: {
    generatedAt: string         // ISO 8601 timestamp
    neutroVersion: string       // from NEUTRO_VERSION env var (git tag, e.g. "v0.4.3", "v" prefix stripped)
    nodeVersion: string         // process.version
    platform: 'linux' | 'darwin' | string
    runner: 'github-actions' | 'local'
  }
  core:        Record<string, LibraryBenchResult[]>   // key = surface/scale (e.g. "set-get/small")
  correctness: Record<string, CorrectnessResult[]>    // key = surface name
  browser:     Record<string, BrowserResult[]>        // key = surface name
}

export interface LibraryBenchResult {
  library: string
  status: 'ok' | 'error' | 'na'
  opsPerSec?: number      // hz from tinybench TaskResult
  median?: number         // ms
  rme?: number            // relative margin of error %; comparison skipped if rme > 10
  highVariance?: boolean  // true when rme > 10; written to baseline but excluded from comparison
  samples?: number
  shim?: string           // present when adapter used a shim; disclosed on public page
  error?: string          // present when status = 'error'
}

export interface CorrectnessResult {
  library: string
  status: 'pass' | 'fail' | 'na' | 'error'
  detail?: string         // failure message or shim description
}

export interface BrowserResult {
  library: string
  status: 'ok' | 'error' | 'na'
  renderCount?: number    // total renders across all fields during 20-keystroke sequence
  p50Ms?: number          // async validation latency p50
  p99Ms?: number          // async validation latency p99
  concurrentRacePass?: boolean
  error?: string
}
```

**Bootstrap state:** the initially committed `baseline.json` contains `meta` with placeholder values and empty `core`, `correctness`, `browser` objects (`{}`). `compare-baseline.ts` handles absent surfaces gracefully — a surface missing from the baseline is logged and skipped, never treated as a regression.

**Surface key format for `core`:** `"<file-stem>/<fixture>"` (e.g. `"set-get/small"`, `"set-get/large"`, `"array-ops/100x"`). Each `describe()` block in a bench file uses this naming so keys are stable and unambiguous.

---

## Adapter Interface

The shared contract that makes comparison honest. Shaped around the problem domain, not neutro/form's API.

```ts
// adapters/interface.ts

export interface FormFixture {
  initialValues: Record<string, any>
  dependencies?: Record<string, string[]>  // mapped to closest equivalent per library
  validator?: (values: any) => Promise<Record<string, string>>
}

export type AdapterCapability =
  | 'path-subscriptions'    // fine-grained per-path subscription, not whole-form
  | 'scoped-validation'     // validate a subset of fields without triggering the rest
  | 'array-move'            // native move without remove+insert reset
  | 'cross-field-deps'      // declarative dependency graph resolved at init
  | 'async-cancellation'    // aborts stale async validation on re-trigger

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

export function hasCapability(adapter: BenchAdapter, cap: AdapterCapability): boolean {
  return adapter.capabilities.includes(cap)
}
```

**Missing features:** when a competitor lacks a capability it competes using its best available approach (a shim), documented inline in the adapter file. The adapter sets `shim: '<description>'` on affected results. A library missing `async-cancellation` earns `FAIL` on the async correctness test and its latency number is suppressed on the public page.

**Adapter graceful degradation:** every adapter is wrapped in a try/catch at initialization in each suite runner. If it throws, every result for that library is `{ status: 'error', error: message }`. The suite continues with all other adapters. One broken adapter never blocks a full run.

**`BENCH_ALL` convention:** when `process.env.BENCH_ALL` is not set, suite files instantiate only the neutro adapter. When `BENCH_ALL=true`, all adapters are instantiated. Each bench file follows this pattern at the top:

```ts
const adapters = process.env.BENCH_ALL
  ? [neutroAdapter, rhfAdapter, tanstackAdapter, formikAdapter, veeValidateAdapter]
  : [neutroAdapter]
```

---

## Custom Reporters

### `reporters/json-bench.ts` — vitest bench reporter

Vitest's built-in `--reporter=json` captures unit test results, not benchmark metrics. A custom `Reporter` using `onFinished(files)` walks the completed file tree to extract `BenchmarkResult` objects (which carry `hz`, `median`, `rme`, `sampleCount` from tinybench's `TaskResult`). The output path is read from `process.env.BENCH_OUTPUT_FILE`.

```ts
// reporters/json-bench.ts
import type { Reporter, File, Suite, Task } from 'vitest'
import type { Benchmark } from 'vitest/benchmark'
import { writeFileSync } from 'node:fs'
import type { LibraryBenchResult } from '../types/schema.js'

function isBenchmark(task: Task): task is Benchmark {
  return task.meta?.benchmark === true
}

export default class JsonBenchReporter implements Reporter {
  onFinished(files: File[] = []) {
    const output: Record<string, LibraryBenchResult[]> = {}

    const walk = (tasks: Task[], suiteName: string) => {
      for (const task of tasks) {
        if (isBenchmark(task)) {
          const bench = task.meta.result
          const result: LibraryBenchResult = bench
            ? {
                library: task.name,
                status: 'ok',
                opsPerSec: bench.hz,
                median: bench.median,
                rme: bench.rme,
                highVariance: bench.rme != null && bench.rme > 10,
                samples: bench.sampleCount,
              }
            : { library: task.name, status: 'error', error: 'no result recorded' }
          ;(output[suiteName] ??= []).push(result)
        } else if ('tasks' in task) {
          walk((task as Suite).tasks, task.name)
        }
      }
    }

    for (const file of files) walk(file.tasks, file.name)

    const outPath = process.env.BENCH_OUTPUT_FILE ?? 'results/core.json'
    writeFileSync(outPath, JSON.stringify(output, null, 2))
  }
}
```

### `reporters/json-playwright.ts` — Playwright browser reporter

Captures render counts and latency numbers from browser tests and writes `results/browser.json`. Tests attach structured data to each test via `testInfo.attach('result', { body: JSON.stringify(data) })`. The reporter collects these in `onEnd`.

```ts
// reporters/json-playwright.ts
import type { Reporter, FullResult, TestCase, TestResult } from '@playwright/test/reporter'
import { writeFileSync } from 'node:fs'
import type { BrowserResult } from '../types/schema.js'

export default class JsonPlaywrightReporter implements Reporter {
  private output: Record<string, BrowserResult[]> = {}

  onTestEnd(test: TestCase, result: TestResult) {
    const surface = test.parent.title   // describe() block name
    const attach = result.attachments.find(a => a.name === 'result')
    if (!attach?.body) return
    try {
      const data: BrowserResult = JSON.parse(attach.body.toString())
      ;(this.output[surface] ??= []).push(data)
    } catch {
      ;(this.output[surface] ??= []).push({ library: test.title, status: 'error', error: 'malformed attachment' })
    }
  }

  onEnd(_result: FullResult) {
    writeFileSync('results/browser.json', JSON.stringify(this.output, null, 2))
  }
}
```

---

## `scripts/merge-results.ts`

Reads `results/core.json`, `results/correctness.json`, and `results/browser.json`, validates each against the schema, merges them into a single `BenchResults` object with populated `meta`, and writes `results/latest.json`. Fails with a non-zero exit if any source file is missing, unreadable, or fails schema validation — so `bench:update-baseline` never copies a broken file.

```ts
// scripts/merge-results.ts
import { readFileSync, writeFileSync } from 'node:fs'
import type { BenchResults } from '../types/schema.js'

// Version is passed as NEUTRO_VERSION from the tag (e.g. "v0.4.3") so we read
// the correct released version even though bench-full.yml checks out main, which
// still has the pre-release version in packages/core/package.json.
// Falls back to "unknown" for the weekly cron job, which compares competitor drift
// and does not publish results — the version field is informational only there.
const neutroVersion = (process.env.NEUTRO_VERSION ?? '').replace(/^v/, '') || 'unknown'

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    console.error(`[merge-results] Failed to read ${path}:`, e)
    process.exit(1)
  }
}

const core        = readJson('results/core.json') as Record<string, any>
const correctness = readJson('results/correctness.json') as Record<string, any>
const browser     = readJson('results/browser.json') as Record<string, any>

// correctness.json uses vitest's built-in JSON format; extract pass/fail per suite
const correctnessNormalized = normalizeCorrectnessJson(correctness)

const merged: BenchResults = {
  meta: {
    generatedAt: new Date().toISOString(),
    neutroVersion,
    nodeVersion: process.version,
    platform: process.platform,
    runner: process.env.CI ? 'github-actions' : 'local',
  },
  core,
  correctness: correctnessNormalized,
  browser,
}

writeFileSync('results/latest.json', JSON.stringify(merged, null, 2))
console.log('[merge-results] wrote results/latest.json')
```

`normalizeCorrectnessJson` maps vitest's test result format (test names, pass/fail state) to `CorrectnessResult[]` per surface. Described in full in the implementation plan.

---

## Suites

### `suites/core/` — vitest bench, pure JS

No DOM. No framework. Ops/sec. Competitors included when `BENCH_ALL=true`.

Each bench file runs at three scales using vitest's `describe()` nesting: the named fixture, `10x` (10× field count), `100x`. Each scale is a separate `describe()` block so surface keys are stable (`"set-get/small"`, `"set-get/10x"`, `"set-get/100x"`).

When `rme > 10%`, `compare-baseline.ts` skips comparison for that entry (logs `SKIPPED (high variance)`) and never counts it as a regression.

| File | Measures | Fixtures |
|---|---|---|
| `set-get.bench.ts` | Field write + read throughput | small, large |
| `subscriptions.bench.ts` | Path-level subscriber fan-out cost per `set()` | small, large |
| `dependency-scopes.bench.ts` | Scope resolution latency: time from `set()` to identifying the correct validation scope (sync only — not the async validator fn) | dependent |
| `array-ops.bench.ts` | Remove, move, swap throughput including state-map rekey cost | array |
| `computed-fields.bench.ts` | Derived value propagation per `set()` | small |

`dependency-scopes.bench.ts` note: only the sync scope resolution step is benched (O(1) preComputedScopes lookup). Competitors without compile-time scope resolution compete via `watch()`+`trigger()` overhead. The adapter documents this shim and the public page labels the column "scope resolution vs watch+trigger overhead."

### `suites/correctness/` — vitest test, pass/fail

No timing. Binary assertions. A failure suppresses the perf number for that surface on the public page.

| File | Asserts |
|---|---|
| `async-race.test.ts` | Stale async result does not appear after a newer validation completes; uses fake timers to control the race precisely |
| `array-state-integrity.test.ts` | `errors`, `touched`, `dirty` keys correctly renumbered after remove, move, and swap |
| `dependency-trigger.test.ts` | Changing field A causes field B's validator to fire when declared as dependent |

### `suites/browser/` — Playwright, Chromium only

`bench/apps/react/` and `bench/apps/vue/` are minimal Vite applications built in production mode (`NODE_ENV=production`) before Playwright runs. StrictMode is explicitly disabled in both to prevent React 18's development-mode double-invocation from inflating render counts.

App builds run as **separate CI steps** before Playwright starts. `playwright.config.ts` only runs `preview` in `webServer` — it does not build. This produces clear build failure messages rather than cryptic Playwright timeouts.

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  retries: 2,
  reporter: [['./reporters/json-playwright.ts']],
  webServer: [
    {
      command: 'pnpm --dir apps/react preview',
      port: 4173,
      reuseExistingServer: !process.env.CI,  // reuse in local dev; always fresh on CI
    },
    {
      command: 'pnpm --dir apps/vue preview',
      port: 4174,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
```

| File | Measures |
|---|---|
| `re-renders.spec.ts` | React render count per keystroke: 10-field and 50-field controlled input. Each field component increments a module-level counter (not a ref, to avoid closure staleness) on each render. Test types 20 characters into one field and asserts total renders across all fields. A correctly isolated library shows ~20 renders for the active field and 0 for all others. Attaches result as JSON via `testInfo.attach`. |
| `async-latency.spec.ts` | Wall-clock time from field change to validated error appearing in the DOM, under simulated concurrent async calls. Measures p50 and p99 across 50 runs. Also asserts that no stale result appears. Attaches result as JSON via `testInfo.attach`. |

---

## CI Pipeline

Three new workflow files. None modify the existing `ci.yml`.

### Workflow 1: `bench-regression.yml` — every PR

**Permissions required:** `pull-requests: write`, `contents: read`.

Runs `suites/core/` against neutro/form only (no `BENCH_ALL`). No competitors on PRs — install cost and variance make them unsuitable for this loop.

```yaml
on:
  pull_request:
    branches: [main]

permissions:
  pull-requests: write
  contents: read

jobs:
  bench-regression:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
          cache-dependency-path: bench/pnpm-lock.yaml
      - run: pnpm --dir bench install --frozen-lockfile
      - run: pnpm --dir bench run bench:core
      - run: pnpm --dir bench run bench:compare
        env:
          BENCH_INPUT_FILE: results/core.json   # PR job only writes core.json; latest.json is never merged here
          BENCH_HARD_FAIL: ${{ vars.BENCH_HARD_FAIL }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Regression thresholds:**
- Results where `rme > 10%` are logged `SKIPPED (high variance)` and never compared.
- **Phase C (now):** regression > 15% posts a PR comment table. Job exits 0.
- **Phase A (later):** regression > 15% causes job to exit 1. PR cannot merge.

15% is the threshold because GitHub Actions shared VMs show ±10–15% variance between identical runs. Lower thresholds produce near-constant false alarms and destroy trust in the gate before Phase A is reached.

Flip C → A: set `BENCH_HARD_FAIL=true` in the repository's Actions variables. No code change.

### Workflow 2: `bench-full.yml` — tag push (`v*`)

**Permissions required:** `contents: write`.

**Concurrency:** `group: bench-full, cancel-in-progress: true` — if two tags are pushed in rapid succession the first run is cancelled. This prevents conflicting `git push origin main` calls.

**Branch protection requirement:** `main` must allow `github-actions[bot]` to push directly (bypass PR requirement). Configure this in Settings → Branches → `main` protection rule → "Allow specified actors to bypass required pull requests."

```yaml
on:
  push:
    tags: ['v*']

concurrency:
  group: bench-full
  cancel-in-progress: true

permissions:
  contents: write

jobs:
  bench-full:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: pnpm/action-setup@v3
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
          cache-dependency-path: bench/pnpm-lock.yaml

      - run: pnpm --dir bench install --frozen-lockfile

      # Install Playwright browser binaries
      - run: pnpm --dir bench exec playwright install --with-deps chromium

      # Build browser apps first — fail clearly here, not inside Playwright
      - run: pnpm --dir bench/apps/react install && pnpm --dir bench/apps/react build
      - run: pnpm --dir bench/apps/vue install && pnpm --dir bench/apps/vue build

      - run: pnpm --dir bench run bench:core:all
      - run: pnpm --dir bench run bench:correctness
      - run: pnpm --dir bench run bench:browser
      - run: pnpm --dir bench run bench:merge
        env:
          NEUTRO_VERSION: ${{ github.ref_name }}   # e.g. "v0.4.3"; merge-results.ts strips the "v" prefix
      - run: pnpm --dir bench run bench:update-baseline
        env: { CI: true }
      - run: pnpm --dir bench run bench:generate

      - name: Commit results to main
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add bench/results/baseline.json docs/benchmarks/index.md
          if ! git diff --cached --quiet; then
            git commit -m "chore: update benchmarks [skip ci]"
            git push origin main
          fi
```

The `if ! git diff --cached --quiet` guard prevents an empty commit if results are unchanged (e.g. a patch release with no perf impact). `[skip ci]` prevents `ci.yml` from re-running on the results commit. The `docs.yml` secondary trigger (below) handles the deploy.

### Workflow 3: `bench-weekly.yml` — cron, Sunday 02:00 UTC

**Permissions required:** `contents: read`, `issues: write`.

Catches competitor drift. Does not commit results. Compares the weekly run against the committed `baseline.json` (which always reflects the last release).

```yaml
on:
  schedule:
    - cron: '0 2 * * 0'

permissions:
  contents: read
  issues: write

jobs:
  bench-weekly:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
          cache-dependency-path: bench/pnpm-lock.yaml
      - run: pnpm --dir bench install --frozen-lockfile
      - run: pnpm --dir bench exec playwright install --with-deps chromium
      - run: pnpm --dir bench/apps/react install && pnpm --dir bench/apps/react build
      - run: pnpm --dir bench/apps/vue install && pnpm --dir bench/apps/vue build
      - run: pnpm --dir bench run bench:core:all
      - run: pnpm --dir bench run bench:correctness
      - run: pnpm --dir bench run bench:browser
      - run: pnpm --dir bench run bench:merge
      - run: pnpm --dir bench run bench:post-drift
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`post-drift-issue.ts` compares `results/latest.json` against `results/baseline.json`. If any competitor result changes by >20% in either direction, it opens or updates a GitHub issue tagged `benchmark-drift`. Neutro/form changes are ignored here — those are caught on PRs.

### Docs Deploy Update

Add a secondary trigger to `docs.yml` so the benchmark page deploys when `[skip ci]` prevents `ci.yml` from running:

```yaml
on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]
    branches: [main]
  push:
    branches: [main]
    paths:
      - 'docs/**'
      - 'bench/results/baseline.json'
```

### Dependency Caching

All three workflows cache `bench/node_modules` via `actions/setup-node`'s built-in pnpm support. Cache is keyed on `bench/pnpm-lock.yaml`. A cache hit reduces install time from ~60s to ~3s. Include in every workflow that calls `pnpm --dir bench install`:

```yaml
- uses: pnpm/action-setup@v3
  with: { version: 10 }
- uses: actions/setup-node@v4
  with:
    node-version: '22'
    cache: 'pnpm'
    cache-dependency-path: bench/pnpm-lock.yaml
```

This block is already included in each workflow above. The `cache: 'pnpm'` and `cache-dependency-path` settings are what activate the cache. The `pnpm --dir bench install --frozen-lockfile` step still runs on every job — it becomes a near-no-op on a cache hit.

### Baseline Update Process

`bench:update-baseline` checks `process.env.CI` and exits 1 if not set. It is called exclusively by `bench-full.yml`. This ensures the committed baseline always reflects `ubuntu-latest` hardware — the same environment `bench-regression.yml` runs on, making comparisons valid.

---

## Public Benchmark Page

`docs/benchmarks/index.md` — static markdown, rebuilt by `generate-page.ts` after every `bench-full` run.

### Page structure

```
# Benchmarks

> Measured on: GitHub Actions ubuntu-latest, Node 22.x, Chromium (Playwright)
> Last updated: <generatedAt> | neutro/form v<neutroVersion>

## Methodology
Two dimensions: performance (ops/sec or ms) and correctness (PASS/FAIL).
Three runners: vitest bench (pure JS, Node 22), vitest test (correctness), Playwright Chromium (production build, no StrictMode).
- N/A    = library has no equivalent surface
- FAIL   = correctness test failed; perf number withheld
- ERROR  = adapter threw at runtime; see adapter source
- *      = shim used; see footnote
- ± high = rme > 10%; result recorded but not used for comparison

## Correctness
Table: surface × library → PASS / FAIL / N/A / ERROR

## Core Performance  (Node.js 22 / Tinybench)
One table per surface/scale. Columns: library, ops/sec, vs neutro/form (ratio).
Rows sorted by ops/sec descending.
Shim footnote per table where applicable.

## Re-renders  (Chromium / Playwright, production build, no StrictMode)
Renders per 20-keystroke sequence — 10-field and 50-field form.
React table. Vue table separate.

## Async Validation Latency  (Chromium / Playwright, production build)
Library, p50 ms, p99 ms, concurrent-race correct (PASS/FAIL).
```

### Honesty rules enforced by `generate-page.ts`

Three rules enforced before the file is written:

1. **No cherry-picking:** every surface key in `baseline.json` must appear in the output. Generator throws if a surface is present in results but absent from the page template.
2. **FAIL and ERROR before numbers:** if a library fails the correctness test or errors out, its perf number is replaced with `FAIL` or `ERROR`. A fast-but-wrong result never appears as a clean number.
3. **Shim disclosure:** if an adapter used a shim, the table cell appends `*` and a footnote explains exactly what the shim does and why the comparison is still informative.

---

## Summary

| Layer | Runner | Trigger | Permissions | Output |
|---|---|---|---|---|
| Core perf (neutro only) | vitest bench | Every PR | `pull-requests: write` | Regression comment or gate |
| Core perf (all libs) | vitest bench | Tag push | `contents: write` | `baseline.json` |
| Correctness (all libs) | vitest test | Tag push | `contents: write` | `baseline.json` |
| Re-renders + async latency | Playwright | Tag push | `contents: write` | `baseline.json` |
| Weekly drift check | All three | Sunday cron | `issues: write` | GitHub issue |
| Public page | generate-page.ts | Post bench-full | — | `docs/benchmarks/index.md` |
