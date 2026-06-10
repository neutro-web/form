# React Guide

Install the adapter alongside the core:

```sh
pnpm add @agnostic-web/form-core @agnostic-web/form-react
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
import { createForm } from '@agnostic-web/form-core'
import { useForm } from '@agnostic-web/form-react'

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

`useFormPath` subscribes to a single field path. The component re-renders only when that field's value or state changes — not when unrelated fields update.

```tsx
import { useFormPath } from '@agnostic-web/form-react'

function EmailField({ form }: { form: typeof loginForm }) {
  const { value, error, touched } = useFormPath(form, 'email')

  return (
    <div>
      <input
        value={value as string}
        onChange={(e) =>
          form.set('email', e.target.value, { touch: true, validate: true })
        }
      />
      {touched && error && <span className="error">{error}</span>}
    </div>
  )
}
```

---

## `useFormConnect` — Uncontrolled (Zero Re-render)

`useFormConnect` wires up `form.connect` inside a `useEffect` and returns a React `ref`. Attaching the ref to an input gives you full form integration with no React re-renders — ideal for inputs that fire very frequently (e.g. rich text editors, masked phone fields).

```tsx
import { useFormConnect } from '@agnostic-web/form-react'

function PhoneField({ form }: { form: typeof myForm }) {
  const ref = useFormConnect(form, 'phone', {
    persist: false,
    format: (v) => {
      const digits = String(v).replace(/\D/g, '')
      if (digits.length <= 3) return digits
      if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`
    },
  })

  return (
    <input
      ref={ref}
      type="tel"
      placeholder="(555) 000-0000"
      onInput={(e) =>
        form.set('phone', (e.target as HTMLInputElement).value, { validate: true })
      }
    />
  )
}
```

The element is disconnected automatically when the component unmounts.

---

## Full TypeScript Example

```tsx
import { createForm } from '@agnostic-web/form-core'
import { useForm, useFormPath } from '@agnostic-web/form-react'
import { zodAdapter } from '@agnostic-web/form-core'
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
  const { value, error, touched } = useFormPath(form, path)
  return (
    <label>
      {label}
      <input
        value={value as string}
        onChange={(e) => form.set(path, e.target.value, { touch: true, validate: true })}
      />
      {touched && error && <p className="error">{error}</p>}
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
