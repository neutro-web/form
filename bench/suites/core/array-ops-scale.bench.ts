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

describe('array-ops-scale/remove-start', () => {
  // Worst case for a shift-based engine: removing index 0 shifts all 499 remaining items.
  bench('neutro/form', () => {
    const a = neutroAdapter(largeArrayFixture)
    const cleanup = wireItemSubscribers(a, 500)
    a.arrayRemove('items', 0)
    cleanup()
  })
})

describe('array-ops-scale/remove-end', () => {
  // Best case: removing the last index shifts nothing.
  bench('neutro/form', () => {
    const a = neutroAdapter(largeArrayFixture)
    const cleanup = wireItemSubscribers(a, 500)
    a.arrayRemove('items', 499)
    cleanup()
  })
})

describe('array-ops-scale/remove-start-with-unrelated-fields', () => {
  // Same worst-case removal, but the form also has 500 unrelated top-level fields.
  // Isolates whether cost scales with array size alone or with total form state size
  // (shiftStateIndices's unconditional Object.keys(stateMap).forEach scans over
  // errors/touched/dirty/wasSet/validatedPaths, plus the pathSubscribers scan, all
  // iterate the ENTIRE respective collection, not just the array's own keys).
  bench('neutro/form', () => {
    const a = neutroAdapter(largeArrayWithUnrelatedFieldsFixture)
    const cleanup = wireItemSubscribers(a, 500)
    a.arrayRemove('items', 0)
    cleanup()
  })
})
