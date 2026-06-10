# Array Operations

All five array mutation methods operate inside an internal `batch()` call so that subscribers receive a single notification after all mutations (value + field-state remapping) are complete.

Crucially, every method keeps the `errors`, `touched`, and `dirty` maps in sync with the array's new indices automatically. For example, if item 2 had a validation error and you `arrayRemove` item 0, the error moves from key `items.2.name` to `items.1.name` — you never need to manage index arithmetic yourself.

---

## `form.arrayAppend(path, item)`

```ts
form.arrayAppend(path: string, item: unknown): void
```

Appends a new item to the end of the array at `path`. No existing field state is remapped.

```ts
form.arrayAppend('destinations', { city: '', country: '' })
// items.length was 2 → is now 3
// new item appears at destinations.2.*
```

---

## `form.arrayInsert(path, index, item)`

```ts
form.arrayInsert(path: string, index: number, item: unknown): void
```

Inserts a new item at `index`. All items from `index` onward are shifted down by one position, and their field state keys (`errors`, `touched`, `dirty`) are renumbered accordingly.

```ts
// Insert a blank item at position 1
form.arrayInsert('destinations', 1, { city: '', country: '' })

// If destinations.1.city had an error, it is now at destinations.2.city
// The new item starts with no errors/touched/dirty
```

---

## `form.arrayRemove(path, index)`

```ts
form.arrayRemove(path: string, index: number): void
```

Removes the item at `index`. All items after `index` are shifted up by one position, and their field state keys are renumbered.

```ts
form.arrayRemove('destinations', 0)

// destinations.1.* → destinations.0.*
// destinations.2.* → destinations.1.*
// The removed item's field state is discarded
```

---

## `form.arrayMove(path, from, to)`

```ts
form.arrayMove(path: string, from: number, to: number): void
```

Moves the item at `from` to `to`. Items between the two positions slide to fill the gap. Field state follows the item — the moved item's errors, touched, and dirty keys are remapped to the destination index, and all intermediate items are renumbered.

```ts
// Drag item 3 up to position 0
form.arrayMove('destinations', 3, 0)

// Old 3 → new 0  (its field state moves too)
// Old 0 → new 1
// Old 1 → new 2
// Old 2 → new 3
```

---

## `form.arraySwap(path, i, j)`

```ts
form.arraySwap(path: string, i: number, j: number): void
```

Swaps the items at indices `i` and `j`. Their field state (errors, touched, dirty) is swapped as well. The items between `i` and `j` are not affected.

```ts
form.arraySwap('destinations', 0, 2)

// destinations[0] and destinations[2] exchange positions
// errors/touched/dirty at destinations.0.* and destinations.2.* are swapped
```

---

## Full Example

```ts
import { createForm } from '@agw/form/core'

type Destination = { city: string; country: string }
type TripValues = { destinations: Destination[] }

const form = createForm<TripValues>({
  initialValues: {
    destinations: [{ city: 'Paris', country: 'FR' }],
  },
  validator: (values) => {
    const errors: Record<string, string> = {}
    values.destinations.forEach((dest, i) => {
      if (!dest.city) errors[`destinations.${i}.city`] = 'Required'
      if (!dest.country) errors[`destinations.${i}.country`] = 'Required'
    })
    return errors
  },
})

// Add a new destination
form.arrayAppend('destinations', { city: '', country: '' })

// Insert one at the beginning
form.arrayInsert('destinations', 0, { city: 'Tokyo', country: 'JP' })

// Remove the second item
form.arrayRemove('destinations', 1)

// Reorder via drag-and-drop
form.arrayMove('destinations', 2, 0)

// Quick swap
form.arraySwap('destinations', 0, 1)
```
