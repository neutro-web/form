import type { FormFixture } from '../adapters/interface.js'

export const xlargeFixture: FormFixture = {
  initialValues: Object.fromEntries(
    Array.from({ length: 1000 }, (_, i) => [`field${i}`, ''])
  ),
}
