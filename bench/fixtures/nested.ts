import type { FormFixture } from '../adapters/interface.js'

export const nestedFixture: FormFixture = {
  initialValues: {
    items: Array.from({ length: 50 }, (_, i) => ({ name: `item${i}`, email: `item${i}@test.com` })),
  },
}
