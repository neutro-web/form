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

When a path is constructed at runtime, use the `setDynamic` and `getDynamic` escape hatches:

```ts
// path is a string known only at runtime
const field = `items.${index}.name`

form.setDynamic(field, 'Gadget')        // set at runtime path
form.getDynamic(field)                   // read at runtime path — returns unknown
```

For methods other than `set`/`get`, cast with `as Path<T>` when you are confident the path is valid:

```ts
form.isFieldDirty(field as Path<SignupValues>)  // use your form values type, not typeof form
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
form.resetField('items.0.name')               // nested array path
```

`ResetFieldOptions` controls which state is cleared:

| Option | Type | Default | Effect |
|---|---|---|---|
| `keepError` | `boolean` | `false` | Keep `errors[path]` |
| `keepTouched` | `boolean` | `false` | Keep `touched[path]` |
| `keepDirty` | `boolean` | `false` | Keep `dirty[path]` |

## Type Inference from `initialValues`

TypeScript infers the form's value type `T` from `initialValues` automatically — you do not need to write `createForm<Values>({...})` in most cases.

```ts
// T is inferred as { email: string; username: string }
const form = createForm({
  initialValues: { email: '', username: '' },
})
```

Inference also works when a schema validator is used:

```ts
import { z } from 'zod'
import { createForm, zodAdapter } from '@neutro/form/core'

const schema = z.object({ email: z.string(), username: z.string() })

// T is inferred from initialValues — zodAdapter does not affect inference
const form = createForm({
  initialValues: { email: '', username: '' },
  validator: zodAdapter(schema),
})
```

## Typing Form State in Tests (v0.3.0)

If you mock `FormState<T>` in tests, v0.3.0 added two required fields:

```ts
// v0.2.x mock (incomplete for v0.3.0):
const mockState: FormState<Values> = {
  values, errors, touched, dirty, isSubmitting, isValidating, isValid
}

// v0.3.0 mock — add the two new required fields:
const mockState: FormState<Values> = {
  values, errors, touched, dirty, isSubmitting, isValidating, isValid,
  submissionAttempts: 0,
  lastSubmittedValues: null,
}
```

## Typing Form Instance in Tests (v0.3.0)

If you mock `FormInstance<T>`, v0.3.0 added six new methods:

```ts
const mockForm: Partial<FormInstance<Values>> = {
  // ... existing mocks ...
  isFieldValid: () => null,
  isDirty: () => false,
  isFieldDirty: () => false,
  watch: () => () => {},
  focus: () => false,
  focusFirstError: () => false,
}
```

## Strict path types (v0.4+)

All path-accepting methods require `Path<T>` — a union of every valid dot-notation path in your form type. TypeScript catches typos at compile time:

```ts
form.set('pricing.vat', 0.2)   // ✅
form.set('pricing.typo', 0.2)  // ❌ TS error
```

**Depth limit:** `Path<T>` generates paths up to 5 levels deep. For paths beyond 5 levels, use `setDynamic`/`getDynamic`.

**Raw array-of-array nesting:** `Path<T>` does not type-check a *raw* array nested directly inside another array (no object wrapper in between) past one level. Given:

```ts
interface Grid {
  cube: number[][][]
}
```

`'cube.0.1'` type-checks, but `'cube.0.1.2'` does not, even though it is a valid runtime path. This is a limitation of the recursive path-generation type, not a runtime restriction — `form.get`/`form.set`/array operations all work correctly at any depth for raw nested arrays. Cast the literal with `as Path<T>` to work around it:

```ts
form.set('cube.0.1.2' as Path<Grid>, 42) // ✅ runtime-correct, cast needed to compile
```

This limitation does **not** apply to object-wrapped array nesting (e.g. `items.0.taxes.1.rate` where each array element is an object) — those paths type-check normally at any supported depth. See the FAQ in [Community & Support](/community#faq) for the object-wrapped case.

**Runtime paths:** Use `setDynamic(path, value)` and `getDynamic(path)` when the path is constructed at runtime. For other methods, cast with `as Path<T>`.
