# Svelte 5 Guide

```sh
npm install @neutro/form
# pnpm add @neutro/form
# yarn add @neutro/form
```

## Hook Overview

| Hook | Returns | Best for |
|---|---|---|
| `useSvelteForm` | Svelte readable of full `FormState<T>` | Submit button, form-level status |
| `useSvelteFormPath` | Svelte readable of `{ value, error, touched, dirty }` | Individual field components |

> **Important:** Call both hooks during component initialisation — not inside event handlers or `setTimeout`. They call `onDestroy` internally to unsubscribe, which requires a live Svelte component context.

---

## `useSvelteForm` — Global State

```svelte
<script lang="ts">
  import { createForm } from '@neutro/form/core'
  import { useSvelteForm } from '@neutro/form/adapters/svelte'

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

  // Returns a Svelte readable store
  const state = useSvelteForm(form)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    await form.validate()
  }
</script>

<form on:submit={handleSubmit}>
  <input
    value={$state.values.email}
    on:input={(e) => form.set('email', e.currentTarget.value, { touch: true })}
  />
  {#if $state.errors.email}
    <span class="error">{$state.errors.email}</span>
  {/if}

  <input
    type="password"
    value={$state.values.password}
    on:input={(e) => form.set('password', e.currentTarget.value, { touch: true })}
  />
  {#if $state.errors.password}
    <span class="error">{$state.errors.password}</span>
  {/if}

  <button type="submit" disabled={$state.isSubmitting}>
    {$state.isSubmitting ? 'Signing in…' : 'Sign in'}
  </button>
</form>
```

---

## `useSvelteFormPath` — Single Field Store

`useSvelteFormPath` returns a readable store that updates only when the specified path changes. Use the `$field` shorthand to access `value`, `error`, `touched`, and `dirty` reactively.

```svelte
<script lang="ts">
  import { createForm } from '@neutro/form/core'
  import { useSvelteFormPath } from '@neutro/form/adapters/svelte'

  export let form: ReturnType<typeof createForm>
  export let path: string
  export let label: string

  // Call at component init — not inside an event handler
  const field = useSvelteFormPath(form, path)
</script>

<label>
  {label}
  <input
    value={$field.value}
    on:input={(e) =>
      form.set(path, e.currentTarget.value, { touch: true, validate: true })
    }
  />
  {#if $field.fieldState?.touched && $field.fieldState?.error}
    <span class="error">{$field.fieldState?.error}</span>
  {/if}
</label>
```

---

## Full Example with Zod

```svelte
<script lang="ts">
  import { createForm } from '@neutro/form/core'
  import { zodAdapter } from '@neutro/form/core'
  import { useSvelteForm, useSvelteFormPath } from '@neutro/form/adapters/svelte'
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

  const state = useSvelteForm(form)
  const username = useSvelteFormPath(form, 'username')
  const email = useSvelteFormPath(form, 'email')
</script>

<form on:submit|preventDefault={() => form.validate()}>
  <label>
    Username
    <input
      value={$username.value}
      on:input={(e) => form.set('username', e.currentTarget.value, { touch: true, validate: true })}
    />
    {#if $username.touched && $username.error}
      <span>{$username.error}</span>
    {/if}
  </label>

  <label>
    Email
    <input
      type="email"
      value={$email.value}
      on:input={(e) => form.set('email', e.currentTarget.value, { touch: true, validate: true })}
    />
    {#if $email.touched && $email.error}
      <span>{$email.error}</span>
    {/if}
  </label>

  <button type="submit" disabled={$state.isSubmitting}>Save</button>
</form>
```

---

## Lifecycle Notes

- Both hooks register an `onDestroy` callback to call the form's unsubscribe function. This requires that they are called synchronously during component initialisation.
- If you need to create the form and its stores lazily (e.g. based on a prop that arrives asynchronously), create the form instance outside the component and pass it in as a prop.
- The returned stores are standard Svelte readable stores — you can derive from them with `derived()` exactly as you would any other store.
