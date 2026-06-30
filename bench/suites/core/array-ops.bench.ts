import { bench, describe } from 'vitest'
import { createAdapter as neutroAdapter } from '../../adapters/neutro.js'
import { arrayFixture } from '../../fixtures/array.js'

describe('array-ops/remove', () => {
  const a = neutroAdapter(arrayFixture)
  // arrayRemove mutates state in-place. Restore the array before each call so the
  // bench doesn't deplete the 20-item array and start throwing after ~20 iterations.
  // This measures set() + arrayRemove() together; the set() overhead is small relative
  // to the shiftStateIndices rekey that arrayRemove must perform.
  const resetItems = Array.from({ length: 20 }, (_, i) => ({ id: i, value: `item${i}` }))
  bench(a.name, () => {
    a.set('items', [...resetItems])
    a.arrayRemove('items', 10)
  })
})

describe('array-ops/move', () => {
  const a = neutroAdapter(arrayFixture)
  bench(a.name, () => {
    a.arrayMove('items', 0, 10)
  })
})
