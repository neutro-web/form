# Computed Fields

Computed fields are derived values that `createForm` maintains automatically. They re-evaluate after every mutation and are included in form state and submit payloads.

## Basic usage

```ts
import { createForm } from '@neutro/form/core'
import type { ComputedConfig, ComputedLeaf } from '@neutro/form/core'
```

```ts
import { createForm } from '@neutro/form/core'

type OrderForm = {
  qty: number
  unitPrice: number
  total: number
}

const form = createForm<OrderForm>({
  initialValues: { qty: 1, unitPrice: 10, total: 0 },
  computed: {
    total: { fn: (v) => v.qty * v.unitPrice },
  },
})

form.set('qty', 3)
form.get('total') // 30 — derived automatically
```

## Nested computed fields

Computed config mirrors the shape of `initialValues`. Any node with a `fn` property is a computed leaf; any node without one is a namespace.

```ts
type Form = {
  qty: number
  unitPrice: number
  pricing: { subtotal: number; vat: number }
}

const form = createForm<Form>({
  initialValues: { qty: 1, unitPrice: 10, pricing: { subtotal: 0, vat: 0 } },
  computed: {
    pricing: {
      subtotal: { fn: (v) => v.qty * v.unitPrice },
      vat: { fn: (v) => v.pricing.subtotal * 0.2 },
    },
  },
})
```

## Chained dependencies (A → B → C)

Computed fields are evaluated in multiple passes so that chains resolve correctly. With default `computedPassLimit: 5`, a chain up to 5 levels deep will fully resolve in a single `set()` call.

For best results, declare chained fields in dependency order (b before c when c depends on b). The default 5-pass limit handles reverse-declared chains too.

```ts
const form = createForm({
  initialValues: { a: 1, b: 0, c: 0 },
  computed: {
    b: { fn: (v) => v.a * 2 },   // pass 1: b = 2
    c: { fn: (v) => v.b + 1 },   // resolves to c = 3
  },
})

form.set('a', 3)
form.get('b') // 6
form.get('c') // 7
```

## Transient fields

Mark a computed field `transient: true` to keep it in form state for frontend logic without including it in server payloads.

```ts
const form = createForm({
  initialValues: { qty: 1, unitPrice: 10, total: 0, displayLabel: '' },
  computed: {
    total: { fn: (v) => v.qty * v.unitPrice },
    displayLabel: {
      fn: (v) => `${v.qty} × £${v.unitPrice} = £${v.total}`,
      transient: true,
    },
  },
  onSubmitSuccess: (payload) => {
    // payload.total        → 10 ✅ sent to server
    // payload.displayLabel → undefined ✅ excluded
  },
})
```

Transient fields are still accessible via `get()`, `getState().values`, and all subscribers.

Transient fields are also excluded from `form.getState().lastSubmittedValues` (the snapshot stored after each successful submit). They remain accessible via `form.get('fieldPath')` and `form.getState().values` at all times.

## Circular dependency guard

If computed fields never stabilize (field A reads B, B reads A), a dev warning fires after the pass limit is reached. The warning includes the names of the fields that are still changing so you can identify the cycle immediately.

```ts
const form = createForm({
  initialValues: { x: 0, y: 0 },
  computedPassLimit: 3, // default: 5
  computed: {
    x: { fn: (v) => v.y + 1 },
    y: { fn: (v) => v.x + 1 },
  },
})
// [NeutroForm] Computed fields did not stabilize after 3 passes.
// Check for circular dependencies. Still changing: x, y
```

## Constraints

- **Read-only**: calling `set('total', 999)` on a computed path is a no-op with a dev warning. Use `setDynamic` when you need to set a non-computed field via a runtime path — it also respects the computed guard. `getDynamic` can read any path, including computed fields, which is correct behavior.
- **Not available under `@neutro/form/core/minimal`**: the `computed` config option is accepted (no type error) if you build a form from the [minimal bundle tier](/guides/bundle-size-tiers), but it's silently never evaluated — the field just holds whatever value you gave it in `initialValues`. If a computed field looks frozen, check whether the form was created from `minimal` before debugging the function itself.
- **Never dirty**: computed paths never appear in `isDirty()` or `isFieldDirty()`.
- **Pure functions only**: `fn` runs on every `set()` call, for every computed field, unconditionally. Do not use side effects (network calls, logging) inside `fn`.
- **No array wildcards**: `items.*.price` as a computed target is out of scope. Compute at the item level instead.
- **reset() interaction**: calling `reset(newValues)` with a value at a computed path is ignored — the derived result always wins.
