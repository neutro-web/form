import type { FormFixture } from '../adapters/interface.js'

export const dependencyChainFixture: FormFixture = {
  initialValues: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`f${i}`, 0])),
  dependencies: Object.fromEntries(
    Array.from({ length: 199 }, (_, i) => [`f${i + 1}`, [`f${i}`]])
  ),
}
