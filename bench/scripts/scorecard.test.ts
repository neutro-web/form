import { describe, test, expect } from 'vitest'
import { buildScorecard } from './scorecard.js'
import type { BenchResults } from '../types/schema.js'

describe('buildScorecard', () => {
  test('produces one row per non-neutro library, one column per surface', () => {
    const baseline: BenchResults = {
      meta: { generatedAt: '2026-06-30T00:00:00.000Z', neutroVersion: '0.4.0', nodeVersion: 'v22.0.0', platform: 'linux', runner: 'github-actions' },
      core: {},
      correctness: {
        'array-state-integrity': [
          { library: 'neutro/form', status: 'pass' },
          { library: 'react-hook-form', status: 'na' },
        ],
      },
      browser: {
        're-renders/10': [
          { library: 'neutro/form (React)', status: 'ok', renderCount: 20 },
          { library: 'react-hook-form', status: 'ok', renderCount: 20 },
        ],
      },
      bundleSize: {
        'bundle-size': [
          { library: 'neutro/form', status: 'ok', gzipBytes: 3000 },
          { library: 'react-hook-form', status: 'ok', gzipBytes: 9000 },
        ],
      },
    }
    const rows = buildScorecard(baseline)
    const rhfRow = rows.find(r => r.library === 'react-hook-form')
    expect(rhfRow).toBeDefined()
    expect(rhfRow!.badges['array-state-integrity'].verdict).toBe('na')
    expect(rhfRow!.badges['re-renders/10'].verdict).toBe('tied')
    expect(rhfRow!.badges['bundle-size'].verdict).toBe('win') // neutro 3000 vs competitor 9000 -> competitor much worse (higher gzip = worse)
  })

  test('compares a framework-specific competitor against its own-framework neutro variant, not whichever neutro entry is listed first', () => {
    // Regression guard for the framework-mismatch bug: findNeutroLibrary used to just take
    // the FIRST neutro/form-prefixed entry in the results array, with no regard for which
    // framework the competitor being compared actually ran in. vee-validate is Vue-only, so
    // it must be scored against neutro/form (Vue), never neutro/form (React) - even when the
    // React entry is listed first in the results array (as it is here, deliberately, to catch
    // a regression to first-match behavior).
    const baseline: BenchResults = {
      meta: { generatedAt: '2026-06-30T00:00:00.000Z', neutroVersion: '0.5.0', nodeVersion: 'v22.0.0', platform: 'linux', runner: 'github-actions' },
      core: {},
      correctness: {},
      browser: {
        'array-ops': [
          { library: 'neutro/form (React)', status: 'ok', renderCount: 18 }, // listed first, wrong framework for vee-validate
          { library: 'neutro/form (Vue)', status: 'ok', renderCount: 9 },
          { library: 'vee-validate', status: 'ok', renderCount: 18 },
        ],
      },
      bundleSize: {},
    }
    const rows = buildScorecard(baseline)
    const veeRow = rows.find(r => r.library === 'vee-validate')
    expect(veeRow).toBeDefined()
    // Correct: vee-validate (18) vs neutro/form (Vue) (9) -> competitor markedly worse -> win.
    // The bug's behavior would have compared vee-validate (18) vs neutro/form (React) (18) -> tied.
    expect(veeRow!.badges['array-ops'].verdict).toBe('win')
  })

  test('populates neutroLibrary on numeric badge cells for the framework the competitor was compared against', () => {
    const baseline: BenchResults = {
      meta: { generatedAt: '2026-06-30T00:00:00.000Z', neutroVersion: '0.5.0', nodeVersion: 'v22.0.0', platform: 'linux', runner: 'github-actions' },
      core: {},
      correctness: {},
      browser: {
        'array-ops': [
          { library: 'neutro/form (Vue)', status: 'ok', renderCount: 9 },
          { library: 'vee-validate', status: 'ok', renderCount: 18 },
        ],
      },
      bundleSize: {},
    }
    const rows = buildScorecard(baseline)
    const veeRow = rows.find(r => r.library === 'vee-validate')
    expect(veeRow!.badges['array-ops'].neutroLibrary).toBe('neutro/form (Vue)')
    expect(veeRow!.badges['array-ops'].neutroValue).toBe(9)
    expect(veeRow!.badges['array-ops'].competitorValue).toBe(18)
  })
})
