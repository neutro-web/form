import type { FormFixture } from '../adapters/interface.js'

export const arrayFixture: FormFixture = {
  initialValues: {
    items:    Array.from({ length: 20 }, (_, i) => ({ id: i, value: `item${i}` })),
    tags:     Array.from({ length: 20 }, (_, i) => ({ id: i, label: `tag${i}` })),
    contacts: Array.from({ length: 20 }, (_, i) => ({ id: i, name: `contact${i}`, email: `c${i}@example.com` })),
  },
}
