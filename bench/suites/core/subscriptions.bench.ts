import { bench, describe } from 'vitest'
import { createAdapter as neutroAdapter } from '../../adapters/neutro.js'
import { smallFixture } from '../../fixtures/small.js'
import { largeFixture } from '../../fixtures/large.js'

function wireSubscribers(adapter: ReturnType<typeof neutroAdapter>, fixture: Parameters<typeof neutroAdapter>[0]) {
  const unsubscribes: Array<() => void> = []
  for (const key of Object.keys(fixture.initialValues)) {
    unsubscribes.push(adapter.subscribeToPath(key, () => {}))
  }
  return () => unsubscribes.forEach(fn => fn())
}

describe('subscriptions/small', () => {
  const a = neutroAdapter(smallFixture)
  const cleanup = wireSubscribers(a, smallFixture)
  bench(a.name, () => { a.set('field0', 'x') })
  // cleanup kept in scope to prevent GC
  void cleanup
})

describe('subscriptions/large', () => {
  const a = neutroAdapter(largeFixture)
  const cleanup = wireSubscribers(a, largeFixture)
  bench(a.name, () => { a.set('field0', 'x') })
  void cleanup
})
