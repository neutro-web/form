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
  // Isolates whether cost scales with array size alone or with total form state
  // size. Before the pathIndex fix (docs/superpowers/specs/2026-07-03-shift-
  // state-indices-prefix-index-design.md), shiftStateIndices's unconditional
  // Object.keys(stateMap).forEach scans over errors/touched/dirty/wasSet/
  // validatedPaths, plus the pathSubscribers scan, iterated the ENTIRE
  // respective collection every call, not just the array's own keys — this
  // benchmark's whole purpose is to make that difference visible.
  bench('neutro/form', () => {
    a.arrayRemove('items', 0)
    a.arrayInsert!('items', 0, item)
  })
})
