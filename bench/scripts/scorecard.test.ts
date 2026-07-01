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
    expect(rhfRow!.badges['array-state-integrity']).toBe('na')
    expect(rhfRow!.badges['re-renders/10']).toBe('tied')
    expect(rhfRow!.badges['bundle-size']).toBe('win') // neutro 3000 vs competitor 9000 -> competitor much worse (higher gzip = worse)
  })
})
