# React Guide

```sh
npm install @neutro/form
# pnpm add @neutro/form
# yarn add @neutro/form
```

## Hook Overview

| Hook | Re-renders on | Best for |
|---|---|---|
| `useForm` | Every state change | Submit button, form-level status |
| `useFormPath` | Changes to one path | Individual controlled fields |
| `useFormConnect` | Never | Uncontrolled / high-frequency inputs |

---

## `useForm` — Global State

`useForm` creates (or receives) a form instance and subscribes to the full `FormState<T>`. The component re-renders whenever any field changes.

```tsx
import { createForm } from '@neutro/form/core'
import { useForm } from '@neutro/form/adapters/react'

type LoginValues = {
  email: string
  password: string
}

const loginForm = createForm<LoginValues>({
  initialValues: { email: '', password: '' },
  validator: (values) => {
    const errors: Record<string, string> = {}
    if (!values.email.includes('@')) errors.email = 'Invalid email'
    if (values.password.length < 8) errors.password = 'Min 8 characters'
    return errors
  },
})

export function LoginForm() {
  const { values, errors, isSubmitting } = useForm(loginForm)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await loginForm.validate()
    if (Object.keys(errors).length > 0) return
    // submit...
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={values.email}
        onChange={(e) => loginForm.set('email', e.target.value, { touch: true })}
      />
      {errors.email && <span>{errors.email}</span>}

      <input
        type="password"
        value={values.password}
        onChange={(e) => loginForm.set('password', e.target.value, { touch: true })}
      />
      {errors.password && <span>{errors.password}</span>}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
```

---

## `useFormPath` — Controlled Field

`useFormPath` subscribes to a single field path and returns the value at that path with its TypeScript type inferred automatically. The component re-renders only when that field's value changes — not when unrelated fields update.

```tsx
import { useForm, useFormPath } from '@neutro/form/adapters/react'

function EmailField({ form }: { form: typeof loginForm }) {
  const email = useFormPath(form, 'email')   // inferred as string
  const { errors, touched } = useForm(form)  // for field metadata

  return (
    <div>
      <input
        value={email}
        onChange={(e) =>
          form.set('email', e.target.value, { touch: true, validate: true })
        }
      />
      {touched.email && errors.email && <span className="error">{errors.email}</span>}
    </div>
  )
}
```

`useFormPath` returns the field value directly — not an object. Access `errors` and `touched` from `useForm` (or from `form.getState()` if you need them without subscribing).

---

## `useFormConnect` — Uncontrolled (Zero Re-render)

`useFormConnect` takes the form instance and returns a curried ref-callback factory. Call it with a path (and optional `ConnectOptions`) to get a React ref callback — attach that to any DOM element for zero-rerender integration with the form. Ideal for high-frequency inputs like masked phone fields.

```tsx
import { useFormConnect } from '@neutro/form/adapters/react'

function PhoneField({ form }: { form: typeof myForm }) {
  const register = useFormConnect(form)

  return (
    <input
      ref={register('phone', {
        format: (v) => {
          const digits = String(v).replace(/\D/g, '')
          if (digits.length <= 3) return digits
          if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
          return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`
        },
      })}
      type="tel"
      placeholder="(555) 000-0000"
    />
  )
}
```

The element is disconnected automatically when the component unmounts. You can call `register` with multiple paths to wire up several inputs from the same hook.

---

## Full TypeScript Example

```tsx
import { createForm } from '@neutro/form/core'
import { useForm, useFormPath } from '@neutro/form/adapters/react'
import { zodAdapter } from '@neutro/form/core'
import { z } from 'zod'

const schema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email'),
})

type ProfileValues = z.infer<typeof schema>

const profileForm = createForm<ProfileValues>({
  initialValues: { firstName: '', lastName: '', email: '' },
  validator: zodAdapter(schema),
  asyncDebounceMs: 250,
})

function Field({ form, path, label }: {
  form: typeof profileForm
  path: keyof ProfileValues
  label: string
}) {
  const value = useFormPath(form, path)        // inferred string
  const { errors, touched } = useForm(form)   // re-renders only matter at this level
  return (
    <label>
      {label}
      <input
        value={value}
        onChange={(e) => form.set(path, e.target.value, { touch: true, validate: true })}
      />
      {touched[path] && errors[path] && <p className="error">{errors[path]}</p>}
    </label>
  )
}

export function ProfileForm() {
  const { isSubmitting, errors } = useForm(profileForm)
  const hasErrors = Object.keys(errors).length > 0

  return (
    <form onSubmit={async (e) => {
      e.preventDefault()
      await profileForm.validate()
    }}>
      <Field form={profileForm} path="firstName" label="First name" />
      <Field form={profileForm} path="lastName" label="Last name" />
      <Field form={profileForm} path="email" label="Email" />
      <button type="submit" disabled={isSubmitting || hasErrors}>Save</button>
    </form>
  )
}
```

---

## When to Use Each Hook

- **`useForm`** when the component needs to render based on aggregate form state (`isSubmitting`, whether any errors exist, `values` for a preview, etc.).
- **`useFormPath`** for individual field components that display their own value and error. Keeps re-renders scoped to the field.
- **`useFormConnect`** for high-frequency inputs (phone masking, rich text, canvas drawing) where React re-renders on every keystroke would be too expensive, or for DOM elements you want to control imperatively.
