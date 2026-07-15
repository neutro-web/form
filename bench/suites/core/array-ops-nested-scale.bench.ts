import { bench, describe } from 'vitest'
import { createAdapter as neutroAdapter } from '../../adapters/neutro.js'
import { nestedArrayFixture } from '../../fixtures/nested-array.js'

function wireLeafSubscribers(adapter: ReturnType<typeof neutroAdapter>, groupCount: number, itemCount: number) {
  const unsubscribes: Array<() => void> = []
  for (let g = 0; g < groupCount; g++) {
    for (let i = 0; i < itemCount; i++) {
      unsubscribes.push(adapter.subscribeToPath(`groups.${g}.items.${i}.notes.0`, () => {}))
    }
  }
  return () => unsubscribes.forEach((fn) => fn())
}

// Each describe block instantiates ONE form outside the timed callback, mirroring
// array-ops-scale.bench.ts's isolation discipline: the timed callback only ever
// measures the shift itself, not form/subscriber construction.
describe('array-ops-nested/remove-outer', () => {
  const a = neutroAdapter(nestedArrayFixture)
  wireLeafSubscribers(a, 50, 10)
  const group = a.get('groups.0')
  // Worst case at the outer level: removing outer index 0 shifts all 49 remaining
  // groups, each carrying 10 nested items -- 490 leaf paths must re-index.
  bench('neutro/form', () => {
    a.arrayRemove('groups', 0)
    a.arrayInsert!('groups', 0, group)
  })
})

describe('array-ops-nested/remove-inner', () => {
  const a = neutroAdapter(nestedArrayFixture)
  wireLeafSubscribers(a, 50, 10)
  const item = a.get('groups.0.items.0')
  // Removing an inner index shifts only the 9 remaining items within group 0 --
  // isolates the cost of a shift confined to one outer element's sub-array.
  bench('neutro/form', () => {
    a.arrayRemove('groups.0.items', 0)
    a.arrayInsert!('groups.0.items', 0, item)
  })
})

describe('array-ops-nested/move-outer', () => {
  const a = neutroAdapter(nestedArrayFixture)
  wireLeafSubscribers(a, 50, 10)
  bench('neutro/form', () => {
    a.arrayMove('groups', 0, 49)
  })
})

describe('array-ops-nested/move-inner', () => {
  const a = neutroAdapter(nestedArrayFixture)
  wireLeafSubscribers(a, 50, 10)
  bench('neutro/form', () => {
    a.arrayMove('groups.0.items', 0, 9)
  })
})
