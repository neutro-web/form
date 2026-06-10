# Getting Started

## Installation

Install the core engine on its own, or use the `@agw/form` alias package which re-exports everything from a single entry point.

::: code-group

```sh [npm]
npm install @agnostic-web/form-core
# or short alias
npm install @agw/form
```

```sh [pnpm]
pnpm add @agnostic-web/form-core
# or short alias
pnpm add @agw/form
```

```sh [yarn]
yarn add @agnostic-web/form-core
# or short alias
yarn add @agw/form
```

:::

Framework adapters are separate packages. Install the one you need alongside the core:

```sh
# React
pnpm add @agnostic-web/form-react

# Svelte 5
pnpm add @agnostic-web/form-svelte

# Vue 3
pnpm add @agnostic-web/form-vue

# SolidJS
pnpm add @agnostic-web/form-solid

# Angular 16+
pnpm add @agnostic-web/form-angular
```

## Quick Example

```ts
import { createForm } from '@agnostic-web/form-core'
// Equivalent using the alias package:
// import { createForm } from '@agw/form/core'

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

### Triggering Validation Manually

```ts
// Validate all fields
await form.validate()

// Validate specific paths only
await form.validate(['email', 'username'])
```

## Sync Validator

```ts
import { createForm } from '@agnostic-web/form-core'

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

  // Automatically re-validate confirmPassword when password changes
  dependencies: {
    password: ['confirmPassword'],
  },
})
```

## Async Validator

Validators can return a `Promise`. Each invocation gets an `AbortSignal` — pass it to `fetch` so in-flight requests are cancelled when the field changes before the response arrives.

```ts
import { createForm } from '@agnostic-web/form-core'

const form = createForm({
  initialValues: { username: '' },
  asyncDebounceMs: 400, // wait 400 ms after the last keystroke before firing

  validator: async (values, _scopePaths, signal) => {
    const errors: Record<string, string> = {}

    if (!values.username) {
      errors.username = 'Required'
      return errors
    }

    const res = await fetch(`/api/check-username?q=${values.username}`, { signal })
    const { taken } = await res.json()

    if (taken) {
      errors.username = 'Username is already taken'
    }

    return errors
  },
})
```

## Next Steps

- **Framework adapters:** [React](/guides/react) | [Svelte 5](/guides/svelte) | [Vue 3](/guides/vue) | [SolidJS](/guides/solid) | [Angular](/guides/angular)
- **Full API reference:** [Core API](/api/core)
- **Advanced patterns:** [Async Validation](/guides/async-validation) | [Dependency Graph](/guides/dependency-graph) | [Multi-Step Forms](/guides/multi-step-forms)
