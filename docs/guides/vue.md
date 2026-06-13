# Vue 3 Guide

```sh
npm install @neutro/form
# pnpm add @neutro/form
# yarn add @neutro/form
```

## Hook Overview

| Hook | Returns | Best for |
|---|---|---|
| `useVueForm` | `{ state: Readonly<Ref<FormState<T>>>, ...methods }` | Submit button, form-level status |
| `useVueFormPath` | `{ value: Readonly<Ref>, fieldState: Readonly<Ref<{ error?, touched?, dirty? }>> }` | Individual field components |

Both hooks call `onUnmounted` to clean up their subscriptions automatically.

---

## `useVueForm` — Global State

```vue
<script setup lang="ts">
import { createForm } from '@neutro/form/core'
import { useVueForm } from '@neutro/form/adapters/vue'

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

// Destructure state (readonly ShallowRef) — Vue auto-unwraps it in the template
const { state } = useVueForm(form)

async function handleSubmit() {
  await form.validate()
}
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <input
      :value="state.values.email"
      @input="form.set('email', ($event.target as HTMLInputElement).value, { touch: true })"
    />
    <span v-if="state.errors.email">{{ state.errors.email }}</span>

    <input
      type="password"
      :value="state.values.password"
      @input="form.set('password', ($event.target as HTMLInputElement).value, { touch: true })"
    />
    <span v-if="state.errors.password">{{ state.errors.password }}</span>

    <button type="submit" :disabled="state.isSubmitting">
      {{ state.isSubmitting ? 'Signing in…' : 'Sign in' }}
    </button>
  </form>
</template>
```

---

## `useVueFormPath` — Single Field Ref

`useVueFormPath` accepts a `MaybeRef<string>` path, which means you can pass a plain string or a computed/reactive ref. When the path ref changes value (e.g. inside a `v-for` loop), the hook seamlessly re-subscribes to the new path.

```vue
<script setup lang="ts">
import { useVueFormPath } from '@neutro/form/adapters/vue'

const props = defineProps<{
  form: ReturnType<typeof createForm>
  path: string
  label: string
}>()

// path can be a plain string or a computed ref
const field = useVueFormPath(props.form, () => props.path)
</script>

<template>
  <label>
    {{ label }}
    <input
      :value="field.value"
      @input="props.form.set(props.path, ($event.target as HTMLInputElement).value, {
        touch: true,
        validate: true,
      })"
    />
    <span v-if="field.fieldState?.touched && field.fieldState?.error" class="error">{{ field.fieldState?.error }}</span>
  </label>
</template>
```

---

## Dynamic Paths in `v-for`

Because `useVueFormPath` accepts `MaybeRef<string>`, you can pass a computed path for dynamic array fields:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useVueFormPath } from '@neutro/form/adapters/vue'

const props = defineProps<{
  form: ReturnType<typeof createForm>
  index: number
}>()

const cityPath = computed(() => `destinations.${props.index}.city`)
const city = useVueFormPath(props.form, cityPath)
</script>

<template>
  <input
    :value="city.value"
    @input="
      props.form.set(cityPath, ($event.target as HTMLInputElement).value, {
        touch: true,
        validate: true,
      })
    "
  />
  <span v-if="city.fieldState?.error">{{ city.fieldState?.error }}</span>
</template>
```

---

## Full Example with Zod

```vue
<script setup lang="ts">
import { createForm } from '@neutro/form/core'
import { zodAdapter } from '@neutro/form/core'
import { useVueForm, useVueFormPath } from '@neutro/form/adapters/vue'
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

const { state } = useVueForm(form)
const username = useVueFormPath(form, 'username')
const email = useVueFormPath(form, 'email')
</script>

<template>
  <form @submit.prevent="form.validate()">
    <label>
      Username
      <input
        :value="username.value"
        @input="form.set('username', ($event.target as HTMLInputElement).value, {
          touch: true, validate: true
        })"
      />
      <span v-if="username.fieldState?.touched && username.fieldState?.error">{{ username.fieldState?.error }}</span>
    </label>

    <label>
      Email
      <input
        type="email"
        :value="email.value"
        @input="form.set('email', ($event.target as HTMLInputElement).value, {
          touch: true, validate: true
        })"
      />
      <span v-if="email.fieldState?.touched && email.fieldState?.error">{{ email.fieldState?.error }}</span>
    </label>

    <button type="submit" :disabled="state.isSubmitting">Save</button>
  </form>
</template>
```

---

## Return Shape Reference

`useVueForm(form)` returns `{ state, get, set, connect, submit, handleSubmit, reset, batch, arrayAppend, arrayInsert, arrayRemove, arrayMove, arraySwap }`. Destructure `state` to get the reactive `ShallowRef<FormState<T>>` — Vue auto-unwraps it in templates so `state.values.email` works without `.value`.

`useVueFormPath(form, path)` returns `{ value, fieldState }` — both are readonly refs. `value` holds the field's current value; `fieldState` holds `{ error?, touched?, dirty? }` or `null`. Access them as `field.value` and `field.fieldState?.error` in templates (Vue unwraps the refs automatically).

Attempting to mutate either ref directly produces a Vue warning in development. All mutations go through the form methods — the refs are read-only so the engine remains the single source of truth.
