import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import type { BenchResults, CorrectnessResult, BrowserResult, BundleSizeResult } from '../types/schema.js'
import { ANNOTATIONS, PASS_REASONS, COMPETITOR_VERSIONS } from '../annotations.js'
import { buildScorecard } from './scorecard.js'
import { badgeText } from './badge-text.js'
import type { Verdict } from '../lib/verdict.js'

const baseline = JSON.parse(readFileSync('results/baseline.json', 'utf8')) as BenchResults

const correctnessSurfaces = Object.keys(baseline.correctness ?? {})
const browserSurfaces = Object.keys(baseline.browser ?? {})

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

const BADGE_LABEL: Record<Verdict, string> = {
  win: '✅ Win',
  tied: '➖ Tied',
  behind: '❌ Behind',
  tradeoff: '⚖️ Tradeoff',
  na: '— N/A',
  error: '💥 Error',
}

const footnotes: string[] = []
function addFootnote(surface: string, library: string, reason: string): string {
  // markdown-it-footnote's [^id] reference syntax does not tolerate whitespace or punctuation
  // like parentheses/slashes in the identifier - library names such as "tanstack-form (React)"
  // and surface keys like "re-renders/10" break it, leaving the raw [^...] text unrendered on
  // the page. Sanitize to a clean slug; the human-readable text still lives in the footnote body.
  const key = `${surface}-${library}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const idx = footnotes.findIndex(f => f.startsWith(`[^${key}]:`))
  if (idx >= 0) return `[^${key}]`
  footnotes.push(`[^${key}]: ${library} — ${reason}`)
  return `[^${key}]`
}

function reasonMarker(surface: string, library: string): string {
  const reason = ANNOTATIONS[surface]?.[library]
  return reason ? addFootnote(surface, library, reason.detail) : ''
}

function correctnessTable(surface: string, results: CorrectnessResult[]): string {
  const rows = results.map(r => {
    const badge = r.status === 'pass' ? '✅ PASS'
      : r.status === 'fail' ? '❌ FAIL'
      : r.status === 'error' ? '💥 ERROR'
      : '— N/A'
    const why = r.status === 'pass'
      ? (PASS_REASONS[surface] ?? '')
      : (ANNOTATIONS[surface]?.[r.library]?.detail ?? '')
    return `| ${r.library} | ${badge} | ${why} |`
  }).join('\n')
  return `| Library | Result | Why |\n|---|---|---|\n${rows}`
}

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
    if (hasRender) cells.push(r.renderCount != null ? `${r.renderCount}${reasonMarker(surface, r.library)}` : '—')
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

function bundleSizeTable(results: BundleSizeResult[]): string {
  const rows = results.map(r => {
    const size = r.gzipBytes != null ? `${(r.gzipBytes / 1024).toFixed(1)} KB` : '—'
    return `| ${r.library} | ${r.status === 'error' ? 'ERROR' : size} |`
  }).join('\n')
  return `| Library | Gzip size |\n|---|---|\n${rows}`
}

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
      const infoIcon = ` <abbr title="${escapeAttr(brief)}" style="cursor: help;">ⓘ</abbr>`
      return `${label}${infoIcon}${citation}`
    })
    return `| ${r.library} | ${cells.join(' | ')} |`
  }).join('\n')
  return `${header}\n${divider}\n${body}`
}

const date = baseline.meta.generatedAt.slice(0, 10)
const version = baseline.meta.neutroVersion

const competitorVersionRows = ['react-hook-form', 'formik', 'vee-validate', 'felte', 'tanstack-form (React)', 'tanstack-form (Svelte)']
  .map(lib => `| ${lib} | v${COMPETITOR_VERSIONS[lib]} |`)
  .join('\n')

const lines: string[] = [
  `# Benchmarks`,
  ``,
  `*Last updated ${date} — neutro/form v${version}*`,
  ``,
  `## Environment`,
  ``,
  `| | |`,
  `|---|---|`,
  `| Runner | ${baseline.meta.runner === 'github-actions' ? 'GitHub Actions ubuntu-latest' : `local (${baseline.meta.platform})`} |`,
  `| Node | ${baseline.meta.nodeVersion} |`,
  `| Browser | Chromium (Playwright) |`,
  ``,
  `## Competitor Versions`,
  ``,
  `| Library | Version |`,
  `|---|---|`,
  competitorVersionRows,
  ``,
  `Results reflect these exact releases — a later competitor update may change outcomes, so check the version above before drawing conclusions.`,
  ``,
  `## Methodology`,
  ``,
  `Three dimensions: **correctness** (PASS/FAIL), **browser performance** (Playwright Chromium), and **bundle size** (esbuild + gzip). Badges are always relative to neutro/form:`,
  ``,
  `- ✅ **Win** — neutro beats this library by more than 10%`,
  `- ➖ **Tied** — within 10% either way`,
  `- ❌ **Behind** — neutro trails by more than 10%, no documented reason`,
  `- ⚖️ **Tradeoff** — neutro trails for a documented design reason, *or* neutro passes a check this library architecturally can't (a harsh "neutro wins" is softened to Tradeoff instead) — see footnotes`,
  `- — **N/A** — surface doesn't apply to this library`,
  ``,
  `## Scorecard`,
  ``,
  `### Correctness`,
  ``,
  scorecardTable(['array-state-integrity', 'async-race', 'dependency-trigger']),
  ``,
  `### Performance`,
  ``,
  scorecardTable(['re-renders/10', 're-renders/100', 'async-latency', 'array-ops', 'async-cancellation']),
  ``,
  `### Size`,
  ``,
  scorecardTable(['bundle-size']),
  ``,
  `## Correctness`,
  ``,
]

for (const surface of correctnessSurfaces) {
  const results = baseline.correctness[surface] as CorrectnessResult[]
  lines.push(`### ${surface}`, ``, correctnessTable(surface, results), ``)
}

if (browserSurfaces.length) {
  lines.push(`## Browser (Chromium / Playwright, production build, no StrictMode)`, ``)
  for (const surface of browserSurfaces) {
    const results = baseline.browser[surface] as BrowserResult[]
    const title = SURFACE_TITLES[surface] ?? surface
    lines.push(`### ${title}`, ``)
    if (surface === 'array-ops') {
      lines.push(
        `_Note: render counts are not directly comparable across all libraries on this surface — some libraries (e.g. TanStack Form) isolate counters per array index, while others (e.g. neutro/form, Felte) increment counters for every item in the array on any mutation. A low count does not necessarily indicate less DOM work._`,
        ``,
      )
    }
    lines.push(browserTable(surface, results), ``)
  }
}

const bundleResults = baseline.bundleSize?.['bundle-size'] as BundleSizeResult[] | undefined
if (bundleResults?.length) {
  lines.push(`## Bundle Size`, ``, bundleSizeTable(bundleResults), ``)
}

lines.push(
  `## Architecture Notes`,
  ``,
  `**DOM cleanup** (\`dom-cleanup\` row above, neutro only): neutro/form's \`connect\`/\`disconnect\` lifecycle registers a \`WeakRef\` per connected field in an internal registry, pruned by a \`MutationObserver\` watching for node removal. The "Connected after cleanup" number confirms this registry returns to 0 after mount/unmount churn — competitor libraries have no equivalent connect/disconnect API to compare against, so this section has no comparison table.`,
  ``,
)

if (footnotes.length) {
  lines.push(`---`, ``, ...footnotes, ``)
}

const out = lines.join('\n')
mkdirSync('../docs/benchmarks', { recursive: true })
writeFileSync('../docs/benchmarks/index.md', out)
console.log('[generate-page] wrote docs/benchmarks/index.md')
