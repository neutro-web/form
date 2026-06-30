import { readFileSync } from 'node:fs'
import type { BenchResults, BrowserResult } from '../types/schema.js'

const DRIFT_THRESHOLD = 0.20 // 20%

function readJson(path: string): unknown {
  try { return JSON.parse(readFileSync(path, 'utf8')) }
  catch (e) { console.error(`[post-drift] cannot read ${path}:`, e); process.exit(1) }
}

const latest   = readJson('results/latest.json') as BenchResults
const baseline = readJson('results/baseline.json') as BenchResults
const token    = process.env.GH_TOKEN
const repo     = process.env.GITHUB_REPOSITORY

interface DriftEntry {
  library: string
  surface: string
  metric:  'renderCount' | 'p50Ms'
  baselineVal: number
  latestVal:   number
  pct:         number
}

const drifts: DriftEntry[] = []

for (const [surface, latestResults] of Object.entries(latest.browser ?? {})) {
  const baselineSurface = baseline.browser?.[surface]
  if (!baselineSurface) continue

  for (const lr of latestResults as BrowserResult[]) {
    if (lr.library === 'neutro/form' || lr.library.startsWith('neutro/form')) continue
    if (lr.status !== 'ok') continue

    const br = (baselineSurface as BrowserResult[]).find(r => r.library === lr.library)
    if (!br || br.status !== 'ok') continue

    for (const metric of ['renderCount', 'p50Ms'] as const) {
      const lv = lr[metric]
      const bv = br[metric]
      if (lv == null || bv == null || bv === 0) continue
      // Positive pct = got worse (more renders / slower). Negative = got better; not an alert.
      const pct = (lv - bv) / bv
      if (pct > DRIFT_THRESHOLD) {
        drifts.push({ library: lr.library, surface, metric, baselineVal: bv, latestVal: lv, pct })
      }
    }
  }
}

if (!drifts.length) {
  console.log('[post-drift] no competitor drift detected')
  process.exit(0)
}

console.log(`[post-drift] ${drifts.length} drift(s) detected`)

if (!token || !repo) {
  console.warn('[post-drift] GH_TOKEN or GITHUB_REPOSITORY not set; skipping issue post')
  process.exit(0)
}

const rows = drifts.map(d => {
  const unit = d.metric === 'renderCount' ? 'renders' : 'ms'
  return `| ${d.library} | ${d.surface} | ${d.metric} | ${d.baselineVal.toFixed(1)} ${unit} | ${d.latestVal.toFixed(1)} ${unit} | ⬆️ ${(d.pct * 100).toFixed(1)}% |`
}).join('\n')

const body = [
  '## Competitor Benchmark Drift Detected',
  '',
  `Weekly run detected competitor browser metrics >20% worse vs. committed baseline.`,
  `This may indicate a competitor released a new version with regressions.`,
  '',
  '| Library | Surface | Metric | Baseline | Weekly | Change |',
  '|---|---|---|---|---|---|',
  rows,
  '',
  `Baseline: ${baseline.meta.neutroVersion} (${baseline.meta.generatedAt.slice(0, 10)})`,
  `Weekly: ${latest.meta.generatedAt.slice(0, 10)}`,
].join('\n')

// Create or update issue with label benchmark-drift
const searchRes = await fetch(
  `https://api.github.com/repos/${repo}/issues?labels=benchmark-drift&state=open`,
  { headers: { Authorization: `Bearer ${token}` } }
)
if (!searchRes.ok) {
  console.error(`[post-drift] GitHub API error ${searchRes.status}: ${await searchRes.text()}`)
  process.exit(1)
}
const openIssues = await searchRes.json() as any[]

if (openIssues.length > 0) {
  await fetch(`https://api.github.com/repos/${repo}/issues/${openIssues[0].number}/comments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  console.log(`[post-drift] updated issue #${openIssues[0].number}`)
} else {
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Competitor benchmark drift detected', body, labels: ['benchmark-drift'] }),
  })
  const issue = await res.json() as any
  console.log(`[post-drift] opened issue #${issue.number}`)
}
