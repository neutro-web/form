# @neutro/form

Framework-agnostic form state management. One closure factory — `createForm` — that handles validation, async checks, array operations, and DOM binding. Thin reactive adapters for React, Vue, Svelte, SolidJS, and Angular wrap the same engine.

## Install

```bash
npm install @neutro/form
```

## Usage

### Vanilla / framework-agnostic

```ts
import { createForm } from '@neutro/form/core'

const form = createForm({
  initialValues: { email: '', password: '' },
  rules: {
    email: ['required', 'email'],
    password: ['required', { minLength: 8 }],
  },
})

form.set('email', 'user@example.com', { touch: true, validate: true })
const isValid = await form.validate()
```

### React

```tsx
import { createForm } from '@neutro/form/core'
import { useForm, useFormPath } from '@neutro/form/adapters/react'

const form = createForm({ initialValues: { name: '' } })

function NameField() {
  const name = useFormPath(form, 'name')
  const { errors, touched } = useForm(form)
  return (
    <input
      value={name}
      onChange={e => form.set('name', e.target.value, { touch: true, validate: true })}
    />
  )
}
```

### Vue

```ts
import { createForm } from '@neutro/form/core'
import { useVueForm } from '@neutro/form/adapters/vue'
```

### Svelte

```ts
import { createForm } from '@neutro/form/core'
import { useSvelteForm } from '@neutro/form/adapters/svelte'
```

### SolidJS

```ts
import { createForm } from '@neutro/form/core'
import { useSolidForm } from '@neutro/form/adapters/solid'
```

### Angular

```ts
import { createForm } from '@neutro/form/core'
import { useAngularForm } from '@neutro/form/adapters/angular'
```

## Import paths

| Path | Exports |
|---|---|
| `@neutro/form/core` | `createForm`, validation adapters, types |
| `@neutro/form/adapters/react` | `useForm`, `useFormPath`, `useFormConnect` |
| `@neutro/form/adapters/vue` | `useVueForm`, `useVueFormPath` |
| `@neutro/form/adapters/svelte` | `useSvelteForm`, `useSvelteFormPath` |
| `@neutro/form/adapters/solid` | `useSolidForm`, `useSolidFormPath` |
| `@neutro/form/adapters/angular` | `useAngularForm`, `useAngularFormPath` |

## Docs

Full documentation, API reference, and live playground at **https://neutro-web.github.io/form/**.

## License

MIT
