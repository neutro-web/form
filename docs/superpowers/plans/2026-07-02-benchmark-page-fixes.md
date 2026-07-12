# Benchmark Public Page Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three real defects in the public benchmarks page (`docs/benchmarks/index.md`): `mount-cost`/`memory-churn` tables render with no data despite the underlying data existing, the `validation-scope-precision` correctness row is malformed (test description in the library column, blank Why), and `array-ops` shows neutro/form behind `tanstack-form (Svelte)` with no explanation even though the gap is a broken competitor measurement, not a real neutro shortfall.

**Architecture:** All three fixes are small, targeted changes to the bench reporting pipeline (`bench/scripts/generate-page.ts`, `bench/annotations.ts`, `bench/suites/correctness/scope-precision.test.ts`) — no changes to `packages/core` or the measurement logic itself, only to how already-correct data is labeled and rendered.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- No changes to `packages/core/src/index.ts` or any measurement/benchmark logic — every fix here is about labeling/rendering already-correct data, not changing what's measured.
- Root causes (verified against source, not guessed):
  1. `bench/scripts/generate-page.ts`'s `browserTable()` only recognizes 4 result fields (`renderCount`, `p50Ms`, `cancellationPass`, `connectedCountAfterCleanup`) — `mountMs` (mount-cost) and `heapDeltaBytes` (memory-churn) are present in `bench/results/baseline.json` but never rendered.
  2. `bench/suites/correctness/scope-precision.test.ts`'s `test(...)` call uses the assertion's description as its name, but `bench/scripts/merge-results.ts`'s `normalizeCorrectnessJson` maps `test.title` directly into the `library` column — every other correctness test names itself after a library (e.g. `test('neutro/form', ...)`), which this test should do too, matching the established convention.
  3. `bench/annotations.ts`'s `ANNOTATIONS` has no `'array-ops'` entry, so `bench/lib/verdict.ts`'s `computeVerdict` has nothing to soften the `tanstack-form (Svelte)` result (`renderCount: 0`, confirmed in `bench/results/baseline.json`) from `behind` to `tradeoff` — this is a known, previously-investigated finding from this session's earlier v0.5.0 work: TanStack's own Svelte bench harness never defines `window.__resetArrayRenders`, so its render counter (`window.__tanstackArrayRenders`) stays permanently empty and reports as an artificially low `0`, not because TanStack Svelte does less real work.

---

### Task 1: Fix all three page-generation defects

**Files:**
- Modify: `bench/scripts/generate-page.ts`
- Modify: `bench/annotations.ts`
- Modify: `bench/suites/correctness/scope-precision.test.ts`

**Interfaces:**
- Consumes: `bench/results/baseline.json`'s existing `browser['mount-cost']`/`browser['memory-churn']` entries (already have real `mountMs`/`heapDeltaBytes` values — confirmed present, just unrendered), `browser['array-ops']` entries (confirmed `tanstack-form (Svelte)` has `renderCount: 0`).
- Produces: no new exports; `docs/benchmarks/index.md` regenerated with all three fixes reflected.

- [ ] **Step 1: Add mount-cost and memory-churn rendering to browserTable()**

In `bench/scripts/generate-page.ts`, find `function browserTable(surface: string, results: BrowserResult[]): string {` and replace it entirely with:

```ts
function browserTable(surface: string, results: BrowserResult[]): string {
  const hasRender = results.some(r => r.renderCount != null)
  const hasLatency = results.some(r => r.p50Ms != null)
  const hasCancellation = results.some(r => r.cancellationPass != null)
  const hasCleanup = results.some(r => r.connectedCountAfterCleanup != null)
  const hasMount = results.some(r => r.mountMs != null)
  const hasHeap = results.some(r => r.heapDeltaBytes != null)

  const headers: string[] = ['Library']
  if (hasRender) headers.push('Renders')
  if (hasLatency) headers.push('p50', 'p99')
  if (hasCancellation) headers.push('Cancellation')
  if (hasCleanup) headers.push('Connected after cleanup')
  if (hasMount) headers.push('Time to interactive')
  if (hasHeap) headers.push('Heap delta (post-GC)')

  const rows = results.map(r => {
    const cells: string[] = [r.library]
    if (hasRender) cells.push(r.renderCount != null ? String(r.renderCount) : '—')
    if (hasLatency) cells.push(
      r.p50Ms != null ? `${r.p50Ms}ms${reasonMarker(surface, r.library)}` : '—',
      r.p99Ms != null ? `${r.p99Ms}ms` : '—',
    )
    if (hasCancellation) cells.push(
      r.cancellationPass == null ? '—' : r.cancellationPass ? '✅' : `❌${reasonMarker(surface, r.library)}`,
    )
    if (hasCleanup) cells.push(r.connectedCountAfterCleanup != null ? String(r.connectedCountAfterCleanup) : '—')
    if (hasMount) cells.push(r.mountMs != null ? `${r.mountMs.toFixed(1)}ms` : '—')
    if (hasHeap) cells.push(r.heapDeltaBytes != null ? `${(r.heapDeltaBytes / 1024).toFixed(1)} KB` : '—')
    return `| ${cells.join(' | ')} |`
  }).join('\n')

  return `| ${headers.join(' | ')} |\n|${headers.map(() => '---').join('|')}|\n${rows}`
}
```

This is purely additive — the four existing `has*`/cell branches are untouched, only two new ones (`hasMount`, `hasHeap`) are added following the exact same pattern.

- [ ] **Step 2: Add titles for the two surfaces**

In `bench/scripts/generate-page.ts`, find the `SURFACE_TITLES` object and add two entries (keep existing entries unchanged):

```ts
const SURFACE_TITLES: Record<string, string> = {
  're-renders/10': 'Re-renders per 20-keystroke sequence (10-field form)',
  're-renders/100': 'Re-renders per 20-keystroke sequence (100-field form)',
  'async-latency': 'Async Validation Latency',
  'async-latency-debounce-floor': 'Async Validation Latency — Debounce Floor (neutro only)',
  'array-ops': 'Array Operations (remove + move, render count)',
  'async-cancellation': 'Async Cancellation (stale-result race)',
  'dom-cleanup': 'DOM Cleanup (connect/disconnect, neutro only)',
  'mount-cost': 'Mount Cost (time to interactive, Navigation Timing API)',
  'memory-churn': 'Memory Churn (heap delta across mount/unmount cycles, post-GC)',
}
```

- [ ] **Step 3: Fix the validation-scope-precision test's library naming**

In `bench/suites/correctness/scope-precision.test.ts`, change the `test(...)` call's name from the assertion description to `'neutro/form'`, matching every other correctness test's convention. Full corrected file:

```ts
import { describe, test, expect } from 'vitest'
import { createForm } from '@neutro/form-core'

describe('validation-scope-precision', () => {
  test('neutro/form', async () => {
    const totalFields = 504 // trigger + 3 dependents + 500 unrelated
    const initialValues: Record<string, number> = { trigger: 0, dependent1: 0, dependent2: 0, dependent3: 0 }
    for (let i = 0; i < 500; i++) initialValues[`unrelated${i}`] = 0

    let lastScopeSize = -1
    const form = createForm({
      initialValues,
      dependencies: { trigger: ['dependent1', 'dependent2', 'dependent3'] },
      validator: async (_values, scopePaths) => {
        lastScopeSize = scopePaths?.length ?? -1
        return {}
      },
    })

    expect(Object.keys(initialValues)).toHaveLength(totalFields)

    await form.set('trigger', 1, { validate: true })

    // Verified against compileDependencyScopes: the changed field is included in its
    // own precomputed scope (resolveTransitiveClosure adds the seed path to `visited`
    // before resolving dependents), so the expected scope is trigger + 3 dependents = 4,
    // not the 504 total fields in the form.
    expect(lastScopeSize).toBe(4)
  })
})
```

The only change from the current file is the `test(...)` call's first argument (`'neutro/form'` instead of the long description) — everything else, including the assertion and comments, is unchanged.

- [ ] **Step 4: Add the Why text and the array-ops annotation**

In `bench/annotations.ts`, add one entry to `PASS_REASONS` (the correctness Why-column source):

```ts
export const PASS_REASONS: Record<string, string> = {
  'array-state-integrity': 'errors/touched/dirty state is rekeyed by index on every array splice/move/swap',
  'async-race': 'each async validation run gets its own AbortController; stale results are discarded by epoch',
  'dependency-trigger': 'a static dependency graph is precompiled at form init, so dependent fields re-validate automatically',
  'validation-scope-precision': 'set() on a field with 3 declared dependents validates exactly itself + those 3 (4 of 504 total fields), not the whole form — the O(1) precomputed dependency-graph claim, quantified',
}
```

And add one entry to `ANNOTATIONS` for `array-ops` (add this as a new top-level key alongside the existing `async-latency`, `async-cancellation`, etc. entries — do not modify any existing entry):

```ts
  'array-ops': {
    'tanstack-form (Svelte)': "TanStack's own Svelte bench harness never defines window.__resetArrayRenders, so its render counter (window.__tanstackArrayRenders) stays permanently empty and reports an artificial 0 — not a real absence of render work. Confirmed by direct inspection during this project's own v0.5.0 verification; not a neutro/form architectural gap.",
  },
```

- [ ] **Step 5: Rerun the correctness suite and regenerate the page**

The only measurement that changed is the correctness suite (the test name change affects what `bench/results/correctness.json` contains); core/browser/bundle-size data is unaffected and does not need to be re-run.

```bash
cd bench
pnpm run bench:correctness
pnpm run bench:merge
cp results/latest.json results/baseline.json
pnpm run bench:generate
```

- [ ] **Step 6: Verify all three fixes are actually reflected**

```bash
grep -A5 "### mount-cost" ../docs/benchmarks/index.md
grep -A5 "### memory-churn" ../docs/benchmarks/index.md
grep -A3 "### validation-scope-precision" ../docs/benchmarks/index.md
grep -B2 -A2 "tanstack-form (Svelte)" ../docs/benchmarks/index.md | grep -A2 "Array Operations"
```

Expected:
- The mount-cost and memory-churn tables now show real per-library rows with `Time to interactive`/`Heap delta (post-GC)` columns populated (not `—` for every row).
- `validation-scope-precision`'s row shows `neutro/form` in the Library column and the new PASS_REASONS text in the Why column, not the old malformed description-as-library-name row.
- The array-ops scorecard badge for `tanstack-form (Svelte)` should now be `⚖️ Tradeoff` (not `❌ Behind`), and its detail table's `0` render count should carry a footnote marker linking to the new annotation text (check `grep -A1 "tanstack-form-svelte" ../docs/benchmarks/index.md` finds the new footnote in the footnotes section at the bottom of the page — if the exact footnote key format looks different, that's fine, just confirm SOME footnote linking to the new annotation text appears).

If any of these don't show the expected result, do not proceed to commit — investigate `bench/scripts/generate-page.ts` and `bench/lib/verdict.ts` further before committing a page that still doesn't reflect the fix.

- [ ] **Step 7: Full verification sweep**

```bash
cd /Users/kofi/_/agw-form
pnpm test
pnpm exec tsc --noEmit
pnpm lint
```

- [ ] **Step 8: Commit**

```bash
git add bench/scripts/generate-page.ts bench/annotations.ts bench/suites/correctness/scope-precision.test.ts bench/results/baseline.json docs/benchmarks/index.md
git commit -m "fix(bench): render mount-cost/memory-churn tables, fix scope-precision row, annotate array-ops Svelte gap

Three real defects in the public benchmarks page, all about labeling
and rendering already-correct data (no measurement logic changed):

- browserTable() only recognized 4 result fields; mountMs and
  heapDeltaBytes (added by the mount-cost and memory-churn surfaces)
  were present in baseline.json but never rendered, producing
  header-only empty tables.
- scope-precision.test.ts named its test after the assertion
  description instead of a library name, so merge-results.ts's
  test.title -> library mapping produced a malformed correctness row
  (description in the Library column, blank Why). Renamed to match
  every other correctness test's 'neutro/form' convention, and added
  the missing Why text via PASS_REASONS.
- array-ops had no ANNOTATIONS entry for tanstack-form (Svelte), so
  its renderCount: 0 (an artifact of TanStack's own Svelte harness
  never wiring window.__resetArrayRenders, confirmed during this
  project's earlier v0.5.0 verification) showed as an unexplained
  Behind badge instead of an annotated Tradeoff."
```

## Verification (whole-task)

- All three defects independently confirmed via direct source reading before this plan was written (not guessed): `browserTable()`'s field-detection logic, `merge-results.ts`'s `test.title` mapping, and `verdict.ts`'s annotation-gated tradeoff/behind branch.
- Step 6 requires actually reading the regenerated page's output, not just re-running the pipeline and assuming success.
