import { bench, describe } from 'vitest'
import { createAdapter as neutroAdapter } from '../../adapters/neutro.js'
import { largeArrayFixture, largeArrayWithUnrelatedFieldsFixture } from '../../fixtures/large-array.js'

function wireItemSubscribers(adapter: ReturnType<typeof neutroAdapter>, count: number) {
  const unsubscribes: Array<() => void> = []
  for (let i = 0; i < count; i++) {
    unsubscribes.push(adapter.subscribeToPath(`items.${i}.name`, () => {}))
  }
  return () => unsubscribes.forEach(fn => fn())
}

// Each describe block instantiates ONE form outside the timed callback, then
// the timed callback repeatedly removes-then-reinserts the same item so the
// array stays at a stable size across iterations. This isolates the cost of
// the shift itself (shiftStateIndices) from the cost of building a fresh
// 500-item form + 500 subscribers, which previously dominated the signal.
describe('array-ops-scale/remove-start', () => {
  const a = neutroAdapter(largeArrayFixture)
  wireItemSubscribers(a, 500)
  const item = a.get('items.0')
  // Worst case for a shift-based engine: removing index 0 shifts all remaining items.
  bench('neutro/form', () => {
    a.arrayRemove('items', 0)
    a.arrayInsert!('items', 0, item)
  })
})

describe('array-ops-scale/remove-end', () => {
  const a = neutroAdapter(largeArrayFixture)
  wireItemSubscribers(a, 500)
  const lastIndex = (a.get('items') as unknown[]).length - 1
  const item = a.get(`items.${lastIndex}`)
  // Best case: removing the last index shifts nothing.
  bench('neutro/form', () => {
    a.arrayRemove('items', lastIndex)
    a.arrayInsert!('items', lastIndex, item)
  })
})

describe('array-ops-scale/remove-start-with-unrelated-fields', () => {
  const a = neutroAdapter(largeArrayWithUnrelatedFieldsFixture)
  wireItemSubscribers(a, 500)
  const item = a.get('items.0')
  // Same worst-case removal, but the form also has 500 unrelated top-level fields.
  // Those fields must carry REAL tracked state (touched + dirty) for this to mean
  // anything — otherwise they never enter errors/touched/dirty/wasSet/
  // validatedPaths/pathSubscribers, and old (full-scan) and new (pathIndex) code
  // both scan the exact same ~500 items-only entries, making the two
  // implementations look identical (or the new one look worse from pathIndex
  // bookkeeping overhead) despite this benchmark's whole purpose being to show
  // that shiftStateIndices no longer scans over untouched, unrelated form state.
  // This setup work is done outside the timed callback; only the shift/reinsert
  // itself is measured.
  for (let i = 0; i < 500; i++) {
    a.set(`unrelated${i}`, `touched-value${i}`, { touch: true })
  }
  bench('neutro/form', () => {
    a.arrayRemove('items', 0)
    a.arrayInsert!('items', 0, item)
  })
})
