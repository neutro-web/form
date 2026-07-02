import { describe, test, expect } from 'vitest'
import { badgeText } from './badge-text.js'
import type { BadgeCell } from './scorecard.js'

describe('badgeText', () => {
  test('tied numeric surface: brief shows pct, detail shows both raw values', () => {
    const cell: BadgeCell = { verdict: 'tied', neutroValue: 20, competitorValue: 21, unit: 'renders', higherIsBetter: false }
    const { brief, detail } = badgeText('re-renders/10', 'react-hook-form', cell)
    expect(brief).toBe('within 10% (5%)')
    expect(detail).toBe('neutro/form: 20 renders vs react-hook-form: 21 renders')
  })

  test('win numeric surface: brief shows pct better/faster, detail shows both raw values', () => {
    const cell: BadgeCell = { verdict: 'win', neutroValue: 3, competitorValue: 9, unit: 'renders', higherIsBetter: false }
    const { brief } = badgeText('array-ops', 'formik', cell)
    expect(brief).toBe('200% faster')
  })

  test('tradeoff with an annotation on the competitor key uses that annotation', () => {
    const cell: BadgeCell = { verdict: 'tradeoff', neutroLibrary: undefined }
    const { brief, detail } = badgeText('async-cancellation', 'react-hook-form', cell)
    expect(brief).toBe('no async cancellation API')
    expect(detail).toBe('no async cancellation API; a slow stale validation can overwrite a fresh result')
  })

  test('tradeoff with an annotation on the neutroLibrary key falls back correctly', () => {
    const cell: BadgeCell = { verdict: 'tradeoff', neutroLibrary: 'neutro/form (React)' }
    const { brief } = badgeText('async-latency', 'react-hook-form', cell)
    expect(brief).toBe('debounced 300ms by default')
  })

  test('na with an annotation (array-state-integrity tanstack-form) uses the annotation', () => {
    const cell: BadgeCell = { verdict: 'na' }
    const { brief } = badgeText('array-state-integrity', 'tanstack-form', cell)
    expect(brief).toBe('no public rekey API outside React context')
  })

  test('na with no annotation falls back to a generic brief and no citation', () => {
    const cell: BadgeCell = { verdict: 'na' }
    const { brief, detail } = badgeText('dependency-trigger', 'some-future-library', cell)
    expect(brief).toBe("surface doesn't apply to this library")
    expect(detail).toBeUndefined()
  })

  test('boolean tied surface with no numeric values', () => {
    const cell: BadgeCell = { verdict: 'tied' }
    const { brief, detail } = badgeText('array-state-integrity', 'react-hook-form', cell)
    expect(brief).toBe('both pass')
    expect(detail).toBeUndefined()
  })

  test('boolean win surface with no numeric values', () => {
    const cell: BadgeCell = { verdict: 'win' }
    const { brief } = badgeText('dependency-trigger', 'some-future-library', cell)
    expect(brief).toBe('neutro passes, this library does not')
  })

  test('boolean behind surface (no annotation) gets the opposite text from win, not the same text', () => {
    // Regression guard: the boolean catch-all must not collapse 'win' and 'behind' into the
    // same brief - 'win' means neutro passes and the competitor doesn't; 'behind' is the reverse.
    const cell: BadgeCell = { verdict: 'behind' }
    const { brief } = badgeText('dependency-trigger', 'some-future-library', cell)
    expect(brief).toBe('this library passes, neutro does not')
  })
})
