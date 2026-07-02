import type { FormFixture } from '../adapters/interface.js'

function makeItems() {
  return Array.from({ length: 500 }, (_, i) => ({ name: `item${i}`, email: `item${i}@test.com` }))
}

export const largeArrayFixture: FormFixture = {
  initialValues: { items: makeItems() },
}

export const largeArrayWithUnrelatedFieldsFixture: FormFixture = {
  initialValues: {
    items: makeItems(),
    ...Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`unrelated${i}`, `value${i}`])),
  },
}
