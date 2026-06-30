import { readFileSync } from 'node:fs'
import type { BenchResults, LibraryBenchResult } from '../types/schema.js'

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
  baselineHz: number
  latestHz:   number
  pct:        number
}

const drifts: DriftEntry[] = []

for (const [surface, latestResults] of Object.entries(latest.core ?? {})) {
  const baselineSurface = baseline.core?.[surface]
  if (!baselineSurface) continue

  for (const lr of latestResults as LibraryBenchResult[]) {
    if (lr.library === 'neutro/form') continue // neutro drift is caught by PR regression gate
    if (lr.status !== 'ok' || !lr.opsPerSec) continue
    if (lr.highVariance) continue

    const br = (baselineSurface as LibraryBenchResult[]).find(r => r.library === lr.library)
    if (!br?.opsPerSec) continue

    const pct = Math.abs(lr.opsPerSec - br.opsPerSec) / br.opsPerSec
    if (pct > DRIFT_THRESHOLD) {
      drifts.push({ library: lr.library, surface, baselineHz: br.opsPerSec, latestHz: lr.opsPerSec, pct })
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
  const dir = d.latestHz > d.baselineHz ? '⬆️' : '⬇️'
  return `| ${d.library} | ${d.surface} | ${Math.round(d.baselineHz).toLocaleString()} | ${Math.round(d.latestHz).toLocaleString()} | ${dir} ${(d.pct * 100).toFixed(1)}% |`
}).join('\n')

const body = [
  '## Competitor Benchmark Drift Detected',
  '',
  `Weekly run detected changes >20% in competitor results vs. committed baseline.`,
  `This may indicate a competitor released a new version with perf changes.`,
  '',
  '| Library | Surface | Baseline (ops/s) | Weekly (ops/s) | Change |',
  '|---|---|---|---|---|',
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
