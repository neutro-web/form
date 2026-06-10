# Core API — `createForm`

```ts
import { createForm } from '@agw/form/core'
```

## `FormConfig<T>`

```ts
interface FormConfig<T> {
  /** Initial field values. Defines the shape of the form. */
  initialValues: T

  /**
   * Built-in validation rules per field path.
   * Rule names or option objects — no external schema library required.
   *
   * @example { email: ['required', 'email'], age: [{ min: 0 }, { max: 120 }] }
   */
  rules?: Partial<Record<string, BuiltInRule | BuiltInRule[]>>

  /**
   * Validator function. May be sync or async.
   * Return a Record<string, string> where keys are dot-notation field paths
   * and values are error messages. An empty object (or undefined) means valid.
   * Errors from this function take precedence over built-in rules for the same field.
   *
   * @param values     - current form values snapshot
   * @param scopePaths - field paths being validated in this invocation
   * @param signal     - AbortSignal; abort if the field changes before this resolves
   */
  validator?: (
    values: T,
    scopePaths?: string[],
    signal?: AbortSignal
  ) => Record<string, string> | Promise<Record<string, string>>

  /**
   * Cross-field dependency map.
   * Key: the field path that, when changed, should also trigger validation of the values.
   * Values: array of dependent field paths (transitive closure computed at init).
   *
   * @example { password: ['confirmPassword'] }
   */
  dependencies?: Record<string, string[]>

  /**
   * Milliseconds to debounce async validation per scope.
   * @default 300
   */
  asyncDebounceMs?: number
}
```

## `FormState<T>`

```ts
interface FieldState {
  error: string | undefined
  touched: boolean
  dirty: boolean
}

interface FormState<T> {
  values: T
  errors: Record<string, string>
  touched: Record<string, boolean>
  dirty: Record<string, boolean>
  isSubmitting: boolean
  isValidating: boolean
}
```

## `createForm<T>(config)`

Returns a `FormInstance<T>` object. All state is private to the returned closure.

```ts
const form = createForm<MyValues>({ initialValues: { ... } })
```

---

## Methods

### `form.get(path)`

```ts
form.get(path: string): unknown
```

Returns the current value at the given dot-notation path. Supports array index notation (`items.0.name`).

```ts
const email = form.get('email')
const firstItem = form.get('items.0.label')
```

---

### `form.set(path, value, options?)`

```ts
form.set(
  path: string,
  value: unknown,
  options?: { touch?: boolean; validate?: boolean }
): void
```

Sets the value at `path`. By default, does not mark the field as touched and does not trigger validation.

| Option | Default | Description |
|---|---|---|
| `touch` | `false` | Mark the field as touched |
| `validate` | `false` | Trigger validation after the mutation |

```ts
form.set('email', 'alice@example.com', { touch: true, validate: true })
```

---

### `form.validate(paths?)`

```ts
form.validate(paths?: string[]): Promise<boolean>
```

Runs the validator. When `paths` is provided, only those paths (plus their computed dependents) are validated. When omitted, all fields are validated.

```ts
// Validate everything
await form.validate()

// Validate only step-1 fields
await form.validate(['firstName', 'lastName', 'email'])
```

---

### `form.subscribe(fn)`

```ts
form.subscribe(fn: (state: FormState<T>) => void): () => void
```

Registers a global subscriber that receives the full `FormState<T>` on every mutation. Returns an unsubscribe function.

```ts
const unsub = form.subscribe((state) => {
  submitButton.disabled = state.isSubmitting || Object.keys(state.errors).length > 0
})
// later:
unsub()
```

---

### `form.subscribeToPath(path, fn)`

```ts
form.subscribeToPath(
  path: string,
  fn: (value: unknown, fieldState: FieldState) => void
): () => void
```

Registers a path-level subscriber. `fn` is called only when the value or field state at `path` changes. Returns an unsubscribe function.

The wildcard path `'*'` receives every path notification.

```ts
const unsub = form.subscribeToPath('email', (value, { error, touched }) => {
  errorEl.textContent = touched ? (error ?? '') : ''
})
```

---

### `form.connect(path, element, options?)`

```ts
form.connect(
  path: string,
  element: HTMLElement,
  options?: ConnectOptions
): () => void
```

Links an `HTMLElement` to a form field path. See [DOM Connect Bridge](/api/connect) for full documentation.

---

### `form.getPayload()`

```ts
form.getPayload(): Partial<T>
```

Returns a partial values object containing only the paths that are currently connected to a live DOM element or were connected with `persist: true`. Useful for collecting only the visible step's data in a multi-step form.

---

### `form.getState()`

```ts
form.getState(): FormState<T>
```

Returns a full snapshot of the current form state. The returned object is a plain value — mutating it has no effect on the form.

---

### `form.batch(fn)`

```ts
form.batch(fn: () => void): void
```

Runs `fn` synchronously with notifications deferred until the function returns. Useful when making multiple mutations that should appear as a single update to subscribers.

```ts
form.batch(() => {
  form.set('firstName', 'Alice')
  form.set('lastName', 'Smith')
  form.set('role', 'admin')
})
// subscribers are notified once, after all three sets
```

---

### `form.reset(newValues?)`

```ts
form.reset(newValues?: T): void
```

Resets the form to its initial state. If `newValues` is provided, those values become both the current values and the new baseline for dirty tracking.

```ts
form.reset()                          // back to original initialValues
form.reset({ email: 'new@ex.com' })   // re-seed with new values
```

---

### `form.submit(onValid)`

```ts
form.submit(onValid: (payload: Partial<T>) => void | Promise<void>): Promise<boolean>
```

Validates the entire form and, if valid, calls `onValid` with the current payload. Returns `true` on success, `false` if validation failed or the form is already submitting. Sets `isSubmitting = true` while running.

```ts
const ok = await form.submit(async (payload) => {
  await fetch('/api/save', { method: 'POST', body: JSON.stringify(payload) })
})
if (!ok) console.log('Validation failed:', form.getState().errors)
```

---

### `form.handleSubmit(onValid, onInvalid?)`

```ts
form.handleSubmit(
  onValid: (payload: Partial<T>) => void | Promise<void>,
  onInvalid?: (errors: Record<string, string>) => void
): (e?: Event) => void
```

Convenience wrapper that creates an event handler. Calls `e.preventDefault()` when passed an `Event`, then delegates to `form.submit`. Suitable for attaching directly to `<form onSubmit>`.

```ts
// Vanilla JS
formEl.addEventListener('submit', form.handleSubmit(
  (payload) => fetch('/api/save', { body: JSON.stringify(payload) }),
  (errors) => console.log('Invalid:', errors)
))

// React
<form onSubmit={form.handleSubmit(onValid, onInvalid)}>
```

---

### `form.destroy()`

```ts
form.destroy(): void
```

Clears all subscriptions, cancels any in-flight async validators, disconnects the `MutationObserver`, and empties the connection registry. Call this when the form is permanently removed from the UI.

---

### `form.arrayAppend(path, item)`

```ts
form.arrayAppend(path: string, item: unknown): void
```

Appends an item to the array at `path`. See [Array Operations](/api/array-operations).

---

### `form.arrayInsert(path, index, item)`

```ts
form.arrayInsert(path: string, index: number, item: unknown): void
```

Inserts an item at `index`, shifting subsequent items and their field state down by one.

---

### `form.arrayRemove(path, index)`

```ts
form.arrayRemove(path: string, index: number): void
```

Removes the item at `index`, shifting subsequent items and their field state up by one.

---

### `form.arrayMove(path, from, to)`

```ts
form.arrayMove(path: string, from: number, to: number): void
```

Moves the item at `from` to `to`, remapping field state for all items in the affected window.

---

### `form.arraySwap(path, i, j)`

```ts
form.arraySwap(path: string, i: number, j: number): void
```

Swaps the items at indices `i` and `j`, swapping their field state as well.

---

## `BuiltInRule`

The full union type accepted by the `rules` config. Single rules or arrays of rules can be assigned per field path.

```ts
const form = createForm({
  initialValues: { email: '', age: 0, confirmEmail: '' },
  rules: {
    email:        ['required', 'email'],
    age:          [{ min: 18 }, { max: 120 }],
    confirmEmail: { matches: 'email', message: 'Emails do not match' },
  },
})
```

See [Getting Started → Built-in Validation Rules](/getting-started#built-in-validation-rules) for the full rule reference table.
