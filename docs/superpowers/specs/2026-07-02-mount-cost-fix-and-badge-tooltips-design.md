# Mount-Cost Warm-Up Fix + Scorecard Badge Tooltips/Citations

**Date:** 2026-07-02
**Status:** Draft — pending user review
**Scope:** `bench/suites/browser/mount-cost.spec.ts` (Part 1); `bench/scripts/scorecard.ts`, `bench/scripts/scorecard.test.ts`, `bench/annotations.ts`, `bench/scripts/generate-page.ts` (Part 2). `bench/lib/verdict.ts` needs **zero code changes** (see Part 2, point 6) — its `Boolean(ANNOTATIONS[...])` checks stay correct against the reshaped annotation objects since any non-null object is truthy — but is worth re-reading during implementation to confirm that hasn't changed.

---

## Part 1: mount-cost connection warm-up bug (do first)

### Problem

`mount-cost`'s reported `neutro/form (React)` value (35.0ms) is ~6-9x every other combo, including `neutro/form (Vue)` (7.5ms) and `neutro/form (Svelte)` (7.3ms), which sit close to their own competitors. This looked like a real React-adapter performance problem. It isn't.

**Verified empirically**, not just by reading code: whichever combo's `page.goto()` happens to be the *first* navigation Playwright issues against a given port in a test run pays a real network-level connection warm-up cost — visible directly in `PerformanceNavigationTiming.responseEnd`, a value set before any application JS runs at all. Proven with a controlled A/B (two identical probe functions, only declaration order swapped):

```
RHF running first:     domInteractive=32.5ms, responseEnd=14.1ms
neutro running second: domInteractive=4.2ms,  responseEnd=1.6ms
```
Swapping the order flips which one shows the high number. **This is the decisive evidence and it's unambiguous on its own.** A separate reproduction attempt — reordering `mount-cost.spec.ts`'s actual `COMBOS` array (moving `neutro/form (React)` to the last position for port 4173, with a genuinely cold server — port killed and rebuilt beforehand) — did NOT show the same flip in that run; neutro's number stayed high even though it ran last. That result is not fully explained (the working theory is that Playwright's `webServer` health-check absorbed the cold-boot cost into pre-test setup time in that specific invocation, outside any page's in-page navigation timing, which would mean it wasn't testing the same thing as the clean A/B) — but this is a theory, not something independently confirmed. **Given this unresolved discrepancy, the fix below should not be treated as proven correct until the Verification step is actually run and shown to close the gap** — the isolated A/B is strong evidence for the mechanism, but the full-suite reproduction attempt leaves a loose end worth being honest about rather than explaining away.

`neutro/form` happens to be declared first in `COMBOS` for **every** framework (React, Vue, Svelte) — matching neutro's section also being first in DOM order in all three bench apps (a pre-existing convention from earlier surfaces, not something new). So neutro is systematically the one eating the cold-connection cost on every framework, every run, while every competitor is measured against an already-warm connection (or, per the unresolved discrepancy above, whichever less-clean mechanism is really at play) — either way, this is a real measurement-validity concern in the benchmark, not a confirmed neutro/form defect.

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

`warmedPorts` is module-level state shared across all `test()` calls in the file — safe here because Playwright runs this file's tests sequentially within a single worker by default (verified against `bench/playwright.config.ts`: no `workers`, no `fullyParallel`, and this file has no `test.describe.configure({ mode: 'parallel' })`), so there's no race on the `Set`. The warm-up navigation reuses the same `page` fixture the real measurement will use next, so the *connection* (not just DNS/OS-level state) is warm for the subsequent measured `page.goto()` to the same origin.

**One wrinkle, not a correctness problem:** `bench/playwright.config.ts` sets `retries: 2`. A retried test runs in a fresh worker process, which resets `warmedPorts` for that worker — meaning a retry pays one extra (harmless, unmeasured) warm-up navigation. This doesn't affect correctness, just worth knowing if warm-up-navigation counts ever look higher than expected during debugging.

### Verification

**This step is not optional polish — given the Problem section's unresolved discrepancy, treat this as the actual proof the fix works, not a formality.** After the fix, re-run the same A/B-style check used to diagnose this: run `mount-cost.spec.ts` for React with `neutro/form (React)` first in `COMBOS` (current order), then with it moved to last, and confirm the reported `mountMs` values are now close to identical regardless of position (within normal run-to-run noise, not a 6-9x swing). Then run the full suite and confirm `neutro/form (React)`, `(Vue)`, and `(Svelte)` all land in the same rough neighborhood as their competitors (single-digit-to-low-double-digit ms), not systematically 6-9x higher. If either check doesn't hold, the fix has not actually addressed the root cause and needs further diagnosis before being committed — do not commit on the strength of the A/B evidence alone.

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

`bench/scripts/scorecard.ts`'s `ScorecardRow.badges` changes from `Record<string, Verdict>` to `Record<string, BadgeCell>`. This also means the function body's own local `const badges: Record<string, Verdict> = {}` (inside `buildScorecard`'s per-library loop) must be re-typed to `Record<string, BadgeCell>` — easy to miss since it's a local variable, not the exported interface, but `tsc` will catch it immediately if skipped:

```ts
export interface BadgeCell {
  verdict: Verdict
  neutroValue?: number
  competitorValue?: number
  unit?: 'renders' | 'ms' | 'bytes'
  higherIsBetter?: boolean
  neutroLibrary?: string // the same-framework neutro/form variant this cell was compared against
}
```

`buildScorecard` already computes `neutroResult`/`competitorResult`/`neutroLib` (via `findNeutroLibrary`) internally for every cell before calling `computeVerdict`/`computeBooleanVerdict` — it currently discards all of that after extracting the verdict. **`neutroLibrary` is included specifically so render-time code never needs to re-derive it** (see point 4 below — this is what replaces the earlier unresolved `findNeutroLibrary(/* ... */)` placeholder). Concretely, per existing call site:

- `BROWSER_NUMERIC_SURFACES`'s array (`re-renders/10`, `re-renders/100`, `array-ops` — all `renderCount`; `async-latency` — `p50Ms`) gets a `unit` field added to each entry: `'renders'` for the three `renderCount`-metric surfaces, `'ms'` for `async-latency`. The existing loop's `badges[key] = computeVerdict(...)` becomes `badges[key] = { verdict: computeVerdict(...), neutroValue: neutroResult?.[metric], competitorValue: competitorResult[metric], unit, higherIsBetter, neutroLibrary: neutroLib }` (`neutroLib` is the variable this loop already computes via `findNeutroLibrary` before calling `computeVerdict` — just stop discarding it).
- The `bundle-size` block (`badges['bundle-size'] = computeVerdict('bundle-size', library, neutroResult?.gzipBytes, competitorResult.gzipBytes, false, competitorResult.status)`) becomes `badges['bundle-size'] = { verdict: computeVerdict(...), neutroValue: neutroResult?.gzipBytes, competitorValue: competitorResult.gzipBytes, unit: 'bytes', higherIsBetter: false, neutroLibrary: 'neutro/form' }` (bundle-size has no per-framework variants — `neutroResult` is always looked up by the single literal `'neutro/form'` key already).
- The `async-cancellation` block (which already computes a `neutroLib` variable, same as the numeric loop) becomes `badges['async-cancellation'] = { verdict: computeBooleanVerdict(...), neutroLibrary: neutroLib }`.
- The `CORRECTNESS_SURFACES` loop is different: read directly, it has **no `neutroLib` variable at all** — it hardcodes `results.find(r => r.library === 'neutro/form')` (no framework variants for these Node-level correctness surfaces, same situation as bundle-size). So this loop becomes `badges[surface] = { verdict: computeBooleanVerdict(...), neutroLibrary: 'neutro/form' }` — the literal string, not a `neutroLib` variable reference (there isn't one to reference here; do not introduce one just to match the async-cancellation block's shape).
- All three of these boolean-verdict cases omit `neutroValue`/`competitorValue`/`unit` (`BadgeCell`'s fields are optional) since there's no meaningful numeric delta to show; their brief/detail text comes entirely from `ANNOTATIONS`/a fixed pass/fail phrase, not a computed percentage. `neutroLibrary` is still populated in all three so the annotation fallback lookup (point 3 below) works the same way as the numeric surfaces.

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

export function badgeText(surface: string, library: string, cell: BadgeCell): BadgeText {
  const annotation = ANNOTATIONS[surface]?.[library] ?? (cell.neutroLibrary ? ANNOTATIONS[surface]?.[cell.neutroLibrary] : undefined)

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

  // Boolean-verdict surfaces (correctness pass/fail, cancellation) with no numeric delta.
  // All three verdicts are possible here (tied/win/behind) - 'win' means neutro passes and the
  // competitor doesn't; 'behind' (no annotation) is the reverse, and must not share 'win's text.
  if (cell.verdict === 'tied') return { brief: 'both pass' }
  if (cell.verdict === 'win') return { brief: 'neutro passes, this library does not' }
  return { brief: 'this library passes, neutro does not' } // 'behind', no annotation
}
```

**4. Rendering: `generate-page.ts`'s `scorecardTable` wraps each badge in a `title` span and attaches a footnote when `detail` is present.**

```ts
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/\|/g, '&#124;')
}

function scorecardTable(columns: string[]): string {
  const rows = buildScorecard(baseline)
  const header = `| Library | ${columns.join(' | ')} |`
  const divider = `|---|${columns.map(() => '---').join('|')}|`
  const body = rows.map(r => {
    const cells = columns.map(c => {
      const cell = r.badges[c]
      if (!cell) return BADGE_LABEL['na']
      const { brief, detail } = badgeText(c, r.library, cell)
      const label = BADGE_LABEL[cell.verdict]
      const citation = detail ? addFootnote(c, r.library, detail) : ''
      return `<span title="${escapeAttr(brief)}">${label}</span>${citation}`
    })
    return `| ${r.library} | ${cells.join(' | ')} |`
  }).join('\n')
  return `${header}\n${divider}\n${body}`
}
```

`escapeAttr` handles both HTML-attribute safety (`&`, `"`, `<`) and markdown-table safety (`|`, which would otherwise split the row if it ever appeared in a `brief` string) — the earlier draft only escaped `"`, which was incomplete. No current `ANNOTATIONS`/computed brief text contains `|` or `<`, so this is defensive against future text, not a fix for an existing broken case.

`addFootnote`/the existing footnote-key-dedup logic in `generate-page.ts` is reused as-is (already keys by `${surface}-${library}`, already dedupes) — **including for cells `reasonMarker` also annotates** (see point 5 below): `scorecardTable` runs before the browser-table loop that calls `reasonMarker`, so for a surface/library pair that appears in both places, the scorecard's `detail`-sourced footnote is pushed first and `reasonMarker`'s later call for the same key is a no-op dedup hit — this only stays textually consistent once `reasonMarker` itself is updated to read `.detail` too (point 5), otherwise the two call sites would (harmlessly, since dedup means only the first write wins) just have one path's text silently take precedence — worth knowing, not a bug once point 5 is fixed.

The earlier draft called an unresolved `findNeutroLibrary(/* ... */)` placeholder here — that gap is now closed by `BadgeCell.neutroLibrary` (point 1 above) already carrying the answer `buildScorecard` computed at data-build time, so `scorecardTable` needs no additional lookup and `findNeutroLibrary` does NOT need to be exported from `scorecard.ts` after all — `badgeText` reads `cell.neutroLibrary` directly.

**5. Two existing `ANNOTATIONS`-as-string consumers in `generate-page.ts` must be updated for the `{brief, detail}` reshape, or they render `[object Object]`.**

Both currently treat `ANNOTATIONS[surface]?.[library]` as a plain string — after the reshape it's an object, so both need a `.detail` read:

```ts
// reasonMarker — currently:
function reasonMarker(surface: string, library: string): string {
  const reason = ANNOTATIONS[surface]?.[library]
  return reason ? addFootnote(surface, library, reason) : ''
}
// becomes:
function reasonMarker(surface: string, library: string): string {
  const reason = ANNOTATIONS[surface]?.[library]
  return reason ? addFootnote(surface, library, reason.detail) : ''
}
```

```ts
// correctnessTable's Why column — currently:
const why = r.status === 'pass'
  ? (PASS_REASONS[surface] ?? '')
  : (ANNOTATIONS[surface]?.[r.library] ?? '')
// becomes:
const why = r.status === 'pass'
  ? (PASS_REASONS[surface] ?? '')
  : (ANNOTATIONS[surface]?.[r.library]?.detail ?? '')
```

`reasonMarker` is called from `browserTable`'s latency and cancellation cells (`bench/scripts/generate-page.ts`, the `hasLatency`/`hasCancellation`/`hasRender` branches) — every one of those call sites is unaffected by this change since they only ever read `reasonMarker`'s return value, never the raw `ANNOTATIONS` entry directly.

**6. `bench/scripts/scorecard.test.ts` asserts directly against the old `Record<string, Verdict>` shape and must be updated, or `pnpm test` breaks.**

Confirmed via direct read: this file has assertions like `expect(rhfRow!.badges['array-state-integrity']).toBe('na')`, `.toBe('tied')`, and `expect(veeRow!.badges['array-ops']).toBe('win')`. Under the `BadgeCell` change, `badges['x']` is now an object, not a string, so every one of these `.toBe(string)` assertions needs to become `.toBe... ` against `.verdict`:

```ts
// before:
expect(rhfRow!.badges['array-state-integrity']).toBe('na')
expect(rhfRow!.badges['re-renders/10']).toBe('tied')
expect(rhfRow!.badges['bundle-size']).toBe('win')
// ...
expect(veeRow!.badges['array-ops']).toBe('win')

// after:
expect(rhfRow!.badges['array-state-integrity'].verdict).toBe('na')
expect(rhfRow!.badges['re-renders/10'].verdict).toBe('tied')
expect(rhfRow!.badges['bundle-size'].verdict).toBe('win')
// ...
expect(veeRow!.badges['array-ops'].verdict).toBe('win')
```

Every assertion in the file needs this same `.verdict` suffix added — read the current file in full during implementation and update each one; do not assume the four quoted above are exhaustive.

### Scale note

This adds roughly 30-45 new footnotes to the page (9 competitors × 5 performance surfaces + correctness + bundle-size cells that have a `detail`), landing in the single footnote list at the bottom via the existing mechanism — more volume through an already-working pipe, not a new one.

### Verification

Run `pnpm exec vitest run bench/scripts/scorecard.test.ts` (or the equivalent from within `bench/`) after updating the test file (point 6) — this must pass before anything else, since it's the fastest signal that the type change didn't silently break existing consumers. Then regenerate the page and directly inspect: every badge cell has a `title` attribute with non-empty text; every cell whose `brief` differs from a trivial restatement (i.e., every Win/Tied/Behind/Tradeoff/annotated-N/A cell) has a corresponding numbered footnote reference that resolves to real text in the footnotes list — specifically grep the generated page for the literal string `[object Object]` and confirm zero matches, which is exactly what the two unfixed `ANNOTATIONS`-string consumers (point 5) would have produced; hovering a badge in an actual browser (VitePress dev server) shows the native tooltip; clicking a citation number jumps to the correct footnote. Finally run the full monorepo sweep (`pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`) to catch anything else the type change touches.

### Out of scope

- A custom-styled tooltip component (native `title` attribute chosen over this — see design discussion).
- Retroactively adding `{brief, detail}` annotations for surfaces that don't have any `ANNOTATIONS` entry today and aren't Win/Tied/Behind (e.g. surfaces that are always N/A for every competitor with no documented reason) — those still fall back to the generic `"surface doesn't apply to this library"` brief with no citation, which is accurate as-is.
