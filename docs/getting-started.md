# Getting Started

## Installation

```sh
npm install @neutro/form
# pnpm add @neutro/form
# yarn add @neutro/form
```

One package. The exports map routes each adapter subpath:

| Import path | What you get |
|---|---|
| `@neutro/form/core` | `createForm`, validation adapters, types |
| `@neutro/form/adapters/react` | `useForm`, `useFormPath`, `useFormConnect` |
| `@neutro/form/adapters/svelte` | `useSvelteForm`, `useSvelteFormPath` |
| `@neutro/form/adapters/vue` | `useVueForm`, `useVueFormPath` |
| `@neutro/form/adapters/solid` | `useSolidForm`, `useSolidFormPath` |
| `@neutro/form/adapters/angular` | `useAngularForm`, `useAngularFormPath` |

## Quick Example

```ts
import { createForm } from '@neutro/form/core'

const form = createForm({
  initialValues: {
    username: '',
    email: '',
    age: 0,
  },
})
```

### Setting and Getting Values

```ts
// Set a value (does not touch or validate by default)
form.set('username', 'alice')

// Set with side effects
form.set('email', 'alice@example.com', { touch: true, validate: true })

// Get the current value at a path
const username = form.get('username') // 'alice'

// Get the full state snapshot
const state = form.getState()
// {
//   values: { username: 'alice', email: 'alice@example.com', age: 0 },
//   errors: {},
//   touched: { email: true },
//   dirty: { username: true, email: true },
//   isSubmitting: false,
//   isValidating: false,
// }
```

### Subscribing to State Changes

```ts
// Global subscriber — receives the full FormState<T> on every change
const unsubscribe = form.subscribe((state) => {
  console.log('values:', state.values)
  console.log('errors:', state.errors)
})

// Path-level subscriber — receives only the value and field state for one path
const unsubPath = form.subscribeToPath('username', (value, fieldState) => {
  console.log('username changed to', value)
  console.log('touched:', fieldState.touched, 'dirty:', fieldState.dirty)
})

// Always clean up subscriptions when done
unsubscribe()
unsubPath()
```

## Built-in Validation Rules

For common validation you don't need an external schema library. The `rules` config takes
rule names or option objects per field path:

```ts
import { createForm } from '@neutro/form/core'

const form = createForm({
  initialValues: {
    email: '', username: '', age: 18, website: '',
    password: '', confirmPassword: '',
    terms: false, tags: [] as string[],
    startDate: '', endDate: '',
  },
  rules: {
    email:           ['required', 'email'],
    username:        ['required', 'alphanumeric', { minLength: 3 }, { maxLength: 20 }],
    age:             ['integer', { min: 0 }, { max: 120 }],
    website:         'url',
    password:        ['required', { minLength: 8 }],
    confirmPassword: { matches: 'password', message: 'Passwords do not match' },
    terms:           'accepted',
    tags:            [{ minItems: 1 }, 'unique'],
    endDate:         { after: 'startDate' },
  },
})
```

### Available rules

**Presence**

| Rule | Checks | Default message |
|---|---|---|
| `'required'` | non-empty (string, array, value) | "This field is required" |
| `'accepted'` | must be `true` (checkbox / terms) | "This field must be accepted" |

**Format**

| Rule | Checks | Default message |
|---|---|---|
| `'email'` | valid email address | "Must be a valid email address" |
| `'url'` | valid URL | "Must be a valid URL" |
| `'numeric'` | is a number | "Must be a number" |
| `'integer'` | whole number, no decimals | "Must be a whole number" |
| `'positive'` | number > 0 | "Must be greater than zero" |
| `'nonNegative'` | number >= 0 | "Must be zero or greater" |
| `'alpha'` | letters only [a-zA-Z] | "Must contain letters only" |
| `'alphanumeric'` | letters and numbers | "Must contain letters and numbers only" |
| `'date'` | parseable date string | "Must be a valid date" |

**Length / size**

| Rule | Checks | Default message |
|---|---|---|
| `{ minLength: n }` | `str.length >= n` | "Must be at least N characters" |
| `{ maxLength: n }` | `str.length <= n` | "Must be at most N characters" |
| `{ min: n }` | `number >= n` | "Must be at least N" |
| `{ max: n }` | `number <= n` | "Must be at most N" |

**String content**

| Rule | Checks | Default message |
|---|---|---|
| `{ startsWith: 'prefix' }` | string starts with prefix | "Must start with ..." |
| `{ endsWith: 'suffix' }` | string ends with suffix | "Must end with ..." |
| `{ includes: 'text' }` | string contains substring | "Must contain ..." |
| `{ pattern: RegExp }` | matches regex | "Invalid format" |

**Array**

| Rule | Checks | Default message |
|---|---|---|
| `{ minItems: n }` | `array.length >= n` | "Must have at least N items" |
| `{ maxItems: n }` | `array.length <= n` | "Must have at most N items" |
| `'unique'` | all items distinct (deep equality) | "All items must be unique" |
| `{ contains: value }` | array includes value (deep equality) | "Must contain the required value" |

**Enum**

| Rule | Checks | Default message |
|---|---|---|
| `{ oneOf: [...] }` | value is in the list | "Must be one of: ..." |
| `{ notOneOf: [...] }` | value is not in the list | "Must not be one of: ..." |

**Cross-field** — all accept a dot-path string pointing to another field

| Rule | Checks | Default message |
|---|---|---|
| `{ matches: 'path' }` | deep-equals value at path (works for any type) | "Values do not match" |
| `{ doesNotMatch: 'path' }` | does NOT deep-equal value at path | "Values must not match" |
| `{ greaterThan: 'path' }` | numeric > value at path | "Must be greater than N" |
| `{ lessThan: 'path' }` | numeric < value at path | "Must be less than N" |
| `{ after: 'path' }` | date/time after date at path | "Must be after the reference date" |
| `{ before: 'path' }` | date/time before date at path | "Must be before the reference date" |

**Conditional presence**

| Rule | Checks | Default message |
|---|---|---|
| `{ requiredIf: 'path' }` | required when field at path is truthy | "This field is required" |
| `{ requiredUnless: 'path' }` | required unless field at path is truthy | "This field is required" |

**File / FileList**

| Rule | Checks | Default message |
|---|---|---|
| `{ maxFileSize: n }` | `File.size <= n` bytes (per-file for FileList) | "File must be at most N MB" |
| `{ minFileSize: n }` | `File.size >= n` bytes (per-file for FileList) | "File must be at least N KB" |
| `{ fileTypes: [...] }` | `File.type` in allow-list (per-file for FileList) | "File type must be one of: ..." |
| `{ maxFiles: n }` | `FileList.length <= n` | "Select at most N files" |
| `{ minFiles: n }` | `FileList.length >= n` | "Select at least N files" |

Use `minFiles: 1` instead of `'required'` for file inputs — it's clearer about intent and handles `FileList` correctly. Size/type rules are no-ops when the field value is `null` or empty.

Every rule accepts an optional `message` property to override the default.

Rules run first; a custom `validator` can run alongside them and its errors are merged in
(custom errors take precedence for the same field):

```ts
const form = createForm({
  initialValues: { password: '', confirmPassword: '' },

  rules: {
    password:        ['required', { minLength: 8 }],
    confirmPassword: ['required', { matches: 'password', message: 'Passwords do not match' }],
  },

  // Still run an async check alongside the built-in rules
  validator: async (values, _scope, signal) => {
    const errors: Record<string, string> = {}
    if (values.password && !/[A-Z]/.test(values.password)) {
      errors.password = 'Must contain at least one uppercase letter'
    }
    return errors
  },
})
```

## Custom Validator Function

When built-in rules aren't enough, pass a `validator` function that returns
`Record<string, string>` (or a `Promise` of one):

```ts
import { createForm } from '@neutro/form/core'

type SignUpValues = {
  email: string
  password: string
  confirmPassword: string
}

const form = createForm<SignUpValues>({
  initialValues: { email: '', password: '', confirmPassword: '' },

  validator: (values) => {
    const errors: Record<string, string> = {}

    if (!values.email.includes('@')) {
      errors.email = 'Must be a valid email address'
    }
    if (values.password.length < 8) {
      errors.password = 'Password must be at least 8 characters'
    }
    if (values.confirmPassword !== values.password) {
      errors.confirmPassword = 'Passwords do not match'
    }

    return errors
  },

  dependencies: {
    password: ['confirmPassword'],
  },
})
```

## Async Validator

Validators can return a `Promise`. Each invocation gets an `AbortSignal` — pass it to
`fetch` so in-flight requests are cancelled when the field changes before the response arrives.

```ts
import { createForm } from '@neutro/form/core'

const form = createForm({
  initialValues: { username: '' },
  asyncDebounceMs: 400,

  validator: async (values, _scopePaths, signal) => {
    const errors: Record<string, string> = {}

    if (!values.username) {
      errors.username = 'Required'
      return errors
    }

    const res = await fetch(`/api/check-username?q=${values.username}`, { signal })
    const { taken } = await res.json()

    if (taken) errors.username = 'Username is already taken'

    return errors
  },
})
```

## Handling Server Errors

Client-side validation runs before the request leaves the browser, but servers often return additional field-level errors (duplicate email, reserved username, invalid coupon code). Use `form.setErrors()` to merge these back into form state after a failed API call:

```ts
import { createForm } from '@neutro/form/core'

const form = createForm({
  initialValues: { email: '', username: '' },
  rules: {
    email: ['required', 'email'],
    username: 'required',
  },
})

document.querySelector('form')?.addEventListener('submit', async (e) => {
  e.preventDefault()
  await form.submit(async (payload) => {
    const res = await fetch('/api/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const { errors } = await res.json()
      // errors might be: { email: 'Already taken', username: 'Unavailable' }
      form.setErrors(errors)
    }
  })
})
```

Server errors behave exactly like client errors: they appear in `state.errors`, fire all the same subscribers, and clear the next time that field is validated. Calling `form.reset()` wipes them along with everything else.

## Resetting a Single Field

To reset one field without touching others, use `resetField`:

```ts
form.resetField('email')                      // restore to initial value
form.resetField('email', { keepError: true }) // restore value, keep error
form.resetField('address')                    // resets address.city, address.zip too
```

`resetField` does NOT trigger validation. Errors, touched, and dirty flags are cleared by default.

## Validation Modes

By default, `connect()` validates a field **on input, but only after the user has blurred it at least once** (`'onTouched'`). This avoids interrupting the user on first entry while providing immediate feedback during correction. You can change this globally or per field:

```ts
const form = createForm({
  initialValues: { email: '', password: '', terms: false },
  validationMode: {
    default: 'onTouched',    // most fields: validate after first blur
    fields: {
      password: 'onChange',  // password: validate on every keystroke
      terms: 'onSubmitOnly', // checkbox: only validate on submit
    },
  },
})
```

The four modes:

| Mode | When validation runs |
|---|---|
| `'onTouched'` | On input events, but only after the field has been blurred once. Also on every blur. **(default)** |
| `'onChange'` | On every input event immediately. |
| `'onBlur'` | On blur only. Never validates while typing. |
| `'onSubmitOnly'` | Only when `form.submit()` runs. No inline validation. |

Pass a single string to apply one mode to all fields:

```ts
const form = createForm({
  initialValues: { email: '', name: '' },
  validationMode: 'onBlur',
})
```

Override per element at `connect()` time using `validateOn`:

```ts
// Global mode is onTouched, but this specific field validates on change
form.connect('password', passwordEl, { validateOn: 'onChange' })
```

Framework adapter users can query the configured mode to implement the right event wiring:

```ts
const mode = form.getFieldMode('email') // → 'onTouched' | 'onChange' | 'onBlur' | 'onSubmitOnly'
```

## Next Steps

- **Framework adapters:** [React](/guides/react) | [Svelte 5](/guides/svelte) | [Vue 3](/guides/vue) | [SolidJS](/guides/solid) | [Angular](/guides/angular)
- **Full API reference:** [Core API](/api/core)
- **Advanced patterns:** [Async Validation](/guides/async-validation) | [Dependency Graph](/guides/dependency-graph) | [Multi-Step Forms](/guides/multi-step-forms)
