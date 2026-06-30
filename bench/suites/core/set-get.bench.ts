import { bench, describe } from 'vitest'
import { createAdapter as neutroAdapter } from '../../adapters/neutro.js'
import { createAdapter as tanstackAdapter } from '../../adapters/tanstack.js'
import { createAdapter as rhfAdapter } from '../../adapters/rhf.js'
import { createAdapter as formikAdapter } from '../../adapters/formik.js'
import { createAdapter as veeAdapter } from '../../adapters/vee-validate.js'
import { smallFixture } from '../../fixtures/small.js'
import { largeFixture } from '../../fixtures/large.js'
import type { BenchAdapter } from '../../adapters/interface.js'

function makeAdapters(fixture: Parameters<typeof neutroAdapter>[0]): BenchAdapter[] {
  const all = process.env.BENCH_ALL === 'true'
  const adapters: BenchAdapter[] = []
  const tryAdd = (factory: (f: typeof fixture) => BenchAdapter) => {
    try { adapters.push(factory(fixture)) }
    catch (e) { console.warn(`[set-get] adapter init failed: ${(e as Error).message}`) }
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

describe('set-get/small', () => {
  const adapters = makeAdapters(smallFixture)
  for (const a of adapters) {
    bench(a.name, () => {
      a.set('field0', 'x')
      a.get('field0')
    })
  }
})

describe('set-get/large', () => {
  const adapters = makeAdapters(largeFixture)
  for (const a of adapters) {
    bench(a.name, () => {
      a.set('field0', 'x')
      a.get('field0')
    })
  }
})
