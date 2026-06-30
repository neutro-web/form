import { bench, describe } from 'vitest'
import { createAdapter as neutroAdapter } from '../../adapters/neutro.js'
import { createAdapter as tanstackAdapter } from '../../adapters/tanstack.js'
import { createAdapter as rhfAdapter } from '../../adapters/rhf.js'
import { createAdapter as formikAdapter } from '../../adapters/formik.js'
import { createAdapter as veeAdapter } from '../../adapters/vee-validate.js'
import { dependentFixture } from '../../fixtures/dependent.js'
import type { BenchAdapter } from '../../adapters/interface.js'

function makeAdapters(): BenchAdapter[] {
  const all = process.env.BENCH_ALL === 'true'
  const adapters: BenchAdapter[] = []
  const tryAdd = (factory: (f: typeof dependentFixture) => BenchAdapter) => {
    try { adapters.push(factory(dependentFixture)) }
    catch (e) { console.warn(`[dep-scopes] adapter init failed: ${(e as Error).message}`) }
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

describe('dependency-scopes/dependent', () => {
  const adapters = makeAdapters()
  for (const a of adapters) {
    bench(a.name, () => {
      // Changing 'a' should trigger scope resolution for b, c, d, and transitively e
      a.set('a', String(Math.random()))
    })
  }
})
