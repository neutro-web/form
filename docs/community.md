# Community

## The Neutro Ecosystem

Neutro is a collection of focused, zero-dependency primitives for the web. Each package does one thing well.

| Package | Description | Status |
|---|---|---|
| [`@neutro/form`](https://github.com/neutro-web/form) | Reactive form engine for every framework | `v0.3.0` — stable |
| `@neutro/fluid` | Physics-grounded glass material system for the web | In development |

---

## Filing Issues & Feature Requests

When contributing code, use [Conventional Commits](/contributing) format — releases are automated based on commit prefixes.

All issues and requests are tracked on GitHub.

- **Bug report** — something isn't working as documented → [Open an issue](https://github.com/neutro-web/form/issues/new)
- **Feature request** — something you'd like to see → [Open an issue](https://github.com/neutro-web/form/issues/new) with the `enhancement` label
- **Question** — not sure if it's a bug → [Start a discussion](https://github.com/neutro-web/form/discussions)

When filing a bug, please include the package version, a minimal reproduction, and what you expected vs. what happened.

---

## Support the Project

If `@neutro/form` saves you time, consider buying me a coffee. It helps keep the packages maintained and the documentation up to date.

<a href="https://buymeacoffee.com/koficodedat" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="40" />
</a>

---

## FAQ

### Core Concepts

#### Can I use the core engine without a framework adapter?

Yes. `@neutro/form/core` has zero runtime dependencies and works in any JavaScript environment — plain HTML, web components, Node.js, or alongside any UI library without an official adapter.

```ts
import { createForm } from '@neutro/form/core'

const form = createForm({ initialValues: { email: '' } })
form.subscribe(state => console.log(state.values))
```

#### Why doesn't it use a global store or context provider?

`createForm` is a closure factory. All state lives inside the closure, not in a module-level singleton. This means multiple forms on the same page never share state accidentally, SSR is safe (no state to leak between requests), and tree-shaking works naturally. You don't need to wrap your app in a Provider.

#### Can multiple forms share state?

No — and that's intentional. Each `createForm()` call produces a fully isolated instance. If you need two forms to coordinate, read values from one and pass them to the other explicitly.

---

### Validation

#### When do validation errors show up?

Controlled by `validationMode`. The default, `'onTouched'`, is silent until the user leaves a field for the first time, then switches to live keystroke feedback. See the [Validation Modes guide](/guides/validation-modes) for the full breakdown.

#### Is there a separate "re-validate mode" after submission?

No — and that's deliberate. After a failed submit, each field continues to follow its configured `validationMode`. There's no second `reValidateMode` option to keep track of. `onTouched` fields keep giving live feedback; `onSubmitOnly` fields stay quiet until the next submit.

#### How do I validate one field based on another field's value?

Use the `dependencies` config. Declare which fields trigger revalidation of other fields — the engine builds a transitive closure at init time, so no manual `trigger()` calls are ever needed.

```ts
const form = createForm({
  initialValues: { startDate: '', endDate: '' },
  dependencies: { endDate: ['startDate'] },
  validator({ startDate, endDate }) {
    const errors: Record<string, string> = {}
    if (endDate && startDate && endDate <= startDate)
      errors.endDate = 'Must be after start date'
    return errors
  },
})
```

Changing `startDate` automatically re-validates `endDate`. No wiring required.

#### How do I place a cross-field error on a specific field?

Return a `Record<string, string>` from your `validator` where the key is the field path. The error lands exactly where you put it — no `.superRefine()` or path configuration.

```ts
validator({ password, confirmPassword }) {
  if (password !== confirmPassword)
    return { confirmPassword: 'Passwords do not match' }
  return {}
}
```

#### Can I use Zod, Yup, or Valibot?

Yes — `@neutro/form/core` ships built-in adapters for all three. Pass the adapter as your `validator`:

```ts
import { createForm, zodAdapter } from '@neutro/form/core'
import { z } from 'zod'

const form = createForm({
  initialValues: { email: '', age: 0 },
  validator: zodAdapter(
    z.object({
      email: z.string().email('Must be a valid email'),
      age: z.number().min(18, 'Must be 18 or older'),
    })
  ),
})
```

Swap `zodAdapter` for `valibotAdapter` or `yupAdapter` for those libraries — the API is identical. See the [Validation Adapters reference](/api/validation) for full details.

For any schema library without a built-in adapter, wrap its parse result manually:

```ts
validator(values) {
  const result = mySchema.safeParse(values)
  if (result.success) return {}
  return Object.fromEntries(
    result.error.issues.map(i => [i.path.join('.'), i.message])
  )
}
```

#### Can I use `class-validator`?

Yes — `classValidatorAdapter` is a built-in adapter, useful in Angular projects that share DTO classes with a NestJS backend.

```ts
import { classValidatorAdapter } from '@neutro/form/core'
import { validate, IsEmail, MinLength } from 'class-validator'

class SignUpDto {
  @IsEmail({}, { message: 'Must be a valid email' })
  email!: string

  @MinLength(8, { message: 'Min 8 characters' })
  password!: string
}

const form = createForm({
  initialValues: { email: '', password: '' },
  validator: classValidatorAdapter(SignUpDto, validate),
})
```

Nested DTOs are fully supported — `ValidationError.children` is traversed recursively and errors are flattened to dot-notation paths automatically (`address.city`, `order.billing.postalCode`).

See the [Validation Adapters reference](/api/validation) for full details.

#### How do I handle async validation (e.g., check if a username is taken)?

Use an `async` validator. Each invocation gets its own `AbortController` — stale in-flight requests are cancelled automatically when the field changes again.

```ts
const form = createForm({
  initialValues: { username: '' },
  async validator({ username }, _scope, signal) {
    if (!username) return { username: 'Required' }
    const taken = await checkUsername(username, { signal })
    return taken ? { username: 'Already taken' } : {}
  },
  asyncDebounceMs: 400, // debounce before firing the request
})
```

#### How do I debounce validation to avoid firing on every keystroke?

Set `asyncDebounceMs` in the form config. The default is 300ms. Set it to `0` in tests so async validators resolve without fake timers.

#### How do I validate only specific fields?

```ts
await form.validate(['email', 'username']) // validate a subset
await form.validate()                       // validate everything
```

#### How do I conditionally require a field?

Use `requiredIf` or `requiredUnless` in the built-in rules, or express the condition in your `validator` function:

```ts
validator({ role, teamId }) {
  if (role === 'member' && !teamId)
    return { teamId: 'Required for team members' }
  return {}
}
```

#### How do I disable inline validation for a specific field?

Set `validationMode` per-field using the `fields` map:

```ts
validationMode: {
  default: 'onTouched',
  fields: { terms: 'onSubmitOnly' } // no inline validation for the checkbox
}
```

---

### Resetting & Loading Data

#### How do I populate the form with data fetched from the server?

Call `form.reset(fetchedValues)` after your data arrives. It atomically re-seeds all state — values, errors, touched, dirty — in one batch.

```ts
const user = await api.getUser(id)
form.reset(user)
```

No timing issue: `reset()` is synchronous. Calling `form.validate()` immediately after validates the new values, not the old ones.

#### How do I reset a form after a successful submit?

```ts
await form.submit(async (values) => {
  await api.save(values)
  form.reset() // back to initialValues
  // or: form.reset(newSeed) to reset to different values
})
```

#### I called `reset()` but the form still shows old errors on the next submit.

`reset()` clears all state including errors and touched. If errors reappear immediately after reset, it means validation ran again (perhaps you called `validate()` or the validation mode re-triggered on mount). Check that you're not calling `validate()` right after `reset()` when you don't intend to.

#### How do I auto-save form values to localStorage?

Use `localStorageAdapter` and call `form.hydrate()` once after mount:

```ts
import { createForm, localStorageAdapter } from '@neutro/form/core'

const form = createForm({
  initialValues: { email: '' },
  persistence: { adapter: localStorageAdapter('my-form') },
})

await form.hydrate() // call this once after mount
```

Values are written on every change (debounced to 300ms by default). `form.reset()` clears the storage slot. See the [Persistence guide](/guides/persistence) for full details.

#### How do I reset a single field to its initial value?

```ts
form.resetField('email')
```

This restores the field's value to what it was in `initialValues` (or the seed from the last `reset(newValues)` call). It clears `errors`, `touched`, and `dirty` for that path. Use options to preserve any of those:

```ts
form.resetField('email', { keepError: true })
```

For nested objects, `resetField('address')` clears all `address.*` state. For array items, `resetField('items.0.name')` clears only that leaf.

---

### Submission

#### How do I know if the form is valid without calling `validate()`?

Read `state.isValid`. It has three possible values:

- `null` — the form has not been fully validated yet (initial state or after `reset()`).
- `true` — the last full `validate()` or `submit()` found no errors.
- `false` — the last full validation found errors, or `setErrors()` injected errors.

```ts
// Conservative: disable submit until known-valid
<button disabled={state.isValid !== true}>Submit</button>

// Optimistic: only disable if known-invalid  
<button disabled={state.isValid === false}>Submit</button>
```

Scoped `form.validate(['email'])` does **not** change `isValid` — only a full `form.validate()` or `form.submit()` does.

#### How do I prevent double submission?

`state.isSubmitting` is set to `true` for the duration of the submit handler. Bind it to your button's `disabled` prop.

```ts
form.subscribe(({ isSubmitting }) => {
  submitButton.disabled = isSubmitting
})
```

#### What happens if my submit handler throws?

`form.submit()` catches the throw, sets `isSubmitting` back to `false`, and re-throws so you can handle it in the call site. The form remains in its last validated state.

#### How do I inject server-returned field errors after a failed API call?

`form.setErrors()` merges server errors into form state. They behave identically to client errors and clear on the next validation run.

```ts
await form.submit(async (values) => {
  const res = await api.register(values)
  if (!res.ok) form.setErrors(res.errors) // { email: 'Already taken' }
})
```

#### How do I submit only the fields that changed (dirty fields)?

```ts
await form.submit(async (values) => {
  const dirty = form.getState().dirty     // Record<string, boolean>
  const patch = Object.fromEntries(
    Object.entries(values).filter(([k]) => dirty[k])
  )
  await api.patch(patch)
})
```

---

### Dynamic Forms & Arrays

#### How do I add and remove fields at runtime?

Use the built-in array operations. They keep `errors`, `touched`, and `dirty` in sync with the new indices automatically — no manual index management.

```ts
import { arrayAppend, arrayRemove } from '@neutro/form/core'

arrayAppend(form, 'items', { name: '', qty: 1 })
arrayRemove(form, 'items', 2) // remove index 2; indices 3+ shift down
```

#### Does removing an item from the middle of an array shift error state correctly?

Yes. `arrayRemove` calls `shiftStateIndices` internally, renumbering all `errors.items.*`, `touched.items.*`, and `dirty.items.*` keys so that what was index 3 becomes index 2, and so on.

#### How do I handle nested arrays (e.g., invoice items, each with multiple tax lines)?

Use dot-notation paths. Array operations accept any depth:

```ts
arrayAppend(form, 'items.0.taxes', { rate: 0, label: '' })
arrayRemove(form, 'items.0.taxes', 1)
```

Validation paths follow the same notation: `'items.0.taxes.1.rate'`.

#### How do I handle conditional fields that appear and disappear?

If you're using the DOM bridge (`connect()`), the `MutationObserver` automatically removes a field's state when its element is disconnected from the DOM. Use `persistedPaths` to keep a field's value alive even when unmounted — useful for multi-step wizards.

For framework-adapter patterns without the DOM bridge, call `form.set(path, undefined)` when hiding a field to clear its value.

---

### Integration with UI Libraries

#### How do I use it with shadcn/ui, MUI, or other component libraries?

Call `form.set()` in the component's change handler and read `form.get()` (or subscribe) for the value. No wrapper component or Controller pattern is needed — the engine is fully decoupled from the DOM.

```tsx
// shadcn Select
<Select
  value={form.get('country')}
  onValueChange={(value) => form.set('country', value, { touch: true })}
/>
```

#### How do I handle `<input type="number">`?

Convert the string to a number in your `set()` call. Since you explicitly call `set()`, there's no hidden coercion — you control the type.

```ts
input.addEventListener('input', (e) => {
  form.set('age', Number((e.target as HTMLInputElement).value), { touch: true })
})
```

`state.values.age` will be a `number`, not a string.

#### How do I handle file inputs?

`form.set('avatar', fileInput.files[0])` stores the `File` object in form state. Validate it in your `validator` function:

```ts
validator({ avatar }) {
  if (!avatar) return { avatar: 'Required' }
  if (avatar.size > 5 * 1024 * 1024) return { avatar: 'Max 5 MB' }
  return {}
}
```

After `form.reset()`, clear the file input element separately — browsers do not allow programmatic filename clearing:

```ts
form.reset()
fileInputRef.current.value = ''
```

#### How do I validate file inputs?

Use the built-in file rules:

```ts
rules: {
  avatar: [
    'required',
    { maxFileSize: 5 * 1024 * 1024, message: 'Max 5 MB' },
    { fileTypes: ['image/jpeg', 'image/png', 'image/webp'] },
  ],
  attachments: [
    { minFiles: 1, message: 'Attach at least one file' },
    { maxFiles: 3 },
  ],
}
```

For `FileList` inputs (the value of `input.files`), use `minFiles: 1` rather than `'required'` — it is clearer about intent. A bare `File` value is counted as 1 by `maxFiles` and `minFiles`.

---

### Performance

#### Will using `useForm()` in my component re-render it on every keystroke?

If you subscribe to the whole form state (`useForm()`, `form.subscribe()`), yes — any state change triggers a re-render. For field-level rendering, use `useFormPath()` (or `form.subscribeToPath()`) instead, which only fires when that specific path's state changes.

General pattern: use `useForm()` for form-level concerns (submit button disabled state, error summary) and `useFormPath()` per field for everything else.

#### Are array operations (append, remove, move) efficient?

Array operations run inside `batch()`, so all index-shifting happens before subscribers are notified. Subscribers receive a single notification regardless of how many keys were renumbered. This avoids the cascade of intermediate re-renders that uncoordinated mutations cause.

---

### TypeScript

#### How do I make the form fully typed?

Pass your values interface as the generic to `createForm<T>`:

```ts
interface SignupValues {
  email: string
  username: string
  age: number
}

const form = createForm<SignupValues>({
  initialValues: { email: '', username: '', age: 0 },
})
```

The returned `FormInstance<T>` carries all type information throughout its lifetime. You do not need to re-specify the generic at every call site.

#### Does TypeScript catch typos in field paths?

Partially — path typos themselves are not caught, but value-type mismatches on known paths are.

**What works:**
- `form.get('email')` returns `string` — the returned value is fully typed.
- `form.set('email', 42)` is a TypeScript error — `number` is not assignable to `string`.
- `form.arrayAppend('items', 'wrong')` is a TypeScript error — `string` is not assignable to the element type.
- IDE autocomplete surfaces available paths and expected value types.

**What doesn't work:**
- Path typos: `form.set('emal', value)` compiles without error — if the path isn't in `Path<T>`, it falls to the loose fallback with `val: unknown`.
- Dynamic paths: `const p: string = ...; form.set(p, 42)` compiles — TypeScript can't know the type when the path is computed at runtime.

#### Why doesn't `form.set('emal', value)` produce a TypeScript error?

By design — to preserve dynamic path support.

The typed overload uses `Path<T> | (string & {})` as its path constraint. The `(string & {})` part is an intentional escape hatch that lets dynamic computed paths compile:

```ts
const field = condition ? 'email' : 'username' // type: string
form.set(field, value) // ✅ still works
```

Without that escape hatch, any path stored in a `string` variable would require an explicit cast (`form.set(field as Path<typeof form>, value)`). Removing it would catch typos but break a common usage pattern. Fully strict path checking — catching typos without losing dynamic paths — is a harder TypeScript problem and is on the roadmap.

---

### Testing

#### How do I test form logic without rendering a component?

Use `@neutro/form/testing`. `createFormFixture()` wraps a real form instance with test helpers and sets `asyncDebounceMs: 0` so async validators resolve without fake timers.

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

#### Do I need to mock the library in tests?

No. The testing package works with real form instances — no mocking, no React rendering, no Provider. `createFormFixture` gives you full control over a form's lifecycle in a few lines.

#### My framework-adapter tests show `act()` warnings.

The core engine is synchronous — no `act()` required for core logic. For framework-adapter tests (React components that render form state), wrap interactions in `await userEvent.*` and assertions in `waitFor()` as you would with any async state update.

---

### SSR & React Native

#### Does it work with Next.js / Nuxt / SvelteKit (SSR)?

Yes. `createForm` is a closure with no module-level state — there is nothing to leak between server requests. Each call produces a fully isolated instance. The engine itself is SSR-safe; instantiate it in your component's setup code as you normally would.

#### Does it work with React Native?

The core engine and React adapter work in React Native — use `form.set('field', value)` in `TextInput`'s `onChangeText` and `form.get('field')` for the `value` prop.

The DOM bridge (`connect()`) requires an `HTMLElement` and does not apply in React Native. There is no official React Native adapter today.

---

### Honest Gaps

These are things `@neutro/form` does not do cleanly yet. They are not workarounds — if your project needs them, know this going in.

**Strongly typed field paths — path typos not caught (intentional)** — `form.set('emal', value)` compiles without error. Catching path typos would require removing the dynamic-path escape hatch, which would break `const p: string = ...; form.set(p, value)`. The current design preserves dynamic paths at the cost of not catching typos. Fully strict path checking is on the roadmap.

**React Native adapter** — the core works but there is no official adapter with RN-idiomatic patterns.

