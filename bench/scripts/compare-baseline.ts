import { readFileSync } from 'node:fs'
import type { BenchResults, LibraryBenchResult } from '../types/schema.js'

const REGRESSION_THRESHOLD = 0.15  // 15%
const HIGH_VARIANCE_RME    = 10    // skip entries with rme > 10%

interface Regression {
  surface: string
  baselineHz: number
  currentHz:  number
  pct:        number
}

function readJson(path: string): unknown {
  try { return JSON.parse(readFileSync(path, 'utf8')) }
  catch (e) { console.error(`[compare] cannot read ${path}:`, e); process.exit(1) }
}

async function main() {
  const inputPath   = process.env.BENCH_INPUT_FILE ?? 'results/core.json'
  const inputRaw    = readJson(inputPath) as Record<string, LibraryBenchResult[]>
  const baselineRaw = readJson('results/baseline.json') as BenchResults

  const regressions: Regression[] = []
  const skipped: string[] = []

  for (const [surface, results] of Object.entries(inputRaw)) {
    const current = results.find(r => r.library === 'neutro/form')
    if (!current || current.status !== 'ok' || !current.opsPerSec) continue

    if (current.highVariance || (current.rme ?? 0) > HIGH_VARIANCE_RME) {
      skipped.push(`${surface} (rme=${current.rme?.toFixed(1)}%)`)
      continue
    }

    const baselineSurface = baselineRaw.core?.[surface]
    if (!baselineSurface) {
      console.log(`[compare] ${surface}: no baseline entry — skipped`)
      continue
    }

    const baseline = baselineSurface.find(r => r.library === 'neutro/form')
    if (!baseline?.opsPerSec) continue

    const pct = (baseline.opsPerSec - current.opsPerSec) / baseline.opsPerSec
    if (pct > REGRESSION_THRESHOLD) {
      regressions.push({ surface, baselineHz: baseline.opsPerSec, currentHz: current.opsPerSec, pct })
    }
  }

  // Print summary
  if (skipped.length) console.log(`[compare] skipped (high variance): ${skipped.join(', ')}`)
  if (!regressions.length) {
    console.log('[compare] no regressions found')
    process.exit(0)
  }

  console.log(`[compare] ${regressions.length} regression(s) found:`)
  for (const r of regressions) {
    console.log(`  ${r.surface}: ${r.baselineHz.toFixed(0)} → ${r.currentHz.toFixed(0)} ops/s (-${(r.pct * 100).toFixed(1)}%)`)
  }

  // Post PR comment if tokens available
  const token = process.env.GH_TOKEN
  const prNumber = process.env.PR_NUMBER
  const repo = process.env.GITHUB_REPOSITORY

  if (token && prNumber && repo) {
    const rows = regressions.map(r =>
      `| ${r.surface} | ${Math.round(r.baselineHz).toLocaleString()} | ${Math.round(r.currentHz).toLocaleString()} | **-${(r.pct * 100).toFixed(1)}%** |`
    ).join('\n')

    const body = [
      '## Benchmark Regression Detected',
      '',
      '> Threshold: 15%. Entries with rme > 10% are skipped.',
      '',
      '| Surface | Baseline (ops/s) | Current (ops/s) | Delta |',
      '|---|---|---|---|',
      rows,
      '',
      skipped.length ? `**Skipped (high variance):** ${skipped.join(', ')}` : '',
    ].filter(Boolean).join('\n')

    await fetch(`https://api.github.com/repos/${repo}/issues/${prNumber}/comments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    }).catch(e => console.warn('[compare] PR comment failed:', e))
  }

  if (process.env.BENCH_HARD_FAIL === 'true') {
    console.error('[compare] exiting 1 (BENCH_HARD_FAIL=true)')
    process.exit(1)
  }
  // Phase C: soft warn — exit 0
  process.exit(0)
}

main()
