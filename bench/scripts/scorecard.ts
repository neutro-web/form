import { computeVerdict, computeBooleanVerdict, type Verdict } from '../lib/verdict.js'
import type { BenchResults, BrowserResult, CorrectnessResult, BundleSizeResult } from '../types/schema.js'

export interface BadgeCell {
  verdict: Verdict
  neutroValue?: number
  competitorValue?: number
  unit?: 'renders' | 'ms' | 'bytes'
  higherIsBetter?: boolean
  neutroLibrary?: string
}

export interface ScorecardRow {
  library: string
  badges: Record<string, BadgeCell>
}

const CORRECTNESS_SURFACES = ['array-state-integrity', 'async-race', 'dependency-trigger']
const BROWSER_NUMERIC_SURFACES: Array<{ key: string; metric: 'renderCount' | 'p50Ms'; higherIsBetter: boolean; unit: 'renders' | 'ms' }> = [
  { key: 're-renders/10', metric: 'renderCount', higherIsBetter: false, unit: 'renders' },
  { key: 're-renders/100', metric: 'renderCount', higherIsBetter: false, unit: 'renders' },
  { key: 'array-ops', metric: 'renderCount', higherIsBetter: false, unit: 'renders' },
  { key: 'async-latency', metric: 'p50Ms', higherIsBetter: false, unit: 'ms' },
]

// Bench apps are grouped by framework (React/Vue/Svelte each run behind their own dev server port,
// with several libraries mounted side by side in the same app). A numeric comparison must pair a
// competitor with the neutro/form variant that ran in the SAME app, not just whichever neutro entry
// happens to appear first in the results array — otherwise e.g. vee-validate (Vue) gets compared
// against neutro/form (React)'s numbers, which is an apples-to-oranges mismatch.
const FRAMEWORK_BY_LIBRARY: Record<string, string> = {
  'react-hook-form': 'React',
  formik: 'React',
  'tanstack-form (React)': 'React',
  'vee-validate': 'Vue',
  'tanstack-form (Svelte)': 'Svelte',
  felte: 'Svelte',
}

function findNeutroLibrary(results: Array<{ library: string }>, competitorLibrary?: string): string | undefined {
  const framework = competitorLibrary ? FRAMEWORK_BY_LIBRARY[competitorLibrary] : undefined
  if (framework) {
    const sameFrameworkMatch = results.find(r => r.library === `neutro/form (${framework})`)
    if (sameFrameworkMatch) return sameFrameworkMatch.library
  }
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
    const badges: Record<string, BadgeCell> = {}

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
      badges[surface] = {
        verdict: computeBooleanVerdict(surface, library, neutroPass, competitorPass, status as any),
        neutroLibrary: 'neutro/form',
      }
    }

    for (const { key, metric, higherIsBetter, unit } of BROWSER_NUMERIC_SURFACES) {
      const results = (baseline.browser?.[key] ?? []) as BrowserResult[]
      if (!results.length) continue
      const neutroLib = findNeutroLibrary(results, library)
      const neutroResult = results.find(r => r.library === neutroLib)
      const competitorResult = results.find(r => r.library === library)
      if (!competitorResult) continue
      badges[key] = {
        verdict: computeVerdict(key, library, neutroResult?.[metric], competitorResult[metric], higherIsBetter, competitorResult.status, neutroLib),
        neutroValue: neutroResult?.[metric],
        competitorValue: competitorResult[metric],
        unit,
        higherIsBetter,
        neutroLibrary: neutroLib,
      }
    }

    {
      const results = (baseline.browser?.['async-cancellation'] ?? []) as BrowserResult[]
      const neutroLib = findNeutroLibrary(results, library)
      const neutroResult = results.find(r => r.library === neutroLib)
      const competitorResult = results.find(r => r.library === library)
      if (competitorResult) {
        badges['async-cancellation'] = {
          verdict: computeBooleanVerdict(
            'async-cancellation', library, neutroResult?.cancellationPass, competitorResult.cancellationPass, competitorResult.status,
          ),
          neutroLibrary: neutroLib,
        }
      }
    }

    {
      const results = (baseline.bundleSize?.['bundle-size'] ?? []) as BundleSizeResult[]
      const neutroResult = results.find(r => r.library === 'neutro/form')
      const competitorResult = results.find(r => r.library === library)
      if (competitorResult) {
        badges['bundle-size'] = {
          verdict: computeVerdict(
            'bundle-size', library, neutroResult?.gzipBytes, competitorResult.gzipBytes, false, competitorResult.status,
          ),
          neutroValue: neutroResult?.gzipBytes,
          competitorValue: competitorResult.gzipBytes,
          unit: 'bytes',
          higherIsBetter: false,
          neutroLibrary: 'neutro/form',
        }
      }
    }

    rows.push({ library, badges })
  }

  return rows.sort((a, b) => a.library.localeCompare(b.library))
}
