import { ANNOTATIONS } from '../annotations.js'

export type Verdict = 'win' | 'tied' | 'behind' | 'tradeoff' | 'na' | 'error'

export const VERDICT_THRESHOLD = 0.10 // 10%

export function computeVerdict(
  surface: string,
  library: string,
  neutroValue: number | undefined,
  competitorValue: number | undefined,
  higherIsBetter: boolean,
  status: 'ok' | 'error' | 'na',
): Verdict {
  if (status === 'na') return 'na'
  if (status === 'error') return 'error'
  if (neutroValue == null || competitorValue == null) return 'na'
  if (neutroValue === 0) return 'na' // avoid divide-by-zero; can't compute a meaningful pct

  // pct > 0 always means "competitor is worse than neutro" after the higherIsBetter sign flip.
  let pct = (competitorValue - neutroValue) / neutroValue
  if (higherIsBetter) pct = -pct

  if (Math.abs(pct) <= VERDICT_THRESHOLD) return 'tied'
  if (pct > 0) return 'win' // competitor worse than neutro by more than threshold
  // competitor is BETTER than neutro by more than threshold
  return ANNOTATIONS[surface]?.[library] ? 'tradeoff' : 'behind'
}

export function computeBooleanVerdict(
  surface: string,
  library: string,
  neutroValue: boolean | undefined,
  competitorValue: boolean | undefined,
  status: 'ok' | 'error' | 'na' | 'pass' | 'fail',
): Verdict {
  if (status === 'na') return 'na'
  if (status === 'error') return 'error'
  if (neutroValue == null || competitorValue == null) return 'na'
  if (neutroValue === competitorValue) return 'tied'
  if (neutroValue === true && competitorValue === false) {
    return ANNOTATIONS[surface]?.[library] ? 'tradeoff' : 'win'
  }
  return 'behind' // neutroValue === false && competitorValue === true
}
