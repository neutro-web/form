import type { FormFixture } from '../adapters/interface.js'

// Fields b, c, d depend on a. Field e depends on b and c.
// This exercises both direct and transitive dependency resolution.
export const dependentFixture: FormFixture = {
  initialValues: { a: '', b: '', c: '', d: '', e: '', f: '' },
  dependencies: {
    b: ['a'],
    c: ['a'],
    d: ['a'],
    e: ['b', 'c'],
  },
}
