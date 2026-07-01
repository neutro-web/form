import { computeVerdict, computeBooleanVerdict, type Verdict } from '../lib/verdict.js'
import type { BenchResults, BrowserResult, CorrectnessResult, BundleSizeResult } from '../types/schema.js'

export interface ScorecardRow {
  library: string
  badges: Record<string, Verdict>
}

const CORRECTNESS_SURFACES = ['array-state-integrity', 'async-race', 'dependency-trigger']
const BROWSER_NUMERIC_SURFACES: Array<{ key: string; metric: 'renderCount' | 'p50Ms'; higherIsBetter: boolean }> = [
  { key: 're-renders/10', metric: 'renderCount', higherIsBetter: false },
  { key: 're-renders/100', metric: 'renderCount', higherIsBetter: false },
  { key: 'array-ops', metric: 'renderCount', higherIsBetter: false },
  { key: 'async-latency', metric: 'p50Ms', higherIsBetter: false },
]

function findNeutroLibrary(results: Array<{ library: string }>): string | undefined {
  return results.find(r => r.library.startsWith('neutro/form'))?.library
}

export function buildScorecard(baseline: BenchResults): ScorecardRow[] {
  const libraries = new Set<string>()
  for (const results of Object.values(baseline.browser ?? {})) {
    for (const r of results) if (!r.library.startsWith('neutro/form')) libraries.add(r.library)
  }
  for (const results of Object.values(baseline.bundleSize ?? {})) {
    for (const r of results) if (r.library !== 'neutro/form') libraries.add(r.library)
  }

  const rows: ScorecardRow[] = []
  for (const library of libraries) {
    const badges: Record<string, Verdict> = {}

    for (const surface of CORRECTNESS_SURFACES) {
      const results = (baseline.correctness?.[surface] ?? []) as CorrectnessResult[]
      const neutroResult = results.find(r => r.library === 'neutro/form')
      const competitorResult = results.find(r => r.library === library)
      if (!competitorResult) continue
      const neutroPass = neutroResult ? neutroResult.status === 'pass' : undefined
      const competitorPass = competitorResult.status === 'pass' ? true
        : competitorResult.status === 'na' ? undefined
        : false
      const status = competitorResult.status === 'na' ? 'na' : 'ok'
      badges[surface] = computeBooleanVerdict(surface, library, neutroPass, competitorPass, status as any)
    }

    for (const { key, metric, higherIsBetter } of BROWSER_NUMERIC_SURFACES) {
      const results = (baseline.browser?.[key] ?? []) as BrowserResult[]
      if (!results.length) continue
      const neutroLib = findNeutroLibrary(results)
      const neutroResult = results.find(r => r.library === neutroLib)
      const competitorResult = results.find(r => r.library === library)
      if (!competitorResult) continue
      badges[key] = computeVerdict(key, library, neutroResult?.[metric], competitorResult[metric], higherIsBetter, competitorResult.status, neutroLib)
    }

    {
      const results = (baseline.browser?.['async-cancellation'] ?? []) as BrowserResult[]
      const neutroLib = findNeutroLibrary(results)
      const neutroResult = results.find(r => r.library === neutroLib)
      const competitorResult = results.find(r => r.library === library)
      if (competitorResult) {
        badges['async-cancellation'] = computeBooleanVerdict(
          'async-cancellation', library, neutroResult?.cancellationPass, competitorResult.cancellationPass, competitorResult.status,
        )
      }
    }

    {
      const results = (baseline.bundleSize?.['bundle-size'] ?? []) as BundleSizeResult[]
      const neutroResult = results.find(r => r.library === 'neutro/form')
      const competitorResult = results.find(r => r.library === library)
      if (competitorResult) {
        badges['bundle-size'] = computeVerdict(
          'bundle-size', library, neutroResult?.gzipBytes, competitorResult.gzipBytes, false, competitorResult.status,
        )
      }
    }

    rows.push({ library, badges })
  }

  return rows.sort((a, b) => a.library.localeCompare(b.library))
}
