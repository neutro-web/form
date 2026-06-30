import { bench, describe } from 'vitest'
import { createAdapter as neutroAdapter } from '../../adapters/neutro.js'
import { createAdapter as tanstackAdapter } from '../../adapters/tanstack.js'
import { createAdapter as rhfAdapter } from '../../adapters/rhf.js'
import { createAdapter as formikAdapter } from '../../adapters/formik.js'
import { createAdapter as veeAdapter } from '../../adapters/vee-validate.js'
import { arrayFixture } from '../../fixtures/array.js'
import type { BenchAdapter } from '../../adapters/interface.js'

function makeAdapters(): BenchAdapter[] {
  const all = process.env.BENCH_ALL === 'true'
  const adapters: BenchAdapter[] = []
  const tryAdd = (factory: (f: typeof arrayFixture) => BenchAdapter) => {
    try { adapters.push(factory(arrayFixture)) }
    catch (e) { console.warn(`[array-ops] adapter init failed: ${(e as Error).message}`) }
  }
  tryAdd(neutroAdapter)
  if (all) {
    tryAdd(tanstackAdapter)
    tryAdd(rhfAdapter)
    tryAdd(formikAdapter)
    tryAdd(veeAdapter)
  }
  return adapters
}

describe('array-ops/remove', () => {
  const adapters = makeAdapters()
  // arrayRemove mutates state in-place. Restore the array before each call so the
  // bench doesn't deplete the 20-item array and start throwing after ~20 iterations.
  // This measures set() + arrayRemove() together; the set() overhead is small relative
  // to the shiftStateIndices rekey that arrayRemove must perform.
  const resetItems = Array.from({ length: 20 }, (_, i) => ({ id: i, value: `item${i}` }))
  for (const a of adapters) {
    bench(a.name, () => {
      a.set('items', [...resetItems])
      a.arrayRemove('items', 10)
    })
  }
})

describe('array-ops/move', () => {
  const adapters = makeAdapters()
  for (const a of adapters) {
    bench(a.name, () => {
      a.arrayMove('items', 0, 10)
    })
  }
})
