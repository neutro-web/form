import { bench, describe } from 'vitest'
import { createAdapter as neutroAdapter } from '../../adapters/neutro.js'
import { smallFixture } from '../../fixtures/small.js'
import { largeFixture } from '../../fixtures/large.js'
import { xlargeFixture } from '../../fixtures/xlarge.js'

describe('set-get/small', () => {
  const a = neutroAdapter(smallFixture)
  bench(a.name, () => {
    a.set('field0', 'x')
    a.get('field0')
  })
})

describe('set-get/large', () => {
  const a = neutroAdapter(largeFixture)
  bench(a.name, () => {
    a.set('field0', 'x')
    a.get('field0')
  })
})

describe('set-get/xlarge', () => {
  const a = neutroAdapter(xlargeFixture)
  bench(a.name, () => {
    a.set('field0', 'x')
    a.get('field0')
  })
})
