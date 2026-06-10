# Validation Adapters

## Validator Contract

The `validator` option on `FormConfig` has the following signature:

```ts
type Validator<T> = (
  values: T,
  scopePaths?: string[],
  signal?: AbortSignal
) => Record<string, string> | Promise<Record<string, string>>
```

- **`values`** — the current form values snapshot.
- **`scopePaths`** — when present, only these field paths (and their dependents) need to be validated. You may ignore this and validate all fields; the engine discards errors outside the current scope on its own. However, using it to short-circuit expensive checks improves performance.
- **`signal`** — an `AbortSignal` tied to the current validation epoch. Abort-aware fetch calls will throw `AbortError` when the signal fires; the engine automatically discards the result in that case.

Return an empty object `{}` to indicate the form is valid.

---

## `zodAdapter(schema)`

```ts
import { zodAdapter } from '@agw/form/core'
import { z } from 'zod'

const schema = z.object({
  email: z.string().email('Must be a valid email'),
  age: z.number().min(18, 'Must be 18 or older'),
})

const form = createForm({
  initialValues: { email: '', age: 0 },
  validator: zodAdapter(schema),
})
```

`zodAdapter` calls `schema.safeParse(values)`. On failure it flattens `ZodError.flatten().fieldErrors` into a `Record<string, string>` (first error message per field).

---

## `valibotAdapter(schema)`

```ts
import { valibotAdapter } from '@agw/form/core'
import * as v from 'valibot'

const schema = v.object({
  email: v.pipe(v.string(), v.email('Must be a valid email')),
  username: v.pipe(v.string(), v.minLength(3, 'At least 3 characters')),
})

const form = createForm({
  initialValues: { email: '', username: '' },
  validator: valibotAdapter(schema),
})
```

`valibotAdapter` calls `v.safeParse(schema, values)`. On failure it reduces `ValiError.issues` into a `Record<string, string>`, using the dot-path from each issue's `path` array as the key.

---

## `yupAdapter(schema)`

```ts
import { yupAdapter } from '@agw/form/core'
import * as yup from 'yup'

const schema = yup.object({
  email: yup.string().email('Must be a valid email').required('Required'),
  password: yup.string().min(8, 'Min 8 characters').required('Required'),
})

const form = createForm({
  initialValues: { email: '', password: '' },
  validator: yupAdapter(schema),
})
```

`yupAdapter` calls `schema.validate(values, { abortEarly: false })` asynchronously. On a `ValidationError`, it reduces `error.inner` into a `Record<string, string>` keyed by `err.path`. Because `yup.validate` is async the adapter returns a `Promise` — the engine handles this transparently.

---

## `classValidatorAdapter(cls, validate)`

```ts
import { classValidatorAdapter } from '@agw/form/core'
import { IsEmail, MinLength } from 'class-validator'
import { validate } from 'class-validator'

class SignUpDto {
  @IsEmail({}, { message: 'Must be a valid email' })
  email!: string

  @MinLength(8, { message: 'Min 8 characters' })
  password!: string
}

const form = createForm({
  initialValues: { email: '', password: '' },
  validator: classValidatorAdapter(SignUpDto, validate),
})
```

`classValidatorAdapter` constructs an instance of `cls`, assigns the current values onto it using `Object.assign`, then calls `validate(instance)`. The resulting `ValidationError[]` array is reduced into a `Record<string, string>` using each error's `property` as the key and the first constraint message as the value. Returns a `Promise`.

---

## Composing Adapters with Custom Logic

Adapters return a plain validator function, so you can compose them with additional checks:

```ts
import { zodAdapter } from '@agw/form/core'

const baseValidator = zodAdapter(myZodSchema)

const form = createForm({
  initialValues: { username: '', email: '' },
  validator: async (values, scopePaths, signal) => {
    // Run schema validation first
    const schemaErrors = await baseValidator(values, scopePaths, signal)

    // Then add async uniqueness check
    if (!schemaErrors.username && values.username) {
      const res = await fetch(`/api/check?username=${values.username}`, { signal })
      const { taken } = await res.json()
      if (taken) schemaErrors.username = 'Username is already taken'
    }

    return schemaErrors
  },
})
```
