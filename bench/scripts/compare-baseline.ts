import { readFileSync } from 'node:fs'
import type { BenchResults, LibraryBenchResult } from '../types/schema.js'

export const REGRESSION_THRESHOLD = 0.25  // 25%
export const HIGH_VARIANCE_RME    = 10    // skip entries with rme > 10%
export const MIN_VALID_SAMPLES    = 2     // need at least 2 of N samples to compute a median

export interface Regression {
  surface: string
  baselineHz: number
  currentHz:  number
  pct:        number
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export interface MedianResult {
  medians: Record<string, number>
  skipped: string[]
}

export function collectMedianOpsPerSec(samples: Array<Record<string, LibraryBenchResult[]>>): MedianResult {
  const surfaces = new Set<string>()
  for (const sample of samples) for (const key of Object.keys(sample)) surfaces.add(key)

  const medians: Record<string, number> = {}
  const skipped: string[] = []

  for (const surface of surfaces) {
    const values: number[] = []
    let sawHighVariance = false
    for (const sample of samples) {
      const entry = sample[surface]?.find(r => r.library === 'neutro/form')
      if (!entry || entry.status !== 'ok' || entry.opsPerSec == null) continue
      if (entry.highVariance || (entry.rme ?? 0) > HIGH_VARIANCE_RME) {
        sawHighVariance = true
        continue
      }
      values.push(entry.opsPerSec)
    }
    if (values.length < MIN_VALID_SAMPLES) {
      skipped.push(`${surface} (${values.length}/${samples.length} valid samples${sawHighVariance ? ', high variance' : ''})`)
      continue
    }
    medians[surface] = median(values)
  }

  return { medians, skipped }
}

export function computeRegressions(
  currentMedians: Record<string, number>,
  baselineCore: Record<string, LibraryBenchResult[]>,
  threshold: number,
): Regression[] {
  const regressions: Regression[] = []
  for (const [surface, currentHz] of Object.entries(currentMedians)) {
    const baselineSurface = baselineCore[surface]
    if (!baselineSurface) continue
    const baseline = baselineSurface.find(r => r.library === 'neutro/form')
    if (!baseline?.opsPerSec) continue
    const pct = (baseline.opsPerSec - currentHz) / baseline.opsPerSec
    if (pct > threshold) {
      regressions.push({ surface, baselineHz: baseline.opsPerSec, currentHz, pct })
    }
  }
  return regressions
}

function readJson(path: string): unknown {
  try { return JSON.parse(readFileSync(path, 'utf8')) }
  catch (e) { console.error(`[compare] cannot read ${path}:`, e); process.exit(1) }
}

async function main() {
  const inputFiles = (process.env.BENCH_INPUT_FILES ?? process.env.BENCH_INPUT_FILE ?? 'results/core.json')
    .split(',').map(s => s.trim()).filter(Boolean)
  const samples = inputFiles.map(f => readJson(f) as Record<string, LibraryBenchResult[]>)
  const baselineRaw = readJson('results/baseline.json') as BenchResults

  const { medians, skipped } = collectMedianOpsPerSec(samples)
  const regressions = computeRegressions(medians, baselineRaw.core ?? {}, REGRESSION_THRESHOLD)

  if (skipped.length) console.log(`[compare] skipped (insufficient valid samples): ${skipped.join(', ')}`)
  if (!regressions.length) {
    console.log(`[compare] no regressions found (median of ${inputFiles.length} sample(s))`)
    process.exit(0)
  }

  console.log(`[compare] ${regressions.length} regression(s) found (median of ${inputFiles.length} sample(s)):`)
  for (const r of regressions) {
    console.log(`  ${r.surface}: ${r.baselineHz.toFixed(0)} → ${r.currentHz.toFixed(0)} ops/s (-${(r.pct * 100).toFixed(1)}%)`)
  }

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
      `> Threshold: ${(REGRESSION_THRESHOLD * 100).toFixed(0)}%. Median of ${inputFiles.length} samples per surface; entries with rme > 10% or fewer than ${MIN_VALID_SAMPLES} valid samples are skipped.`,
      '',
      '| Surface | Baseline (ops/s) | Current (ops/s, median) | Delta |',
      '|---|---|---|---|',
      rows,
      '',
      skipped.length ? `**Skipped (insufficient valid samples):** ${skipped.join(', ')}` : '',
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
  process.exit(0)
}

main()
