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
    catch (e) { console.warn(`[subscriptions] adapter init failed: ${(e as Error).message}`) }
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

function wireSubscribers(adapter: BenchAdapter, fixture: Parameters<typeof neutroAdapter>[0]) {
  const unsubscribes: Array<() => void> = []
  for (const key of Object.keys(fixture.initialValues)) {
    unsubscribes.push(adapter.subscribeToPath(key, () => {}))
  }
  return () => unsubscribes.forEach(fn => fn())
}

describe('subscriptions/small', () => {
  const adapters = makeAdapters(smallFixture)
  const cleanups = adapters.map(a => wireSubscribers(a, smallFixture))
  for (const a of adapters) {
    bench(a.name, () => { a.set('field0', 'x') })
  }
  // cleanups kept in scope to prevent GC
  void cleanups
})

describe('subscriptions/large', () => {
  const adapters = makeAdapters(largeFixture)
  const cleanups = adapters.map(a => wireSubscribers(a, largeFixture))
  for (const a of adapters) {
    bench(a.name, () => { a.set('field0', 'x') })
  }
  void cleanups
})
