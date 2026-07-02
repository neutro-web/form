import { bench, describe } from 'vitest'
import { createAdapter as neutroAdapter } from '../../adapters/neutro.js'
import { nestedFixture } from '../../fixtures/nested.js'

function wireItemSubscribers(adapter: ReturnType<typeof neutroAdapter>) {
  const unsubscribes: Array<() => void> = []
  for (let i = 0; i < 50; i++) {
    unsubscribes.push(adapter.subscribeToPath(`items.${i}.name`, () => {}))
    unsubscribes.push(adapter.subscribeToPath(`items.${i}.email`, () => {}))
  }
  return () => unsubscribes.forEach(fn => fn())
}

describe('nested-set', () => {
  const a = neutroAdapter(nestedFixture)
  const cleanup = wireItemSubscribers(a)
  bench(a.name, () => {
    a.set('items.0', { name: 'x', email: 'y' })
  })
  // cleanup kept in scope to prevent GC
  void cleanup
})
