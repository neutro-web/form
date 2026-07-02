# Mount-Cost Warm-Up Fix + Scorecard Badge Tooltips/Citations

**Date:** 2026-07-02
**Status:** Draft — pending user review
**Scope:** `bench/suites/browser/mount-cost.spec.ts` (Part 1); `bench/scripts/scorecard.ts`, `bench/lib/verdict.ts`, `bench/annotations.ts`, `bench/scripts/generate-page.ts` (Part 2)

---

## Part 1: mount-cost connection warm-up bug (do first)

### Problem

`mount-cost`'s reported `neutro/form (React)` value (35.0ms) is ~6-9x every other combo, including `neutro/form (Vue)` (7.5ms) and `neutro/form (Svelte)` (7.3ms), which sit close to their own competitors. This looked like a real React-adapter performance problem. It isn't.

**Verified empirically**, not just by reading code: whichever combo's `page.goto()` happens to be the *first* navigation Playwright issues against a given port in a test run pays a real network-level connection warm-up cost — visible directly in `PerformanceNavigationTiming.responseEnd`, a value set before any application JS runs at all. Proven with a controlled A/B (two identical probe functions, only declaration order swapped):

```
RHF running first:     domInteractive=32.5ms, responseEnd=14.1ms
neutro running second: domInteractive=4.2ms,  responseEnd=1.6ms
```
Swapping the order flips which one shows the high number. Reordering `mount-cost.spec.ts`'s `COMBOS` array (moving `neutro/form (React)` to the last position for port 4173, with a genuinely cold server — port killed and rebuilt beforehand) reproduced this: neutro's number did NOT move with it in that particular run, which momentarily looked contradictory, but the discrepancy traced to Playwright's `webServer` health-check absorbing the cold-boot cost into pre-test setup time in that specific invocation, not into any page's in-page navigation timing — the clean, isolated A/B above is the decisive evidence, and it's unambiguous.

`neutro/form` happens to be declared first in `COMBOS` for **every** framework (React, Vue, Svelte) — matching neutro's section also being first in DOM order in all three bench apps (a pre-existing convention from earlier surfaces, not something new). So neutro is systematically the one eating the cold-connection cost on every framework, every run, while every competitor is measured against an already-warm connection. This is a real measurement-validity bug in the benchmark, not a neutro/form defect.

### Design

Add one throwaway, unmeasured warm-up navigation to each distinct port before that port's real measured combos run, so every combo (including neutro) measures against an equally-warm connection.

```ts
// bench/suites/browser/mount-cost.spec.ts

const COMBOS: Array<{ name: string; port: number; readyTestId: string; library: string }> = [
  // ... unchanged ...
]

const warmedPorts = new Set<number>()

async function warmUp(page: Page, port: number) {
  if (warmedPorts.has(port)) return
  warmedPorts.add(port)
  await page.goto(`http://localhost:${port}/`)
}

test.describe('mount-cost', () => {
  for (const c of COMBOS) {
    test(c.name, async ({ page }, testInfo) => {
      await warmUp(page, c.port)
      const mountMs = await measureMountCost(page, `http://localhost:${c.port}/`, c.readyTestId)
      await attach(testInfo, c.library, mountMs)
      expect(mountMs).toBeGreaterThanOrEqual(0)
    })
  }
})
```

`warmedPorts` is module-level state shared across all `test()` calls in the file — safe here because Playwright runs this file's tests sequentially within a single worker by default (no `test.describe.configure({ mode: 'parallel' })` in this file), so there's no race on the `Set`. The warm-up navigation reuses the same `page` fixture the real measurement will use next, so the *connection* (not just DNS/OS-level state) is warm for the subsequent measured `page.goto()` to the same origin.

### Verification

After the fix, re-run the same A/B-style check used to diagnose this: run `mount-cost.spec.ts` for React with `neutro/form (React)` first in `COMBOS` (current order), then with it moved to last, and confirm the reported `mountMs` values are now close to identical regardless of position (within normal run-to-run noise, not a 6-9x swing). Then run the full suite and confirm `neutro/form (React)`, `(Vue)`, and `(Svelte)` all land in the same rough neighborhood as their competitors (single-digit-to-low-double-digit ms), not systematically 6-9x higher.

### Out of scope

- Re-litigating whether `domInteractive - startTime` is the right metric at all (it's a reasonable, standard proxy; the bug is the warm-up confound, not the metric choice).
- Applying the same warm-up pattern to other browser surfaces (`re-renders`, `array-ops`, `async-latency`, `async-cancellation`, `dom-cleanup`, `memory-churn`) — worth auditing separately, since some of those surfaces already navigate multiple times per combo (which may already incidentally warm the connection) or measure metrics that don't derive from `PerformanceNavigationTiming` at all. Flag as a follow-up if this pattern is suspected elsewhere, not bundled into this fix.

---

## Part 2: scorecard badge hover tooltips + numbered citations

### Problem

Scorecard badges (`✅ Win`, `➖ Tied`, `❌ Behind`, `⚖️ Tradeoff`, `— N/A`) are plain markdown text with no explanation attached. A reader has to already know the Methodology section's threshold rule and separately hunt through the page's prose/footnotes to understand *why* a specific cell landed where it did. `ANNOTATIONS` (`bench/annotations.ts`) already has per-surface, per-library explanations for the non-obvious cases, and the page already has a working footnote mechanism (`markdown-it-footnote`, wired in `docs/.vitepress/config.ts`) — but neither is currently attached to scorecard badges.

### Design

**Every badge gets two tiers of explanation:** a brief hover tooltip (native HTML `title` attribute — no new dependency, no new component, works immediately) and, when there's more to say, a numbered citation (the existing footnote mechanism) linking to a longer explanation at the bottom of the page.

**1. `ScorecardRow` carries the raw comparison, not just the verdict.**

`bench/scripts/scorecard.ts`'s `ScorecardRow.badges` changes from `Record<string, Verdict>` to `Record<string, BadgeCell>`:

```ts
export interface BadgeCell {
  verdict: Verdict
  neutroValue?: number
  competitorValue?: number
  unit?: 'renders' | 'ms' | 'bytes'
  higherIsBetter?: boolean
}
```

`buildScorecard` already computes `neutroResult`/`competitorResult` internally for every cell before calling `computeVerdict`/`computeBooleanVerdict` — it currently discards that after extracting the verdict. Concretely, per existing call site:

- `BROWSER_NUMERIC_SURFACES`'s array (`re-renders/10`, `re-renders/100`, `array-ops` — all `renderCount`; `async-latency` — `p50Ms`) gets a `unit` field added to each entry: `'renders'` for the three `renderCount`-metric surfaces, `'ms'` for `async-latency`. The existing loop's `badges[key] = computeVerdict(...)` becomes `badges[key] = { verdict: computeVerdict(...), neutroValue: neutroResult?.[metric], competitorValue: competitorResult[metric], unit, higherIsBetter }`.
- The `bundle-size` block (`badges['bundle-size'] = computeVerdict('bundle-size', library, neutroResult?.gzipBytes, competitorResult.gzipBytes, false, competitorResult.status)`) becomes `badges['bundle-size'] = { verdict: computeVerdict(...), neutroValue: neutroResult?.gzipBytes, competitorValue: competitorResult.gzipBytes, unit: 'bytes', higherIsBetter: false }`.
- The `async-cancellation` block and the `CORRECTNESS_SURFACES` loop (both boolean-verdict, via `computeBooleanVerdict`) become `badges[key] = { verdict: computeBooleanVerdict(...) }` — `neutroValue`/`competitorValue`/`unit` all omitted (`BadgeCell`'s fields are optional) since there's no meaningful numeric delta to show; their brief/detail text comes entirely from `ANNOTATIONS`/a fixed pass/fail phrase, not a computed percentage.

**2. `ANNOTATIONS` entries become `{ brief, detail }` pairs.**

`bench/annotations.ts`'s `ANNOTATIONS: Record<string, Record<string, string>>` becomes `Record<string, Record<string, { brief: string; detail: string }>>`. This is a one-time, mechanical rewrite of the existing ~15 entries — e.g.:

```ts
'async-cancellation': {
  'react-hook-form': {
    brief: 'no async cancellation API',
    detail: 'no async cancellation API; a slow stale validation can overwrite a fresh result',
  },
  // ... same brief/detail split for every existing entry
},
```

For most entries the existing string becomes `detail` verbatim, and `brief` is a short lead-in phrase extracted from it (already close to how these are written — most existing annotation strings already start with a short clause before further elaboration).

**3. New badge-text module computes brief + optional detail for every verdict type.**

New file `bench/scripts/badge-text.ts`:

```ts
import { ANNOTATIONS } from '../annotations.js'
import type { BadgeCell } from './scorecard.js'

export interface BadgeText {
  brief: string
  detail?: string // only present when there's more to say than the brief
}

function formatValue(v: number, unit?: string): string {
  if (unit === 'ms') return `${v.toFixed(1)}ms`
  if (unit === 'bytes') return `${(v / 1024).toFixed(1)} KB`
  return `${v}${unit === 'renders' ? ' renders' : ''}`
}

export function badgeText(surface: string, library: string, neutroLibrary: string | undefined, cell: BadgeCell): BadgeText {
  const annotation = ANNOTATIONS[surface]?.[library] ?? (neutroLibrary ? ANNOTATIONS[surface]?.[neutroLibrary] : undefined)

  if (cell.verdict === 'tradeoff' || cell.verdict === 'behind') {
    if (annotation) return { brief: annotation.brief, detail: annotation.detail }
    // 'behind' with no annotation shouldn't normally happen (verdict.ts's computeVerdict only
    // returns 'tradeoff' when an annotation exists, so a bare 'behind' has none by construction) -
    // fall back to a computed brief so the badge is never unexplained.
  }

  if (cell.verdict === 'na') {
    if (annotation) return { brief: annotation.brief, detail: annotation.detail }
    return { brief: "surface doesn't apply to this library" }
  }

  if (cell.neutroValue != null && cell.competitorValue != null && cell.neutroValue !== 0) {
    let pct = (cell.competitorValue - cell.neutroValue) / cell.neutroValue
    if (cell.higherIsBetter) pct = -pct
    const pctLabel = `${Math.abs(Math.round(pct * 100))}%`

    if (cell.verdict === 'tied') {
      return {
        brief: `within 10% (${pctLabel})`,
        detail: `neutro/form: ${formatValue(cell.neutroValue, cell.unit)} vs ${library}: ${formatValue(cell.competitorValue, cell.unit)}`,
      }
    }
    if (cell.verdict === 'win') {
      return {
        brief: `${pctLabel} ${cell.higherIsBetter ? 'better' : 'faster'}`,
        detail: `neutro/form: ${formatValue(cell.neutroValue, cell.unit)} vs ${library}: ${formatValue(cell.competitorValue, cell.unit)} (${pctLabel} ${cell.higherIsBetter ? 'better' : 'fewer/faster'})`,
      }
    }
    // 'behind' with no annotation - shouldn't reach here per the comment above, but stay honest if it does.
    return {
      brief: `${pctLabel} behind, no documented reason`,
      detail: `neutro/form: ${formatValue(cell.neutroValue, cell.unit)} vs ${library}: ${formatValue(cell.competitorValue, cell.unit)}`,
    }
  }

  // Boolean-verdict surfaces (correctness pass/fail, cancellation) with tied/win and no numeric delta.
  return { brief: cell.verdict === 'tied' ? 'both pass' : 'neutro passes, this library does not' }
}
```

**4. Rendering: `generate-page.ts`'s `scorecardTable` wraps each badge in a `title` span and attaches a footnote when `detail` is present.**

```ts
function scorecardTable(columns: string[]): string {
  const rows = buildScorecard(baseline)
  const header = `| Library | ${columns.join(' | ')} |`
  const divider = `|---|${columns.map(() => '---').join('|')}|`
  const body = rows.map(r => {
    const cells = columns.map(c => {
      const cell = r.badges[c]
      if (!cell) return BADGE_LABEL['na']
      const neutroLib = findNeutroLibrary(/* ... */) // same helper already used in scorecard.ts's build step
      const { brief, detail } = badgeText(c, r.library, neutroLib, cell)
      const label = BADGE_LABEL[cell.verdict]
      const citation = detail ? addFootnote(c, r.library, detail) : ''
      return `<span title="${brief.replace(/"/g, '&quot;')}">${label}</span>${citation}`
    })
    return `| ${r.library} | ${cells.join(' | ')} |`
  }).join('\n')
  return `${header}\n${divider}\n${body}`
}
```

`addFootnote`/the existing footnote-key-dedup logic in `generate-page.ts` is reused as-is (already keys by `${surface}-${library}`, already dedupes). `findNeutroLibrary` currently lives in `scorecard.ts` as a module-private function — this design promotes it to an exported function so `generate-page.ts` can call it too (needed to look up the `neutroLibrary`-keyed annotation fallback, matching `verdict.ts`'s existing `hasAnnotation` check).

### Scale note

This adds roughly 30-45 new footnotes to the page (9 competitors × 5 performance surfaces + correctness + bundle-size cells that have a `detail`), landing in the single footnote list at the bottom via the existing mechanism — more volume through an already-working pipe, not a new one.

### Verification

After implementation, regenerate the page and directly inspect: every badge cell has a `title` attribute with non-empty text; every cell whose `brief` differs from a trivial restatement (i.e., every Win/Tied/Behind/Tradeoff/annotated-N/A cell) has a corresponding numbered footnote reference that resolves to real text in the footnotes list; hovering a badge in an actual browser (VitePress dev server) shows the native tooltip; clicking a citation number jumps to the correct footnote.

### Out of scope

- A custom-styled tooltip component (native `title` attribute chosen over this — see design discussion).
- Retroactively adding `{brief, detail}` annotations for surfaces that don't have any `ANNOTATIONS` entry today and aren't Win/Tied/Behind (e.g. surfaces that are always N/A for every competitor with no documented reason) — those still fall back to the generic `"surface doesn't apply to this library"` brief with no citation, which is accurate as-is.
