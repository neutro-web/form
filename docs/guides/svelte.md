# Svelte 5 Guide

> **v0.4 note:** Adapter hooks still accept `string` for path parameters. Strict adapter path types arrive in v0.5.

```sh
npm install @neutro/form
# pnpm add @neutro/form
# yarn add @neutro/form
```

## Hook Overview

| Hook | Returns | Best for |
|---|---|---|
| `useSvelteForm` | `{ state: Readable<FormState<T>>, ...methods }` | Submit button, form-level status |
| `useSvelteFormPath` | `Readable<{ value, fieldState: { error?, touched?, dirty? } }>` | Individual field components |

> **Important:** Call both hooks during component initialisation — not inside event handlers or `setTimeout`. The returned stores automatically unsubscribe when the last reactive consumer detaches (Svelte's built-in `readable()` cleanup), so no manual teardown is needed.

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

  // Destructure state (the Svelte readable) — use $state in templates
  const { state } = useSvelteForm(form)

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

`useSvelteFormPath` returns a readable store of `{ value, fieldState }`. Use the `$field` shorthand in templates: `$field.value` for the field's current value, `$field.fieldState?.error` / `$field.fieldState?.touched` for validation state.

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

  const { state } = useSvelteForm(form)
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
    {#if $username.fieldState?.touched && $username.fieldState?.error}
      <span>{$username.fieldState?.error}</span>
    {/if}
  </label>

  <label>
    Email
    <input
      type="email"
      value={$email.value}
      on:input={(e) => form.set('email', e.currentTarget.value, { touch: true, validate: true })}
    />
    {#if $email.fieldState?.touched && $email.fieldState?.error}
      <span>{$email.fieldState?.error}</span>
    {/if}
  </label>

  <button type="submit" disabled={$state.isSubmitting}>Save</button>
</form>
```

---

## Lifecycle Notes

- Cleanup is handled automatically via Svelte's `readable()` stop mechanism — no manual teardown or `onDestroy` registration is required.
- Both hooks must be called synchronously during component initialisation (not inside event handlers or `setTimeout`).
- If you need to create the form and its stores lazily (e.g. based on a prop that arrives asynchronously), create the form instance outside the component and pass it in as a prop.
- The returned stores are standard Svelte readable stores — you can derive from them with `derived()` exactly as you would any other store.

---

## Handling Server Errors

Use `form.setErrors()` inside your submit handler to feed API validation errors back into form state. They surface in `$state.errors` and clear on the next validation run — no extra wiring required.

```svelte
<script lang="ts">
  import { createForm } from '@neutro/form/core'
  import { useSvelteForm } from '@neutro/form/adapters/svelte'

  const form = createForm({
    initialValues: { email: '', username: '' },
    rules: { email: ['required', 'email'], username: 'required' },
  })

  const { state } = useSvelteForm(form)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    const valid = await form.validate()
    if (!valid) return

    const res = await fetch('/api/register', {
      method: 'POST',
      body: JSON.stringify(form.getPayload()),
    })
    if (!res.ok) {
      const { errors } = await res.json()
      form.setErrors(errors)
    }
  }
</script>

<form on:submit={handleSubmit}>
  <input
    value={$state.values.email}
    on:input={(e) => form.set('email', e.currentTarget.value, { touch: true })}
  />
  {#if $state.touched.email && $state.errors.email}
    <span class="error">{$state.errors.email}</span>
  {/if}

  <input
    value={$state.values.username}
    on:input={(e) => form.set('username', e.currentTarget.value, { touch: true })}
  />
  {#if $state.touched.username && $state.errors.username}
    <span class="error">{$state.errors.username}</span>
  {/if}

  <button type="submit" disabled={$state.isSubmitting}>Register</button>
</form>
```

## Resetting a Single Field

Call `form.resetField(path)` to reset one field. The Svelte store updates reactively through the subscription:

```svelte
<script>
  import { createForm } from '@neutro/form/core'
  import { useSvelteForm } from '@neutro/form/adapters/svelte'
  const form = createForm({ initialValues: { email: '' } })
  const { state, resetField } = useSvelteForm(form)
</script>

<input bind:value={$state.values.email} />
{#if $state.errors.email}
  <button on:click={() => resetField('email')}>Reset</button>
{/if}
```

---

## `useSvelteWatch` — Observe Field Values

```svelte
<script>
  import { useSvelteWatch } from '@neutro/form/adapters/svelte'
  const watched = useSvelteWatch(form, ['email', 'username'])
</script>

<p>{$watched.email} — {$watched.username}</p>
```

`useSvelteWatch` returns a `Readable` store. Use the `$watched` shorthand in templates to auto-subscribe.

---

## Validation Modes

Configure when validation triggers globally and per field via `validationMode` in `createForm`:

```ts
const form = createForm({
  initialValues: { email: '', password: '' },
  validationMode: {
    default: 'onTouched',
    fields: { password: 'onChange' },
  },
})
```

For Svelte reactive inputs, use `form.getFieldMode(path)` to wire the right events:

```svelte
<script>
  const { state, set, validate } = useSvelteForm(form)

  function handleInput(path, value) {
    set(path, value)
    if (form.getFieldMode(path) === 'onChange') validate([path])
  }

  function handleBlur(path) {
    const mode = form.getFieldMode(path)
    if (mode === 'onBlur' || mode === 'onTouched') validate([path])
  }
</script>

<input
  value={$state.values.email}
  on:input={e => handleInput('email', e.target.value)}
  on:blur={() => handleBlur('email')}
/>
```
