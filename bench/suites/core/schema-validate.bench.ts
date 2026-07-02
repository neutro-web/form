import { bench, describe } from 'vitest'
import { createAdapter as neutroAdapter } from '../../adapters/neutro.js'
import { schemaZodSmallFixture, schemaZodLargeFixture } from '../../fixtures/schema-zod.js'
import { schemaYupSmallFixture, schemaYupLargeFixture } from '../../fixtures/schema-yup.js'

describe('schema-validate/zod/small', () => {
  const a = neutroAdapter(schemaZodSmallFixture)
  bench(a.name, async () => {
    a.set('field0', 'x')
    await a.validate()
  })
})

describe('schema-validate/zod/large', () => {
  const a = neutroAdapter(schemaZodLargeFixture)
  bench(a.name, async () => {
    a.set('field0', 'x')
    await a.validate()
  })
})

describe('schema-validate/yup/small', () => {
  const a = neutroAdapter(schemaYupSmallFixture)
  bench(a.name, async () => {
    a.set('field0', 'x')
    await a.validate()
  })
})

describe('schema-validate/yup/large', () => {
  const a = neutroAdapter(schemaYupLargeFixture)
  bench(a.name, async () => {
    a.set('field0', 'x')
    await a.validate()
  })
})
