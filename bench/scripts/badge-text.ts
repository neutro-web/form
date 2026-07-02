import { ANNOTATIONS } from '../annotations.js'
import type { BadgeCell } from './scorecard.js'

export interface BadgeText {
  brief: string
  detail?: string // only present when there's more to say than the brief
}

function formatValue(v: number, unit?: string): string {
  if (unit === 'ms') return `${v.toFixed(1)}ms`
  if (unit === 'bytes') return `${(v / 1024).toFixed(1)} KB`
  return `${v}${unit === 'renders' ? ' renders' : ''}`
}

export function badgeText(surface: string, library: string, cell: BadgeCell): BadgeText {
  const annotation = ANNOTATIONS[surface]?.[library] ?? (cell.neutroLibrary ? ANNOTATIONS[surface]?.[cell.neutroLibrary] : undefined)

  if (cell.verdict === 'tradeoff' || cell.verdict === 'behind') {
    if (annotation) return { brief: annotation.brief, detail: annotation.detail }
    // 'behind' with no annotation shouldn't normally happen (verdict.ts's computeVerdict/
    // computeBooleanVerdict only return 'tradeoff' when an annotation exists, so a bare
    // 'behind' has none by construction) - fall through to the numeric/boolean branches below
    // so the badge is never left unexplained.
  }

  if (cell.verdict === 'na') {
    if (annotation) return { brief: annotation.brief, detail: annotation.detail }
    return { brief: "surface doesn't apply to this library" }
  }

  if (cell.neutroValue != null && cell.competitorValue != null && cell.neutroValue !== 0) {
    let pct = (cell.competitorValue - cell.neutroValue) / cell.neutroValue
    if (cell.higherIsBetter) pct = -pct
    const pctLabel = `${Math.abs(Math.round(pct * 100))}%`

    if (cell.verdict === 'tied') {
      return {
        brief: `within 10% (${pctLabel})`,
        detail: `neutro/form: ${formatValue(cell.neutroValue, cell.unit)} vs ${library}: ${formatValue(cell.competitorValue, cell.unit)}`,
      }
    }
    if (cell.verdict === 'win') {
      return {
        brief: `${pctLabel} ${cell.higherIsBetter ? 'better' : 'faster'}`,
        detail: `neutro/form: ${formatValue(cell.neutroValue, cell.unit)} vs ${library}: ${formatValue(cell.competitorValue, cell.unit)} (${pctLabel} ${cell.higherIsBetter ? 'better' : 'fewer/faster'})`,
      }
    }
    // 'behind' with no annotation - shouldn't reach here per the comment above, but stay honest if it does.
    return {
      brief: `${pctLabel} behind, no documented reason`,
      detail: `neutro/form: ${formatValue(cell.neutroValue, cell.unit)} vs ${library}: ${formatValue(cell.competitorValue, cell.unit)}`,
    }
  }

  // Boolean-verdict surfaces (correctness pass/fail, cancellation) with no numeric delta.
  // All three verdicts are possible here (tied/win/behind) - 'win' means neutro passes and the
  // competitor doesn't; 'behind' (no annotation) is the reverse, and must not share 'win's text.
  if (cell.verdict === 'tied') return { brief: 'both pass' }
  if (cell.verdict === 'win') return { brief: 'neutro passes, this library does not' }
  return { brief: 'this library passes, neutro does not' } // 'behind', no annotation
}
