# TypeScript Guide

`@neutro/form` is written in TypeScript and ships full type definitions.

## Typing your form

Pass your values interface as the generic to `createForm<T>`:

```ts
import { createForm } from '@neutro/form/core'

interface SignupValues {
  email: string
  age: number
  items: Array<{ name: string; qty: number }>
}

const form = createForm<SignupValues>({
  initialValues: { email: '', age: 0, items: [] },
})
```

## Typed reads

`form.get()` returns the correct value type for known paths:

```ts
const email: string = form.get('email')  // string
const age: number   = form.get('age')    // number
```

## Typed writes

`form.set()` enforces value types for known paths:

```ts
form.set('email', 'hello@example.com') // ✅
form.set('email', 42)                  // ❌ TypeScript error
```

## Typed array operations

`arrayAppend` and `arrayInsert` enforce the element type of the target array:

```ts
form.arrayAppend('items', { name: 'widget', qty: 1 }) // ✅
form.arrayAppend('items', 'not-an-object')             // ❌ TypeScript error
```

## Dynamic paths

For paths computed at runtime, the typed overload falls back to `string`:

```ts
const path: string = computePath()
form.set(path, value) // ✅ always compiles — falls back to loose overload
```

## Utility types

```ts
import type { Path, GetPathValue, ArrayItem } from '@neutro/form/core'

type AllPaths = Path<SignupValues>
// 'email' | 'age' | 'items' | `items.${number}` | `items.${number}.name` | ...

type EmailType = GetPathValue<SignupValues, 'email'>
// string

type ItemType = ArrayItem<SignupValues['items']>
// { name: string; qty: number }
```

## Resetting a Single Field

`resetField` accepts the same typed paths as `set` and `get`:

```ts
const form = createForm<SignupForm>({
  initialValues: { email: '', age: 0, items: [] },
});

form.resetField('email')                      // restores '' — the initial value
form.resetField('email', { keepError: true }) // restores value, keeps error
form.resetField(['items', '0', 'name'])       // segment-array path
```

`ResetFieldOptions` controls which state is cleared:

| Option | Type | Default | Effect |
|---|---|---|---|
| `keepError` | `boolean` | `false` | Keep `errors[path]` |
| `keepTouched` | `boolean` | `false` | Keep `touched[path]` |
| `keepDirty` | `boolean` | `false` | Keep `dirty[path]` |
