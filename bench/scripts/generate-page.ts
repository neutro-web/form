import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import type { BenchResults, CorrectnessResult, BrowserResult } from '../types/schema.js'

const baseline = JSON.parse(readFileSync('results/baseline.json', 'utf8')) as BenchResults

const correctnessSurfaces = Object.keys(baseline.correctness ?? {})
const browserSurfaces = Object.keys(baseline.browser ?? {})

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
  `Two dimensions: **correctness** (PASS/FAIL) and **browser performance** (Playwright Chromium).`,
  `Two runners: vitest test (correctness), Playwright Chromium (production build, no StrictMode).`,
  ``,
  `- **N/A** = library has no equivalent surface`,
  `- **FAIL** = correctness test failed`,
  `- **ERROR** = adapter threw at runtime`,
  `- **Race-safe** = async epoch mechanism verified (neutro/form only)`,
  ``,
  `## Correctness`,
  ``,
]

for (const surface of correctnessSurfaces) {
  const results = baseline.correctness[surface] as CorrectnessResult[]
  lines.push(`### ${surface}`, ``, correctnessTable(results), ``)
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

const out = lines.join('\n')
mkdirSync('../docs/benchmarks', { recursive: true })
writeFileSync('../docs/benchmarks/index.md', out)
console.log('[generate-page] wrote docs/benchmarks/index.md')
