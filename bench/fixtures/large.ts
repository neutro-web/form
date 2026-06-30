import type { FormFixture } from '../adapters/interface.js'

export const largeFixture: FormFixture = {
  initialValues: Object.fromEntries(
    Array.from({ length: 100 }, (_, i) => [`field${i}`, ''])
  ),
}
