# SolidJS Guide

```sh
npm install @neutro/form
# pnpm add @neutro/form
# yarn add @neutro/form
```

## Hook Overview

| Hook | Reactivity | Best for |
|---|---|---|
| `useSolidForm` | `createStore` + `reconcile` — granular | Full form state, submit button |
| `useSolidFormPath` | Derived signal from store slice | Individual field components |

The adapter uses SolidJS's `createStore` with `reconcile` for structural diffing, so only the store slices that actually changed trigger reactive updates — even inside deeply nested objects.

---

## `useSolidForm` — Granular Store

```tsx
import { createForm } from '@neutro/form/core'
import { useSolidForm } from '@neutro/form/adapters/solid'

type LoginValues = { email: string; password: string }

const form = createForm<LoginValues>({
  initialValues: { email: '', password: '' },
  validator: (values) => {
    const errors: Record<string, string> = {}
    if (!values.email.includes('@')) errors.email = 'Invalid email'
    if (values.password.length < 8) errors.password = 'Min 8 characters'
    return errors
  },
})

export function LoginForm() {
  // Returns [state, actions] — state is a SolidJS store, actions are the form methods
  const [state, actions] = useSolidForm(form)

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault()
    await form.validate()
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={state.values.email}
        onInput={(e) =>
          actions.set('email', e.currentTarget.value, { touch: true, validate: true })
        }
      />
      {state.errors.email && <span>{state.errors.email}</span>}

      <input
        type="password"
        value={state.values.password}
        onInput={(e) =>
          actions.set('password', e.currentTarget.value, { touch: true, validate: true })
        }
      />
      {state.errors.password && <span>{state.errors.password}</span>}

      <button type="submit" disabled={state.isSubmitting}>
        {state.isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
```

---

## `useSolidFormPath` — Field Signals

`useSolidFormPath` returns `{ value, fieldState }` — two independent signal accessors. Call each to read its current value. Only the component that reads a signal re-runs when that signal changes.

```tsx
import { useSolidFormPath } from '@neutro/form/adapters/solid'

function Field(props: {
  form: typeof form
  path: string
  label: string
}) {
  // Returns { value: Signal, fieldState: Signal }
  const field = useSolidFormPath(props.form, props.path)

  return (
    <label>
      {props.label}
      <input
        value={field.value() as string}
        onInput={(e) =>
          props.form.set(props.path, e.currentTarget.value, {
            touch: true,
            validate: true,
          })
        }
      />
      {field.fieldState()?.touched && field.fieldState()?.error && (
        <span class="error">{field.fieldState()?.error}</span>
      )}
    </label>
  )
}
```

---

## Dynamic Paths

In SolidJS, the path passed to `useSolidFormPath` is evaluated **once at call time** and does not update reactively if the variable changes later. For dynamic paths inside `<For>`, pass the path as a prop and call the hook at the component level — each component instance gets its own path:

```tsx
import { For } from 'solid-js'

type Destination = { city: string }

function DestinationRow(props: { form: typeof form; index: number }) {
  // Evaluated once — safe because index is stable for the lifetime of this component
  const city = useSolidFormPath(props.form, `destinations.${props.index}.city`)

  return (
    <input
      value={city.value() as string}
      onInput={(e) =>
        props.form.set(
          `destinations.${props.index}.city`,
          e.currentTarget.value,
          { touch: true, validate: true }
        )
      }
    />
  )
}

function DestinationList() {
  const [state] = useSolidForm(form)
  return (
    <For each={state.values.destinations as Destination[]}>
      {(_, i) => <DestinationRow form={form} index={i()} />}
    </For>
  )
}
```

---

## Full Example with Zod

```tsx
import { createForm } from '@neutro/form/core'
import { zodAdapter } from '@neutro/form/core'
import { useSolidForm, useSolidFormPath } from '@neutro/form/adapters/solid'
import { z } from 'zod'

const schema = z.object({
  username: z.string().min(3, 'At least 3 characters'),
  email: z.string().email('Invalid email'),
})

type Values = z.infer<typeof schema>

const form = createForm<Values>({
  initialValues: { username: '', email: '' },
  validator: zodAdapter(schema),
})

export function ProfileForm() {
  const [state, actions] = useSolidForm(form)
  const username = useSolidFormPath(form, 'username')
  const email = useSolidFormPath(form, 'email')

  return (
    <form onSubmit={(e) => { e.preventDefault(); actions.submit(async () => {}) }}>
      <label>
        Username
        <input
          value={username.value() as string}
          onInput={(e) => actions.set('username', e.currentTarget.value, { touch: true, validate: true })}
        />
        {username.fieldState()?.touched && username.fieldState()?.error && <p>{username.fieldState()?.error}</p>}
      </label>

      <label>
        Email
        <input
          type="email"
          value={email.value() as string}
          onInput={(e) => actions.set('email', e.currentTarget.value, { touch: true, validate: true })}
        />
        {email.fieldState()?.touched && email.fieldState()?.error && <p>{email.fieldState()?.error}</p>}
      </label>

      <button type="submit" disabled={state.isSubmitting}>Save</button>
    </form>
  )
}
```

---

## Notes on `reconcile`

The adapter calls `reconcile(newState)` when producing store updates. This performs a structural diff and produces the minimal set of signal updates. For large forms with many fields, this means only the changed paths cause reactive re-executions — the SolidJS equivalent of React's `useSyncExternalStore` with selector memoisation, but without any extra configuration on your part.
