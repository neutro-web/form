# Community

## The Neutro Ecosystem

Neutro is a collection of focused, zero-dependency primitives for the web. Each package does one thing well.

| Package | Description | Status |
|---|---|---|
| [`@neutro/form`](https://github.com/neutro-web/form) | Reactive form engine for every framework | `v0.1.0` — stable |
| `@neutro/fluid` | Physics-grounded glass material system for the web | In development |

---

## Filing Issues & Feature Requests

All issues and requests are tracked on GitHub.

- **Bug report** — something isn't working as documented → [Open an issue](https://github.com/neutro-web/form/issues/new)
- **Feature request** — something you'd like to see → [Open an issue](https://github.com/neutro-web/form/issues/new) and use the `enhancement` label
- **Question** — not sure if it's a bug → [Start a discussion](https://github.com/neutro-web/form/discussions)

When filing a bug, please include:
- The package version (`@neutro/form` or `@neutro/form-core` version)
- A minimal reproduction (a playground link or a short snippet)
- What you expected vs. what actually happened

---

## Support the Project

If `@neutro/form` saves you time, consider buying me a coffee. It helps me keep the packages maintained and the documentation up to date.

<a href="https://buymeacoffee.com/koficodedat" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="40" />
</a>

---

## FAQ

### Can I use the core engine without a framework adapter?

Yes. `@neutro/form-core` (or `@neutro/form/core`) has zero runtime dependencies and works in any JavaScript environment — plain HTML, web components, Node.js, or alongside any UI library that isn't covered by an official adapter.

```ts
import { createForm } from '@neutro/form/core'

const form = createForm({ initialValues: { email: '' } })
form.subscribe(state => console.log(state))
```

### What's the difference between `@neutro/form` and `@neutro/form-core`?

`@neutro/form-core` is the standalone core package published separately. `@neutro/form` is an alias package whose exports map re-routes `@neutro/form/core`, `@neutro/form/adapters/react`, etc. to the individual scoped packages. You can use either — they resolve to the same code.

### Does it work with TypeScript?

Yes, fully. `createForm<T>` is generic over your values shape. All state, paths, validators, and return types are inferred from `T`.

```ts
interface SignupValues {
  email: string
  username: string
}

const form = createForm<SignupValues>({
  initialValues: { email: '', username: '' },
})

form.get('email') // string
```

### Can I use Zod or Yup for validation?

Yes — through the `validator` function or the built-in adapter helpers. Pass a `validator` that wraps your schema's parse/safeParse method and returns a `Record<string, string>` of errors.

```ts
import { z } from 'zod'

const schema = z.object({ email: z.string().email() })

const form = createForm({
  initialValues: { email: '' },
  validator(values) {
    const result = schema.safeParse(values)
    if (result.success) return {}
    return Object.fromEntries(
      result.error.issues.map(i => [i.path.join('.'), i.message])
    )
  },
})
```

### How do I handle server-side validation errors?

Use `form.setErrors()` after a failed API call. Server errors land in `state.errors` exactly like client errors and clear on the next validation run.

```ts
await form.submit(async (values) => {
  const res = await api.register(values)
  if (!res.ok) {
    form.setErrors(res.errors) // { email: 'Already taken' }
  }
})
```

See the [setErrors section](/api/core#seterrors) in the Core API reference.

### What's the difference between `onTouched` and `onBlur` validation modes?

Both show the first error when the user leaves the field. The difference is what happens after:

- **`onTouched`** (default) — upgrades to live keystroke feedback after the first blur. Errors clear the moment the input becomes valid.
- **`onBlur`** — stays blur-only forever. The user must leave the field again to see the error clear.

See the [Validation Modes guide](/guides/validation-modes) for a full breakdown.

### How do I test forms?

Use `@neutro/form-testing`. It provides `fillForm`, `blurField`, `triggerValidation`, and `createFormFixture` — utilities designed for unit testing form logic without a DOM.

```ts
import { createFormFixture } from '@neutro/form/testing'

const fx = createFormFixture({
  initialValues: { email: '' },
  rules: { email: ['required', 'email'] },
})

fx.fill({ email: 'bad' })
await fx.validate()
expect(fx.form.getState().errors.email).toBe('Invalid email')

fx.cleanup()
```

See the [Testing package API](/api/testing) for the full reference.

### Why doesn't it use a global store?

`createForm` is a closure factory — all state lives inside the closure, not in a singleton or module-level store. This means:

- Multiple forms on the same page never share state accidentally
- SSR is safe — no module-level state to leak between requests
- Tree-shaking works naturally — you only pay for what you use

### What browsers are supported?

Any browser that supports ES2022 and `WeakRef`. That covers all modern browsers (Chrome 84+, Firefox 79+, Safari 14.1+, Edge 84+). The core engine has no polyfill requirements.
