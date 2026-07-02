import { bench, describe } from 'vitest'
import { createAdapter as neutroAdapter } from '../../adapters/neutro.js'
import { dependencyChainFixture } from '../../fixtures/dependency-chain.js'

describe('dependency-graph/deep-chain', () => {
  const a = neutroAdapter(dependencyChainFixture)
  bench(a.name, () => {
    a.set('f0', Math.random())
  })
})
