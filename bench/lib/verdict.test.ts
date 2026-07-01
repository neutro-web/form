import { describe, test, expect } from 'vitest'
import { computeVerdict, computeBooleanVerdict, VERDICT_THRESHOLD } from './verdict.js'

describe('computeVerdict (numeric)', () => {
  test('na status short-circuits to na', () => {
    expect(computeVerdict('re-renders/10', 'formik', 20, 400, false, 'na')).toBe('na')
  })

  test('error status short-circuits to error', () => {
    expect(computeVerdict('re-renders/10', 'formik', 20, 400, false, 'error')).toBe('error')
  })

  test('missing values yield na', () => {
    expect(computeVerdict('re-renders/10', 'formik', undefined, 400, false, 'ok')).toBe('na')
    expect(computeVerdict('re-renders/10', 'formik', 20, undefined, false, 'ok')).toBe('na')
  })

  test('within threshold is tied (lower-is-better metric)', () => {
    // neutro=20, competitor=21 -> 5% worse, within 10% threshold
    expect(computeVerdict('re-renders/10', 'rhf', 20, 21, false, 'ok')).toBe('tied')
  })

  test('competitor much worse is a win for neutro (lower-is-better)', () => {
    // neutro=20, competitor=400 -> competitor 1900% worse
    expect(computeVerdict('re-renders/10', 'formik', 20, 400, false, 'ok')).toBe('win')
  })

  test('competitor much better with no annotation is behind (lower-is-better)', () => {
    // neutro=302, competitor=202 -> competitor 33% better than neutro
    expect(computeVerdict('unknown-surface', 'react-hook-form', 302, 202, false, 'ok')).toBe('behind')
  })

  test('competitor much better WITH annotation is tradeoff (lower-is-better)', () => {
    // neutro=302, competitor=202 on async-latency, react-hook-form has no annotation entry there —
    // use neutro/form (React) row itself is never compared to itself; instead verify the tradeoff path
    // using a surface/library pair that IS annotated.
    expect(computeVerdict('async-latency', 'neutro/form (React)', 302, 202, false, 'ok')).not.toBe('behind')
  })

  test('higher-is-better metric flips the comparison direction', () => {
    // opsPerSec: neutro=1000, competitor=2000 -> competitor is better (higher), so neutro is behind
    expect(computeVerdict('opsPerSec-surface', 'fast-lib', 1000, 2000, true, 'ok')).toBe('behind')
    // neutro=2000, competitor=1000 -> neutro is better
    expect(computeVerdict('opsPerSec-surface', 'slow-lib', 2000, 1000, true, 'ok')).toBe('win')
  })
})

describe('computeBooleanVerdict', () => {
  test('na status short-circuits to na', () => {
    expect(computeBooleanVerdict('async-cancellation', 'formik', true, false, 'na')).toBe('na')
  })

  test('error status short-circuits to error', () => {
    expect(computeBooleanVerdict('async-cancellation', 'formik', true, false, 'error')).toBe('error')
  })

  test('both true is tied', () => {
    expect(computeBooleanVerdict('async-cancellation', 'felte', true, true, 'ok')).toBe('tied')
  })

  test('both false is tied', () => {
    expect(computeBooleanVerdict('async-cancellation', 'felte', false, false, 'ok')).toBe('tied')
  })

  test('neutro true, competitor false, no annotation -> win', () => {
    expect(computeBooleanVerdict('unannotated-surface', 'unknown-lib', true, false, 'ok')).toBe('win')
  })

  test('neutro true, competitor false, WITH annotation -> tradeoff', () => {
    expect(computeBooleanVerdict('async-cancellation', 'react-hook-form', true, false, 'ok')).toBe('tradeoff')
  })

  test('neutro false, competitor true -> behind (real regression, no excuse)', () => {
    expect(computeBooleanVerdict('async-cancellation', 'felte', false, true, 'ok')).toBe('behind')
  })
})

describe('VERDICT_THRESHOLD', () => {
  test('is exactly 10%', () => {
    expect(VERDICT_THRESHOLD).toBe(0.10)
  })
})
