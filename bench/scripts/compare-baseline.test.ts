import { describe, test, expect } from 'vitest'
import { median, collectMedianOpsPerSec, computeRegressions } from './compare-baseline.js'

describe('median', () => {
  test('odd-length array returns the middle value', () => {
    expect(median([3, 1, 2])).toBe(2)
  })

  test('even-length array returns the average of the two middle values', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })

  test('single-value array returns that value', () => {
    expect(median([42])).toBe(42)
  })
})

describe('collectMedianOpsPerSec', () => {
  function sample(surface: string, opsPerSec: number, extra: Partial<Record<string, unknown>> = {}) {
    return { [surface]: [{ library: 'neutro/form', status: 'ok' as const, opsPerSec, ...extra }] }
  }

  test('computes the median across 3 valid samples for one surface', () => {
    const samples = [sample('set-get/small', 100), sample('set-get/small', 110), sample('set-get/small', 90)]
    const { medians, skipped } = collectMedianOpsPerSec(samples)
    expect(medians['set-get/small']).toBe(100)
    expect(skipped).toEqual([])
  })

  test('skips a surface with fewer than 2 valid samples', () => {
    const samples = [
      sample('set-get/small', 100),
      { 'set-get/small': [{ library: 'neutro/form', status: 'ok' as const, opsPerSec: 90, highVariance: true, rme: 25 }] },
    ]
    const { medians, skipped } = collectMedianOpsPerSec(samples)
    expect(medians['set-get/small']).toBeUndefined()
    expect(skipped[0]).toContain('set-get/small')
  })

  test('excludes high-variance samples from the median but keeps valid ones', () => {
    const samples = [
      sample('set-get/small', 100),
      sample('set-get/small', 110),
      { 'set-get/small': [{ library: 'neutro/form', status: 'ok' as const, opsPerSec: 500, highVariance: true, rme: 30 }] },
    ]
    const { medians } = collectMedianOpsPerSec(samples)
    expect(medians['set-get/small']).toBe(105) // median of [100, 110], the 500-outlier excluded
  })

  test('merges surfaces that only appear in some samples', () => {
    const samples = [
      { 'nested-set': [{ library: 'neutro/form', status: 'ok' as const, opsPerSec: 50 }], 'set-get/small': [{ library: 'neutro/form', status: 'ok' as const, opsPerSec: 100 }] },
      { 'nested-set': [{ library: 'neutro/form', status: 'ok' as const, opsPerSec: 60 }], 'set-get/small': [{ library: 'neutro/form', status: 'ok' as const, opsPerSec: 110 }] },
    ]
    const { medians } = collectMedianOpsPerSec(samples)
    expect(medians['nested-set']).toBe(55)
    expect(medians['set-get/small']).toBe(105)
  })
})

describe('computeRegressions', () => {
  test('flags a surface whose head median is more than the threshold below base', () => {
    const regressions = computeRegressions(
      { 'set-get/small': 80 },
      { 'set-get/small': 100 },
      0.15,
    )
    expect(regressions).toHaveLength(1)
    expect(regressions[0]).toMatchObject({ surface: 'set-get/small', baselineHz: 100, currentHz: 80 })
  })

  test('does not flag a surface within the threshold', () => {
    const regressions = computeRegressions(
      { 'set-get/small': 92 },
      { 'set-get/small': 100 },
      0.15,
    )
    expect(regressions).toHaveLength(0)
  })

  test('skips a surface with no base entry', () => {
    const regressions = computeRegressions({ 'new-surface': 10 }, {}, 0.15)
    expect(regressions).toHaveLength(0)
  })

  test('skips a surface with no head entry, even if base has it', () => {
    const regressions = computeRegressions({}, { 'set-get/small': 100 }, 0.15)
    expect(regressions).toHaveLength(0)
  })
})
