import type { FormFixture } from '../adapters/interface.js'

export const smallFixture: FormFixture = {
  initialValues: Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [`field${i}`, ''])
  ),
}
