import type { FormFixture } from '../adapters/interface.js'

function makeGroups() {
  return Array.from({ length: 50 }, (_, g) => ({
    items: Array.from({ length: 10 }, (_, i) => ({ notes: [`note-${g}-${i}`] })),
  }))
}

export const nestedArrayFixture: FormFixture = {
  initialValues: { groups: makeGroups() },
}
