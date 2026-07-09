# Core API — `createForm`

```ts
import { createForm } from '@neutro/form/core'
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
  rules?: Partial<Record<Path<T> | (string & {}), BuiltInRule | BuiltInRule[]>>

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

  /**
   * Validation trigger mode. Controls when validation runs for fields connected
   * via `form.connect()`. Pass a bare string to apply one mode globally, or an
   * object with `default` and per-field `fields` overrides.
   *
   * | Mode | Validates on |
   * |---|---|
   * | `'onTouched'` | first blur, then every keystroke (default) |
   * | `'onChange'` | every keystroke from the first character |
   * | `'onBlur'` | every blur, no keystroke feedback |
   * | `'onSubmitOnly'` | submit only — no inline validation |
   *
   * See the [Validation Modes guide](/guides/validation-modes) for a detailed
   * comparison and guidance on when to use each mode.
   *
   * @default 'onTouched'
   *
   * @example
   * // Global mode
   * validationMode: 'onBlur'
   *
   * @example
   * // Mixed: default onTouched, password immediate, terms submit-only
   * validationMode: {
   *   default: 'onTouched',
   *   fields: { password: 'onChange', terms: 'onSubmitOnly' }
   * }
   */
  validationMode?: ValidationMode | {
    default?: ValidationMode
    fields?: Record<string, ValidationMode>
  }

  /**
   * Derived fields evaluated after every mutation.
   * Each leaf has the shape `{ fn: (values: T) => V; transient?: boolean }`.
   * Nested object notation mirrors `initialValues`.
   */
  computed?: ComputedConfig<T>

  /**
   * Maximum evaluation passes per `set()` call before the circular-dependency warning fires.
   * @default 5
   */
  computedPassLimit?: number

  /**
   * Controls when unknown-path warnings fire.
   * `'dev'` warns only when `NODE_ENV !== 'production'`.
   * `'always'` warns regardless of environment.
   * `'off'` disables the trie entirely.
   * @default 'dev'
   */
  pathValidation?: 'dev' | 'always' | 'off'

  /**
   * Called after the submit handler resolves successfully.
   * If it throws, the error is logged and the successful submission is not reversed.
   */
  onSubmitSuccess?: (payload: Partial<T>) => void | Promise<void>

  /**
   * Called when the submit handler rejects.
   * The original error is re-thrown after the hook runs.
   */
  onSubmitError?: (error: unknown, payload: Partial<T>) => void | Promise<void>
}
```

### Submission Lifecycle Hooks

| Option | Type | Default | Description |
|---|---|---|---|
| `onSubmitSuccess` | `(payload: Partial<T>) => void \| Promise<void>` | `undefined` | Called after the submit handler resolves. If it throws, the error is logged and the successful submission is not reversed. |
| `onSubmitError` | `(error: unknown, payload: Partial<T>) => void \| Promise<void>` | `undefined` | Called when the submit handler rejects. The original error is re-thrown after the hook runs. |

### `computed`

```ts
computed?: ComputedConfig<T>
```

Derived fields evaluated after every mutation. Each leaf node has the shape `{ fn: (values: T) => V; transient?: boolean }`. Nested object notation mirrors `initialValues`. See the [Computed Fields guide](../guides/computed-fields.md).

### `computedPassLimit`

```ts
computedPassLimit?: number  // default: 5
```

Maximum evaluation passes per `set()` call before the circular-dependency warning fires.

Values are clamped: must be a finite integer ≥ 1; the maximum accepted value is **50**. Non-finite values (e.g. `Infinity`, `NaN`), zero, and negatives silently fall back to the default of 5. This prevents accidental hangs when `Infinity` is passed.

### `pathValidation`

```ts
pathValidation?: 'dev' | 'always' | 'off'  // default: 'dev'
```

Controls when unknown-path warnings fire. `'dev'` warns only when `NODE_ENV !== 'production'`. `'always'` warns regardless of environment. `'off'` disables the trie entirely.

---

## `FormState<T>`

```ts
// Inline shape passed to PathSubscriber callbacks — all fields are optional
// because they are only populated once the field has been interacted with.
interface FieldState {
  error?: string
  touched?: boolean
  dirty?: boolean
}

interface FormState<T> {
  values: T
  errors: Record<string, string>
  touched: Record<string, boolean>
  dirty: Record<string, boolean>
  isSubmitting: boolean
  isValidating: boolean
  isValid: boolean | null
  submissionAttempts: number
  lastSubmittedValues: Partial<T> | null
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `values` | `T` | — | Current form values |
| `errors` | `Record<string, string>` | `{}` | Field error messages by path |
| `touched` | `Record<string, boolean>` | `{}` | Fields the user has interacted with |
| `dirty` | `Record<string, boolean>` | `{}` | Fields that have changed since initialization |
| `isSubmitting` | `boolean` | `false` | `true` while submit handler is running |
| `isValidating` | `boolean` | `false` | `true` while async validation is in flight |
| `isValid` | `boolean \| null` | `null` | `null` = not yet validated; `true` = last full validation passed; `false` = errors exist |
| `submissionAttempts` | `number` | `0` | Increments on every `submit()` call, including failed validation attempts. |
| `lastSubmittedValues` | `Partial<T> \| null` | `null` | Deep snapshot of form values at last successful submission. `null` until first success. Cleared by `reset()`. |

## `createForm<T>(config)`

Returns a `FormInstance<T>` object. All state is private to the returned closure.

```ts
const form = createForm<MyValues>({ initialValues: { ... } })
```

---

## Methods

### `form.get(path)`

```ts
form.get<P extends Path<T>>(path: P): GetPathValue<T, P>
```

Returns the current value at the given dot-notation path. Supports array index notation (`items.0.name`).

```ts
const email = form.get('email')
const firstItem = form.get('items.0.label')
```

---

### `form.set(path, value, options?)`

```ts
form.set<P extends Path<T>>(path: P, value: GetPathValue<T, P>, options?: SetOptions): void
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

### `Path<T>`

A union of all valid dot-notation field paths for the form values type `T`.

```ts
interface SignupForm {
  email: string;
  address: { city: string; zip: string };
  tags: Array<{ label: string }>;
}

type AllPaths = Path<SignupForm>;
// → 'email' | 'address' | 'address.city' | 'address.zip' | 'tags' | 'tags.0' | 'tags.0.label' | ...
```

Used as the constraint for path arguments in `get()`, `set()`, `arrayAppend()`, and `arrayInsert()`.

---

### `GetPathValue<T, P>`

Resolves the value type at dot-notation path `P` within type `T`.

```ts
type EmailType = GetPathValue<SignupForm, 'email'>;         // string
type CityType  = GetPathValue<SignupForm, 'address.city'>;  // string
type TagsType  = GetPathValue<SignupForm, 'tags'>;          // { label: string }[]
```

This is what makes `form.get('email')` return `string` instead of `any`.

---

### `SetOptions`

```ts
export interface SetOptions {
  touch?: boolean;   // Mark the field as touched when setting
  validate?: boolean; // Trigger validation after setting
}
```

### `ArrayItem<V>`

Utility type that extracts the element type from an array type. Returns `never` for non-array types.

```ts
type Item = ArrayItem<Array<{ name: string }>>
// { name: string }

type Never = ArrayItem<string>
// never
```

---

### `form.validate(paths?)`

```ts
form.validate(scopePaths?: Array<Path<T> | string[]>): Promise<boolean>
```

Runs the validator. When `paths` is provided, only those paths (plus their computed dependents) are validated. When omitted, all fields are validated.

```ts
// Validate everything
await form.validate()

// Validate only step-1 fields
await form.validate(['firstName', 'lastName', 'email'])
```

> **Note:** Passing `string[]` as the first argument is also accepted at runtime (same behaviour as `Path<T>[]`), but is not reflected in the TypeScript overloads. Use `as Path<T>[]` if you need to pass a dynamically-built array.

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
form.subscribeToPath<P extends Path<T>>(
  path: P,
  fn: (value: GetPathValue<T, P>, fieldState: { error?: string; touched?: boolean; dirty?: boolean }) => void
): () => void
```

Registers a path-level subscriber. `fn` is called only when the value or field state at `path` changes. Returns an unsubscribe function.

The subscriber receives `(value: GetPathValue<T, P>, fieldState: { error?: string; touched?: boolean; dirty?: boolean })` as arguments. The `fieldState` second argument is also available in `subscribeToPathDynamic` subscribers.

The wildcard path `'*'` receives every path notification.

```ts
const unsub = form.subscribeToPath('email', (value, { error, touched }) => {
  errorEl.textContent = touched ? (error ?? '') : ''
})
```

---

### `form.connect(path, element, options?)`

```ts
form.connect(path: Path<T>, el: HTMLElement, options?: ConnectOptions): () => void
```

Links an `HTMLElement` to a form field path. See [DOM Connect Bridge](/api/connect) for full documentation.

---

### `form.getPayload()`

```ts
form.getPayload(): Partial<T>
```

Returns a partial values object containing only the paths that are currently connected to a live DOM element or were connected with `persist: true`. Useful for collecting only the visible step's data in a multi-step form. If nothing is connected or persisted, falls back to returning the full values object instead of `{}`.

Transient computed fields are excluded from the returned object — consistent with `submit()` behavior. Non-transient computed fields (e.g. a `total` derived from `qty * unitPrice`) are included.

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

Runs `fn` synchronously with notifications deferred until the function returns. Useful when making multiple mutations that should appear as a single update to subscribers. Computed fields are kept fully consistent inside a batch — all derived values are re-evaluated once after `fn` returns, before any subscriber fires.

```ts
form.batch(() => {
  form.set('firstName', 'Alice')
  form.set('lastName', 'Smith')
  form.set('role', 'admin')
})
// subscribers are notified once, after all three sets; computed fields already reflect final values
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

### `resetField(path, options?)`

```ts
form.resetField(path: Path<T>, options?: ResetFieldOptions): void
```

Restores a single field to its initial value (the value from `initialValues`, or the seed passed to the last `reset(newValues)` call).

```ts
form.resetField('email')
form.resetField('address')              // clears all address.* state
form.resetField('items.0.name')         // nested array path
form.resetField('email', { keepError: true }) // preserve the current error
```

**`ResetFieldOptions`:**

| Option | Type | Default | Description |
|---|---|---|---|
| `keepError` | `boolean` | `false` | Retain `errors[path]` after reset |
| `keepTouched` | `boolean` | `false` | Retain `touched[path]` after reset |
| `keepDirty` | `boolean` | `false` | Retain `dirty[path]` after reset |

When `path` points to an object key (e.g. `'address'`), all nested state keys (`errors['address.city']`, `touched['address.zip']`, etc.) are cleared. Validation is NOT triggered after `resetField`.

---

### `form.getFieldMode(path)`

```ts
form.getFieldMode(path: string): ValidationMode
```

Returns the effective validation mode for `path`. Primarily useful for debugging — to see which mode a field resolved to when diagnosing unexpected validation timing.

Resolution order (first match wins):

1. `validationMode` string shorthand in `FormConfig` — highest priority; if a string like `'onChange'` is set, it applies globally
2. `validationMode.fields[path]` in `FormConfig` — per-field override
3. `validationMode.default` in `FormConfig` — the default inside an object config
4. `'onTouched'` (built-in fallback)

```ts
const mode = form.getFieldMode('email')
// → 'onTouched' | 'onChange' | 'onBlur' | 'onSubmitOnly'
```

> **Note:** Per-element `validateOn` overrides passed to `form.connect(path, el, { validateOn })` are consumed inside the DOM bridge and are not reflected by `getFieldMode`. This method only reflects `FormConfig`-level configuration.

---

### `form.setErrors(errors)`

```ts
form.setErrors(errors: Partial<Record<Path<T>, string>>): void
```

Merges server-returned field errors into form state. Each injected error behaves identically to a client-side validation error — it appears in `state.errors`, notifies all subscribers, and clears the next time the affected field is validated.

**When to use:** inside your submit handler, after an API call returns field-level validation errors.

```ts
form.submit(async (payload) => {
  const res = await fetch('/api/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const { errors } = await res.json()
    // e.g. { email: 'Already taken', username: 'Unavailable' }
    form.setErrors(errors)
  }
})
```

**Merge semantics:** only the keys present in the argument are written. Existing errors for other fields are untouched. Passing an empty object (`{}`) or `null`/`undefined` is a safe no-op — no subscribers are notified.

**Touched:** each path in the argument is marked `touched: true` so the error displays immediately, regardless of whether the user has interacted with the field. Fields are **not** marked `dirty` — server errors reflect rejected server state, not a local edit.

**Clearing:** server errors clear the same way client errors do — when `validate()` runs for a path and the validator returns no error for it. `reset()` clears all errors including server-injected ones. To clear all errors programmatically without resetting values, use `form.clearErrors()`.

---

### `form.clearErrors()`

```ts
form.clearErrors(): void
```

Clears all field errors atomically and notifies subscribers once. Useful when you need to reset the error state without resetting the form values — for example, switching between wizard steps or dismissing a server error panel.

```ts
// Clear all errors (e.g. user dismissed an error banner)
form.clearErrors()

// Equivalent to reset() for errors only — values, touched, and dirty are unaffected
```

Unlike `reset()`, `clearErrors()` does not change `values`, `touched`, or `dirty`. It is a no-op if there are no errors.

---

### `form.submit(onValid)`

```ts
form.submit(onValid: (payload: Partial<T>) => void | Promise<void>): Promise<boolean>
```

Validates the entire form and, if valid, calls `onValid` with the current payload. Returns `true` on success, `false` if validation failed or the form is already submitting. Sets `isSubmitting = true` while running. All fields are marked as `touched` before validation runs, so error messages appear immediately even for fields the user has not interacted with.

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

### `form.isFieldValid(path)`

```ts
form.isFieldValid(path: Path<T>): boolean | null
```

Returns the validation state for a single field:

- `null` — the field has never been validated (initial state, or after `resetField(path)` / `reset()`).
- `true` — the field was last validated with no error.
- `false` — the field was last validated with an error.

```ts
const valid = form.isFieldValid('email')
if (valid === null) console.log('Not yet validated')
if (valid === false) console.log('Has error:', form.getState().errors.email)
```

---

### `form.isDirty()`

```ts
form.isDirty(): boolean
```

Returns `true` if any field has been mutated via `set()`, `setDynamic()`, or related methods during this session — even if the value was subsequently changed back to its initial value. To check whether the current values actually differ from initial values, use `Object.keys(form.getState().dirty).length > 0` instead.

```ts
const dirty = form.isDirty()
```

---

### `form.isFieldDirty(path)`

```ts
form.isFieldDirty(path: Path<T>): boolean
```

Returns `true` if this field or any child path has been set. Uses prefix matching — `isFieldDirty('address')` returns `true` if `address.city` is dirty.

```ts
form.isFieldDirty('email')         // exact path
form.isFieldDirty('address')       // true if any address.* path is dirty
form.isFieldDirty('items.0.name')  // nested array path
```

---

### `form.watch(paths, callback)`

Observe one or more field values without subscribing to all form state changes. The callback fires only when a watched path changes — not on initial subscription.

```ts
// Single path
const stop = form.watch('email', (v) => console.log(v['email']))

// Multiple paths — callback receives a snapshot of ALL watched values
const stop = form.watch(['email', 'username'], ({ email, username }) => {
  console.log(email, username)
})

stop() // unsubscribe — calling twice is safe (no-op)
```

For nested paths, the key in the callback argument is the full dotted string:
```ts
form.watch('address.city', (v) => console.log(v['address.city']))
```

To observe all form state changes (including errors, touched, etc.), use `form.subscribe()` instead.

---

### `form.focus(path)`

```ts
form.focus(path: Path<T>): boolean
```

Focus the element connected to `path` via `form.connect()`. Returns `false` if no element is connected to that path or the element is no longer in the DOM.

```ts
const focused = form.focus('email')
if (!focused) console.log('No connected element for email')
```

---

### `form.focusFirstError()`

```ts
form.focusFirstError(): boolean
```

Focus the first error element in DOM document order. Requires fields to be connected via `form.connect()`. Returns `false` if there are no errors or no connected elements match an error path.

```ts
await form.submit(async (payload) => {
  await api.save(payload)
})
// if submit returns false (validation failed):
form.focusFirstError()
```

---

### `setDynamic(path, value, options?)`

```ts
form.setDynamic(path: string, value: unknown, options?: SetOptions): void
```

Sets a value at a runtime-constructed path. Bypasses `Path<T>` compile-time checking. No-op if `path` is a computed field. Use when the path is not known at compile time.

Defensive guards (dev console errors/warnings, no throw):
- `null` or non-string `path` → `console.error` and no-op.
- Empty string `path` → `console.warn` and no-op.
- Computed field path → `console.warn` and no-op.

### `getDynamic<V>(path)`

```ts
form.getDynamic<V = unknown>(path: string): V
```

Reads a value at a runtime-constructed path. The optional generic `V` lets you assert the expected return type without a cast at the call site. Returns `unknown` when `V` is not specified.

```ts
// untyped — returns unknown
const raw = form.getDynamic('items.0.name')

// typed — returns string (caller asserts the type)
const name = form.getDynamic<string>('items.0.name')
```

Can read computed fields — use freely for any path, including derived values.

### `subscribeToPathDynamic(path, fn)`

```ts
form.subscribeToPathDynamic(
  path: string,
  fn: (value: unknown, fieldState: { error?: string; touched?: boolean; dirty?: boolean }) => void
): () => void
```

Registers a path-level subscriber using a runtime-constructed path string. Equivalent to `subscribeToPath` but accepts `string` instead of `Path<T>`. Returns an unsubscribe function.

Use this when the path is built at runtime (e.g. `items.${index}.name`) and cannot be expressed as a compile-time `Path<T>`.

```ts
const index = 1
const unsub = form.subscribeToPathDynamic(`items.${index}.qty`, (value) => {
  console.log('qty changed:', value)
})

// later:
unsub()
```

The wildcard `'*'` path is also supported and receives every path notification.

---

## Persistence

### `FormConfig.persistence`

Optional. Configure auto-save behaviour:

```ts
persistence?: {
  adapter: PersistenceAdapter<T>
  debounceMs?: number  // default 300. Set to 0 to write on every change.
  exclude?: Array<Path<T> | (string & {})>  // typed paths to exclude from read and write
}
```

### `hydrate()`

Reads stored values from the persistence adapter and merges them into the form as the new initial values. Returns a `Promise<void>`. Call once after mount. No-op if no adapter is configured.

```ts
await form.hydrate()
```

### `localStorageAdapter<T>(key)`

Returns a `PersistenceAdapter<T>` backed by `localStorage`. SSR-safe — returns `null` when `localStorage` is unavailable.

```ts
import { localStorageAdapter } from '@neutro/form/core'

const adapter = localStorageAdapter<MyValues>('my-form-key')
```

### `sessionStorageAdapter<T>(key)`

Returns a `PersistenceAdapter<T>` backed by `sessionStorage`. SSR-safe. Values are cleared when the browser tab closes.

```ts
import { sessionStorageAdapter } from '@neutro/form/core'

const adapter = sessionStorageAdapter<MyValues>('my-form-key')
```

### `PersistenceAdapter<T>`

Interface for custom storage backends:

```ts
export interface PersistenceAdapter<T> {
  read(): T | null | undefined | Promise<T | null | undefined>
  write(values: T): void | Promise<void>
  clear(): void | Promise<void>
}
```

---

### `form.arrayAppend(path, item)`

```ts
form.arrayAppend(path: Path<T>, item: unknown): void
```

Appends an item to the array at `path`. See [Array Operations](/api/array-operations).

---

### `form.arrayInsert(path, index, item)`

```ts
form.arrayInsert(path: Path<T>, index: number, item: unknown): void
```

Inserts an item at `index`, shifting subsequent items and their field state down by one.

---

### `form.arrayRemove(path, index)`

```ts
form.arrayRemove(path: Path<T>, index: number): void
```

Removes the item at `index`, shifting subsequent items and their field state up by one.

---

### `form.arrayMove(path, from, to)`

```ts
form.arrayMove(path: Path<T>, from: number, to: number): void
```

Moves the item at `from` to `to`, remapping field state for all items in the affected window.

---

### `form.arraySwap(path, i, j)`

```ts
form.arraySwap(path: Path<T>, i: number, j: number): void
```

Swaps the items at indices `i` and `j`, swapping their field state as well.

---

> **v0.4+ Note:** All path parameters require `Path<T>` — a compile-time-checked union of valid dot-notation paths. For runtime-constructed paths, use [`setDynamic`](#setdynamic-path-value-options) / [`getDynamic`](#getdynamic-v-path) / [`subscribeToPathDynamic`](#subscribetopathdynamic-path-fn).

---

### `form.getAriaProps(path, options?)`

Returns a plain object of ARIA attributes for the given field. Spread the result directly onto an input element. Reads the current state as a snapshot — call it inside a subscription or reactive binding to keep attributes up to date.

```ts
form.getAriaProps(path: Path<T>, options?: AriaPropsOptions): AriaProps
```

#### AriaPropsOptions

| Option | Type | Default | Description |
|---|---|---|---|
| `required` | `boolean` | — | `true` forces `aria-required`; `false` suppresses it even when `rules` includes `'required'`; omit to auto-detect from rules |
| `errorId` | `string` | — | Override the generated `aria-describedby` target ID |

#### AriaProps

```ts
export interface AriaProps {
  'aria-invalid': 'true' | 'false'
  'aria-describedby': string | undefined
  'aria-required': true | undefined
}
```

`aria-required` is `undefined` (not `false`) when the field is not required, so spreading produces no attribute.

`aria-describedby` is included only when the field currently has an error; it is `undefined` otherwise, so spreading produces no attribute. When present, it defaults to `error-${path.replace(/\./g, '-')}` (e.g. `error-email`, `error-billing-address`); use `errorId` to override. Render your error element with the matching `id`:

```html
<span id="error-email">…</span>
<span id="error-billing-address">…</span>
```

#### Usage

```tsx
// React — spread inside a useForm/useFormPath subscription
<input
  value={email}
  onChange={e => form.set('email', e.target.value)}
  {...form.getAriaProps('email')}
/>
<span id="error-email">{state.errors.email}</span>
```

```ts
// Required inferred from rules
const form = createForm({
  initialValues: { email: '' },
  rules: { email: ['required', 'email'] },
})
form.getAriaProps('email')
// → { 'aria-invalid': 'false', 'aria-describedby': undefined, 'aria-required': true }

// Explicit required override (e.g. custom async validator, no built-in rule)
form.getAriaProps('username', { required: true })

// Custom error element ID
form.getAriaProps('email', { errorId: 'my-email-error' })

// Suppress aria-required even though rules include 'required'
form.getAriaProps('email', { required: false })
```

---

### `getConnectedCount(path?)`

Returns the number of DOM elements currently connected to the form (or to a specific `path` if provided).

```ts
form.getConnectedCount()        // total connected elements
form.getConnectedCount('email') // elements connected to 'email'
```

Useful for diagnostics and conditional rendering logic.

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

### File Rules

The following rules operate on `File` and `FileList` values (e.g. from `input.files`). All rules accept an optional `message?: string` override.

| Rule | Description |
|---|---|
| `{ maxFileSize: number }` | Every file must be ≤ n bytes. Works on `File` and `FileList`. Default message includes human-readable size (`"5.0 MB"`). Only fires when a file is present. |
| `{ minFileSize: number }` | Every file must be ≥ n bytes. Only fires when a file is present. |
| `{ fileTypes: string[] }` | Every file's MIME type must be in the list (e.g. `['image/png', 'image/jpeg']`). Only fires when present. |
| `{ maxFiles: number }` | `FileList` length must be ≤ n. A bare `File` counts as 1. |
| `{ minFiles: number }` | `FileList` length must be ≥ n. A bare `File` counts as 1. Prefer `minFiles: 1` over `'required'` for file inputs. |
