import { bench, describe } from 'vitest'
import { createAdapter as neutroAdapter } from '../../adapters/neutro.js'
import { dependentFixture } from '../../fixtures/dependent.js'

describe('dependency-scopes/dependent', () => {
  const a = neutroAdapter(dependentFixture)
  bench(a.name, () => {
    // Changing 'a' should trigger scope resolution for b, c, d, and transitively e
    a.set('a', String(Math.random()))
  })
})
