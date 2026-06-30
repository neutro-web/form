# Benchmark Suite v2 — Comprehensive Coverage & Intuitive Reporting

**Date:** 2026-06-30
**Status:** Approved
**Scope:** `bench/` directory and `docs/benchmarks/index.md` generation — extends the browser-first suite delivered in `2026-06-30-browser-first-benchmarks.md`

---

## Purpose

The browser-first suite (re-renders, async-latency) is real but narrow: on those two surfaces neutro/form ties the best competitors on renders and trails on latency by design (a 300ms debounce). That's an honest result, but it's incomplete — it doesn't show the surfaces where neutro's architecture is actually distinct (array state-integrity under mutation, async race safety, dependency-scope correctness), and it presents the latency gap without explaining why it exists.

This round has three goals:

1. **Cover everything measurable** — every core algorithmic surface and every browser/framework surface gets a number, comparative wherever competitors genuinely support the operation.
2. **Make gaps legible** — where neutro trails, the page says why (a deliberate trade-off) or flags it honestly (a real gap, no excuse). Where a competitor can't do something at all, the page says what's architecturally missing, not just "N/A".
3. **Make the page readable in 10 seconds** — a top-of-page scorecard of badges, with full numbers underneath for anyone who wants to dig in.

---

## New Surfaces

| # | Surface | Type | Where it runs | What it measures |
|---|---|---|---|---|
| 1 | `array-ops` (browser) | Comparative | All 3 apps, all 9 libraries | Render count when removing/moving item 3 of a 10-item array field |
| 2 | `async-race` (browser) | Comparative | All 3 apps, all 9 libraries | Whether the UI shows the fresh (not stale) validation result when two async validations race |
| 3 | `async-latency` debounce-floor column | Comparative | React/Vue/Svelte neutro pages only | Same async-latency spec, with neutro's `asyncDebounceMs: 0` — shown as a second column next to the existing default-debounce number |
| 4 | `re-renders` scale dimension | Comparative | All 3 apps, all 9 libraries | Existing re-renders spec re-run at 100 fields, keyed as `re-renders/100` alongside today's `re-renders/10` |
| 5 | `bundle-size` | Comparative | Node, static analysis | Minified + gzipped size of a minimal "create form, register one field, validate" snippet per library |
| 6 | `dom-cleanup` | Architecture (neutro-only) | Browser, neutro pages only | Detached-node retention through `connect`/disconnect across N mount/unmount cycles — no competitor equivalent exists |
| 7 | Correctness comment cleanup | Housekeeping | N/A | `array-state-integrity.test.ts` and `dependency-trigger.test.ts` skip comments still say "shim" (stale since the Node shim adapters were deleted); rewritten to state the real architectural reason |
| 8 | Scorecard | Page generation | `generate-page.ts` | Computed summary table, not stored as its own data — rows = libraries, columns = surfaces, cells = one badge |

### Surface 1: `array-ops` (browser, comparative)

Each framework app's `/` page gains an array-CRUD section per library: a 10-item array of text fields, with Remove and Move buttons on each row. The Playwright spec performs "remove item index 3" and "move item 3 to index 7" against each library's array helper (neutro's `arrayRemove`/`arrayMove`, RHF's `useFieldArray`, Formik's `FieldArray`, TanStack's array field API, Vee-Validate's `useFieldArray`, Felte's array helpers — TanStack/Svelte gets the same), counts total renders across the array's fields during the operation, same render-counting pattern (`window.__*Renders`) as the existing re-renders spec.

Where a library's array helper genuinely doesn't exist outside its native hook/composable context (none currently expected to be missing, since all 5 competitor libraries ship array helpers), the result is `status: 'na'` with an annotation reason.

### Surface 2: `async-race` (browser, comparative)

Reuses the existing `/async/<lib>` pages — no new routes. The mock validator's delay becomes value-dependent: typing a value containing `"slow"` triggers a 600ms delay, any other value triggers 100ms. The spec:

1. Types a `"slow@example.com"` value (kicks off the 600ms validation, which is *valid* — no error)
2. Immediately (before that resolves) types `"fastbad"` over it (kicks off the 100ms validation, which is *invalid* — no `@`, produces an error). The two validations resolve to deliberately different outcomes so a stale overwrite is observable.
3. Waits past 600ms total
4. Reads the final error/value state

Pass = the UI reflects the result of the second (fresh) validation, not the first (stale) one. This is a real measured outcome per library, not an assertion — it replaces the existing hardcoded `concurrentRacePass: library.startsWith('neutro/form')` in `async-latency.spec.ts`.

### Surface 3: async-latency debounce-floor

Only applies to neutro (the only library in this suite with a debounce policy). Adds `/async/neutro?debounce=0` routes (read via `URLSearchParams`, passed to `createForm({ asyncDebounceMs: ... })`) to all 3 neutro async pages. The existing `runLatencyTest` helper runs against both the default URL and the `?debounce=0` URL, writing two entries: `'neutro/form (React)'` (unchanged) and `'neutro/form (React) [debounce=0]'` (new).

### Surface 4: `re-renders` at scale

The existing re-renders spec already targets `field0` specifically. Each framework app's fixture field count becomes configurable via a `?fields=100` query param (default 10, unchanged for existing tests). Two new test entries per library: `re-renders/10` (today's behavior, renamed from bare `re-renders`) and `re-renders/100`.

### Surface 5: `bundle-size`

New Node-only script `bench/suites/bundle/measure.ts`. For each of the 6 libraries (neutro + 5 competitors), it esbuild-bundles a fixture snippet (`bench/fixtures/bundle/<lib>.ts`, one tiny file per library: import the library, create a form, register one field, call validate) with `minify: true, format: 'esm', bundle: true`, gzips the output, records byte size. No Playwright, no framework app involved — runs in the existing `bench:core`-style Node path. Requires adding `esbuild` to `bench/package.json` devDependencies (not currently present).

### Surface 6: `dom-cleanup`

New `/cleanup` route on the neutro pages only (React/Vue/Svelte — neutro's `connect`/disconnect API is framework-agnostic, but it needs a DOM to mount into). The page mounts and unmounts a batch of N=50 fields, 10 times, with the `connect`/disconnect lifecycle wired to component mount/unmount. The Playwright spec triggers this, then uses `page.evaluate(() => (window as any).__connectionRegistrySize)` — a small test-only hook on `connectionRegistry` exposed in dev/test builds — to confirm the registry shrinks back to 0 after each unmount batch (proving the `WeakRef`+`MutationObserver` prune logic actually fires, not just that GC eventually happens).

This produces one result row per framework (3 total), no `library` comparison axis — stored under a new top-level `BenchResults.architecture` section.

### Surface 7: Correctness comment cleanup

No new tests. Edit existing `test.skip` comments in `array-state-integrity.test.ts` and `dependency-trigger.test.ts` to remove "shim" language and state the real reason (e.g. "no public API to rekey per-field error/touched state on array splice outside React context" instead of "shim"). These reasons get mirrored into `bench/annotations.ts` (see below) so the generated page shows them inline next to the N/A badge.

Both files predate the Svelte app and only have skip entries for the original 4 competitors (RHF, Formik, TanStack, Vee-Validate) — Felte and TanStack/Svelte are not added to these Node-level correctness tests. The new browser-level `array-ops` surface (Surface 1) already covers all 9 library+framework combinations for array-mutation behavior, which is the more meaningful test for Svelte's libraries anyway since they only run inside a component context.

### Surface 8: Scorecard

See "Page Layout" below.

---

## Verdict / Badge System

New module: `bench/lib/verdict.ts`.

```ts
export type Verdict = 'win' | 'tied' | 'behind' | 'tradeoff' | 'na' | 'error'

export const VERDICT_THRESHOLD = 0.10 // 10%

export function computeVerdict(
  surface: string,
  library: string,
  neutroValue: number | undefined,
  competitorValue: number | undefined,
  higherIsBetter: boolean,
  status: 'ok' | 'error' | 'na',
): Verdict
```

Logic:
- `status === 'na'` → `'na'`
- `status === 'error'` → `'error'`
- `neutroValue` or `competitorValue` missing → `'na'`
- `pct = (competitorValue - neutroValue) / neutroValue`, sign-adjusted by `higherIsBetter` so the result is always "neutro's relative position"
- `|pct| <= VERDICT_THRESHOLD` → `'tied'`
- `pct` favors neutro by more than threshold → `'win'`
- `pct` favors competitor by more than threshold → look up `ANNOTATIONS[surface]?.[library]`; if present → `'tradeoff'`, else → `'behind'`

Badges are always computed **relative to neutro** (this is neutro's own benchmark page; the scorecard answers "how does neutro compare to X", not a neutral N-way ranking).

`higherIsBetter` is `false` for `renderCount`, `p50Ms`, `p99Ms`, `bundleSizeBytes`; `true` for `opsPerSec`. A small per-metric table in `verdict.ts` maps metric name → direction, reused by `post-drift-issue.ts`'s existing drift-direction logic where applicable (drift detection keeps its own separate 20% constant — different concern, not unified).

---

## `bench/annotations.ts` (new, hand-maintained)

```ts
export const ANNOTATIONS: Record<string, Record<string, string>> = {
  'async-latency': {
    'neutro/form (React)': 'neutro debounces async validation 300ms by default (asyncDebounceMs) to avoid firing on every keystroke. See the debounce=0 column for the floor cost.',
    'neutro/form (Vue)': 'same debounce policy as React — see debounce=0 column.',
    'neutro/form (Svelte)': 'same debounce policy as React — see debounce=0 column.',
  },
  'async-race': {
    'react-hook-form': 'no async cancellation API; a slow stale validation can overwrite a fresh result',
    'formik': 'no async cancellation API',
    'tanstack-form (React)': 'no async cancellation API',
    'tanstack-form (Svelte)': 'no async cancellation API',
    'vee-validate': 'no async cancellation API',
    'felte': 'no async cancellation API',
  },
  'array-state-integrity': {
    'tanstack-form': 'no public API to rekey per-field error/touched state on array splice outside React context',
    'react-hook-form': 'state-map rekey on splice not exposed outside hook context',
    'formik': 'state-map rekey on splice not exposed outside hook context',
    'vee-validate': 'state-map rekey on splice not exposed outside composable context',
  },
  'dependency-trigger': {
    'tanstack-form': 'requires per-field validators; no declarative cross-field dependency graph',
    'react-hook-form': 'no declarative dependency graph; cross-field validation is manual',
    'formik': 'no declarative dependency graph; cross-field validation is manual',
    'vee-validate': 'no declarative dependency graph; cross-field validation is manual',
  },
}
```

Keyed `surface -> library -> reason`. This is the single source for both Tradeoff badge tooltip text and N/A reason text shown inline in detail tables. Reviewed in PRs like any other source file. No auto-generation.

---

## Schema Changes (`bench/types/schema.ts`)

```ts
export interface BrowserResult {
  library: string
  status: 'ok' | 'error' | 'na'
  renderCount?: number
  p50Ms?: number
  p99Ms?: number
  racePass?: boolean          // replaces concurrentRacePass; now a measured result, not an assertion
  error?: string
}

export interface BundleSizeResult {
  library: string
  status: 'ok' | 'error'
  gzipBytes?: number
  error?: string
}

export interface ArchitectureResult {
  framework: 'React' | 'Vue' | 'Svelte'
  status: 'ok' | 'error'
  registryEmptyAfterCleanup?: boolean
  error?: string
}

export interface BenchResults {
  meta: { /* unchanged */ }
  core:         Record<string, LibraryBenchResult[]>
  correctness:  Record<string, CorrectnessResult[]>
  browser:      Record<string, BrowserResult[]>        // gains keys: 'array-ops', 'async-race', 're-renders/10', 're-renders/100' (replaces bare 're-renders')
  bundleSize:   Record<string, BundleSizeResult[]>      // new top-level section, single key 'bundle-size'
  architecture: Record<string, ArchitectureResult[]>    // new top-level section, single key 'dom-cleanup'
}
```

`concurrentRacePass` is removed (replaced by the real `async-race` surface + `racePass` field). `CorrectnessResult.detail` keeps its existing shape; its "shim description" comment is stale and gets removed (no shims exist) but the field itself is unchanged.

`baseline.json` gains empty `bundleSize: {}` and `architecture: {}` keys alongside the existing empty sections.

---

## Page Layout (`docs/benchmarks/index.md`, regenerated by `generate-page.ts`)

1. **Scorecard** (new, top of page) — table: rows = the 9 library+framework combinations, columns = every comparative surface (`re-renders/10`, `re-renders/100`, `async-latency`, `array-ops`, `async-race`, `bundle-size`). Cells = badge emoji + label (`✅ Win`, `➖ Tied`, `❌ Behind`, `⚖️ Tradeoff`, `— N/A`). Computed at generate time from the detail sections + `verdict.ts`, not stored separately.
2. **Correctness** (existing, N/A rows now render the annotation reason inline next to the badge instead of a bare `— N/A`)
3. **Browser performance** — existing re-renders and async-latency tables (now with `/10` `/100` and debounce-floor columns), plus new array-ops and async-race tables
4. **Bundle size** (new table: library, gzip KB, badge)
5. **Architecture** (new, neutro-only, no comparison table — one row per framework showing `dom-cleanup` result, prose explaining what `connect`/disconnect proves)
6. Footnotes — Tradeoff and N/A reason text sourced from `annotations.ts`, same footnote-dedup pattern as today

---

## What Stays the Same

- Existing 9 library × framework combinations, existing 3 framework apps on ports 4173/4174/4175
- Existing core (neutro-only Node bench) suites — untouched, still internal regression data, not republished as a comparison
- Existing correctness suite structure (neutro pass / competitor N/A) — only the skip-comment wording changes
- CI workflow structure (`bench-full.yml`, `bench-weekly.yml`) — new surfaces slot into the existing `bench:browser` / `bench:core` / `bench:merge` / `bench:generate` pipeline; no new top-level CI steps needed beyond what the new spec files already require via existing scripts
- `post-drift-issue.ts` drift detection — keeps its own 20% threshold, independent of the new 10% verdict threshold

---

## Out of Scope

- No new framework targets (still React/Vue/Svelte only)
- No competitor version pinning/tracking beyond what already exists in each app's `package.json`
- No historical trend charts (single latest-vs-baseline comparison only, as today)
