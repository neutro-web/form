# Getting Started

## Installation

```sh
npm install @agw/form
# pnpm add @agw/form
# yarn add @agw/form
```

One package. The exports map routes each adapter subpath:

| Import path | What you get |
|---|---|
| `@agw/form/core` | `createForm`, validation adapters, types |
| `@agw/form/adapters/react` | `useForm`, `useFormPath`, `useFormConnect` |
| `@agw/form/adapters/svelte` | `useSvelteForm` |
| `@agw/form/adapters/vue` | `useVueForm` |
| `@agw/form/adapters/solid` | `useSolidForm` |
| `@agw/form/adapters/angular` | `AngularFormService` |

## Quick Example

```ts
import { createForm } from '@agw/form/core'

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
import { createForm } from '@agw/form/core'

const form = createForm({
  initialValues: { email: '', username: '', age: 18, website: '' },

  rules: {
    email:    ['required', 'email'],
    username: ['required', { minLength: 3 }, { maxLength: 20 }],
    age:      [{ min: 0 }, { max: 120 }],
    website:  ['url'],
  },
})
```

### Available rules

| Rule | Type | Checks | Default message |
|---|---|---|---|
| `'required'` | string | non-empty value | "This field is required" |
| `'email'` | string | valid email format | "Must be a valid email address" |
| `'url'` | string | valid URL | "Must be a valid URL" |
| `'numeric'` | string | is a number | "Must be a number" |
| `{ minLength: n }` | object | `str.length >= n` | "Must be at least N characters" |
| `{ maxLength: n }` | object | `str.length <= n` | "Must be at most N characters" |
| `{ min: n }` | object | `number >= n` | "Must be at least N" |
| `{ max: n }` | object | `number <= n` | "Must be at most N" |
| `{ pattern: RegExp, message?: string }` | object | matches regex | "Invalid format" |
| `{ equalTo: 'path', message?: string }` | object | equals value at path | "Values do not match" |

Rules run first; a custom `validator` can run alongside them and its errors are merged in
(custom errors take precedence for the same field):

```ts
const form = createForm({
  initialValues: { password: '', confirmPassword: '' },

  rules: {
    password:        ['required', { minLength: 8 }],
    confirmPassword: ['required', { equalTo: 'password', message: 'Passwords do not match' }],
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
import { createForm } from '@agw/form/core'

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
import { createForm } from '@agw/form/core'

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

## Next Steps

- **Framework adapters:** [React](/guides/react) | [Svelte 5](/guides/svelte) | [Vue 3](/guides/vue) | [SolidJS](/guides/solid) | [Angular](/guides/angular)
- **Full API reference:** [Core API](/api/core)
- **Advanced patterns:** [Async Validation](/guides/async-validation) | [Dependency Graph](/guides/dependency-graph) | [Multi-Step Forms](/guides/multi-step-forms)
