import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import type { BenchResults, LibraryBenchResult, CorrectnessResult, BrowserResult } from '../types/schema.js'

const baseline = JSON.parse(readFileSync('results/baseline.json', 'utf8')) as BenchResults

// Honesty rule 1: every surface in core must appear in the output
const coreSurfaces = Object.keys(baseline.core ?? {})
const correctnessSurfaces = Object.keys(baseline.correctness ?? {})
const browserSurfaces = Object.keys(baseline.browser ?? {})

// Track shimmed results for footnotes
const footnotes: string[] = []
function addFootnote(library: string, shim: string): string {
  const idx = footnotes.findIndex(f => f.startsWith(`[^${library}`))
  if (idx >= 0) return `[^${library}-shim]`
  footnotes.push(`[^${library}-shim]: ${library} — ${shim}`)
  return `[^${library}-shim]`
}

// Honesty rule 2: if a library fails correctness, replace perf number with FAIL/ERROR
const correctnessFails = new Set<string>()
for (const results of Object.values(baseline.correctness ?? {})) {
  for (const r of results as CorrectnessResult[]) {
    if (r.status === 'fail' || r.status === 'error') correctnessFails.add(r.library)
  }
}

function fmtOps(r: LibraryBenchResult): string {
  if (r.status === 'error') return 'ERROR'
  if (r.status === 'na') return 'N/A'
  if (correctnessFails.has(r.library)) {
    const key = `${r.library}-correctness-fail`
    if (!footnotes.some(f => f.startsWith(`[^${key}]:`))) {
      footnotes.push(`[^${key}]: ${r.library} failed correctness tests; performance number withheld.`)
    }
    return `FAIL[^${key}]`
  }
  if (!r.opsPerSec) return '—'
  const base = r.opsPerSec >= 1_000_000
    ? `${(r.opsPerSec / 1_000_000).toFixed(2)}M`
    : r.opsPerSec >= 1_000
    ? `${(r.opsPerSec / 1_000).toFixed(1)}k`
    : r.opsPerSec.toFixed(0)
  const variance = r.highVariance ? ' ± high' : ''
  const shim = r.shim ? addFootnote(r.library, r.shim) + '*' : ''
  return `${base}${variance}${shim}`
}

function coreTable(surface: string, results: LibraryBenchResult[]): string {
  const sorted = [...results].sort((a, b) => (b.opsPerSec ?? 0) - (a.opsPerSec ?? 0))
  const neutroEntry = results.find(r => r.library === 'neutro/form')
  const neutroHz = neutroEntry?.opsPerSec
  const rows = sorted.map(r => {
    const ratio = (neutroHz && r.opsPerSec && r.library !== 'neutro/form')
      ? ` (${(r.opsPerSec / neutroHz).toFixed(2)}×)`
      : ''
    return `| ${r.library} | ${fmtOps(r)}${ratio} |`
  }).join('\n')
  return `### ${surface}\n\n| Library | ops/sec |\n|---|---|\n${rows}\n`
}

function correctnessTable(results: CorrectnessResult[]): string {
  const rows = results.map(r => {
    const badge = r.status === 'pass' ? '✅ PASS'
      : r.status === 'fail' ? '❌ FAIL'
      : r.status === 'error' ? '💥 ERROR'
      : '— N/A'
    return `| ${r.library} | ${badge} |`
  }).join('\n')
  return `| Library | Result |\n|---|---|\n${rows}`
}

function browserTable(results: BrowserResult[]): string {
  const rows = results.map(r => {
    const renders = r.renderCount != null ? String(r.renderCount) : '—'
    const p50 = r.p50Ms != null ? `${r.p50Ms}ms` : '—'
    const p99 = r.p99Ms != null ? `${r.p99Ms}ms` : '—'
    const race = r.concurrentRacePass != null ? (r.concurrentRacePass ? '✅' : '❌') : '—'
    return `| ${r.library} | ${renders} | ${p50} | ${p99} | ${race} |`
  }).join('\n')
  return `| Library | Renders/20 keystrokes | Async p50 | Async p99 | Race-safe |\n|---|---|---|---|---|\n${rows}`
}

const date = baseline.meta.generatedAt.slice(0, 10)
const version = baseline.meta.neutroVersion

const lines: string[] = [
  `# Benchmarks`,
  ``,
  `> Measured on: GitHub Actions ubuntu-latest, Node ${baseline.meta.nodeVersion}, Chromium (Playwright)`,
  `> Last updated: ${date} | neutro/form v${version}`,
  ``,
  `## Methodology`,
  ``,
  `Two dimensions: **performance** (ops/sec) and **correctness** (PASS/FAIL).`,
  `Three runners: vitest bench (pure JS, Node), vitest test (correctness), Playwright Chromium (production build, no StrictMode).`,
  ``,
  `- **N/A** = library has no equivalent surface`,
  `- **FAIL** = correctness test failed; perf number withheld`,
  `- **ERROR** = adapter threw at runtime`,
  `- **± high** = rme > 10%; result recorded but not used for regression comparisons`,
  `- **\`*\`** = shim used; see footnotes`,
  ``,
  `## Correctness`,
  ``,
]

for (const surface of correctnessSurfaces) {
  const results = baseline.correctness[surface] as CorrectnessResult[]
  lines.push(`### ${surface}`, ``, correctnessTable(results), ``)
}

lines.push(`## Core Performance (Node.js / Tinybench)`, ``)

// Honesty rule 1: every surface in core must appear in the output — no cherry-picking
for (const surface of coreSurfaces) {
  const results = baseline.core[surface] as LibraryBenchResult[]
  lines.push(coreTable(surface, results), ``)
}

if (browserSurfaces.length) {
  lines.push(`## Browser (Chromium / Playwright, production build, no StrictMode)`, ``)
  for (const surface of browserSurfaces) {
    const results = baseline.browser[surface] as BrowserResult[]
    const title = surface === 're-renders'
      ? 'Re-renders per 20-keystroke sequence'
      : surface === 'async-latency'
      ? 'Async Validation Latency'
      : surface
    lines.push(`### ${title}`, ``, browserTable(results), ``)
  }
}

if (footnotes.length) {
  lines.push(`---`, ``, ...footnotes.map(f => `${f}`), ``)
}

const out = lines.join('\n')
mkdirSync('../docs/benchmarks', { recursive: true })
writeFileSync('../docs/benchmarks/index.md', out)
console.log('[generate-page] wrote docs/benchmarks/index.md')
