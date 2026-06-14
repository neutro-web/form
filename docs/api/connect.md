# DOM Connect Bridge

The DOM bridge lets you link any `HTMLElement` directly to a form field path without going through framework reactivity. This is the foundation for zero-rerender uncontrolled field patterns.

## `form.connect(path, element, options?)`

```ts
interface ConnectOptions {
  /**
   * When true, the field's value is retained in getPayload() even after the
   * element is removed from the DOM. Use this for fields that unmount between
   * wizard steps but whose value must still be submitted.
   * @default false
   */
  persist?: boolean

  /**
   * Optional formatter applied to the raw value before it is written to
   * element.value. Useful for phone number masking, date formatting, etc.
   */
  format?: (value: unknown) => string

  /**
   * Overrides the form-level `validationMode` for this specific element.
   * Useful when one field needs different validation timing than the global default.
   *
   * @example
   * // Validate this field on blur even if the form default is 'onChange'
   * form.connect('email', emailEl, { validateOn: 'onBlur' })
   */
  validateOn?: ValidationMode
}

form.connect(
  path: string,
  element: HTMLElement,
  options?: ConnectOptions
): () => void
```

`connect` stores a `WeakRef<HTMLElement>` in an internal `connectionRegistry` keyed by `path`. The returned function disconnects the element and — if `persist` is false — clears the field's state.

### Basic Usage

`connect` wires up `input` and `blur` event handlers on the element automatically. You do not need to add your own event listeners — the bridge handles value syncing and validation according to the form's `validationMode` (default: `'onTouched'`).

```ts
const emailInput = document.getElementById('email') as HTMLInputElement

// Connect the input — event wiring is done automatically by the bridge
const disconnect = form.connect('email', emailInput)

// Disconnect when the element is removed (e.g. component teardown)
disconnect()
```

To override the validation trigger for one element without changing the global config, pass `validateOn`:

```ts
// Validate this field on blur only, regardless of the form's validationMode
const disconnect = form.connect('email', emailInput, { validateOn: 'onBlur' })
```

### Persisted Fields (Multi-Step Wizard)

```ts
// Step 1 field — keep the value even when the element is removed from the DOM
form.connect('personalInfo.firstName', firstNameInput, { persist: true })
form.connect('personalInfo.lastName', lastNameInput, { persist: true })

// On step 2, the step-1 inputs are unmounted but their values survive
// because persist: true added them to persistedPaths.
```

### Format Option

```ts
form.connect('phone', phoneInput, {
  format: (raw) => {
    const digits = String(raw).replace(/\D/g, '')
    if (digits.length <= 3) return digits
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`
  },
})
```

## Automatic Cleanup via MutationObserver

A single `MutationObserver` on `document.body` is created lazily on the first call to `connect`. It fires on every `childList` mutation with `subtree: true`. When a node is removed:

1. The observer iterates `connectionRegistry` entries.
2. For each entry, it calls `ref.deref()`. If the element is `null` (GC'd) or is no longer connected to the document, the entry is pruned.
3. Unless the path is in `persistedPaths`, its `errors`, `touched`, and `dirty` entries are cleared and subscribers are notified.

This means you never need to manually clean up connections in most framework component teardowns — the observer handles it for you. However, calling `disconnect()` explicitly is still recommended because it runs synchronously, whereas the observer fires asynchronously after the DOM mutation.

## `form.getPayload()`

```ts
form.getPayload(): Partial<T>
```

Returns a partial values object containing only the paths that are:

- Currently connected to a live DOM element, **or**
- Connected with `persist: true` (even if the element has since been removed)

This is the recommended way to collect form data for submission because it excludes any fields that are conditionally hidden and not persisted — preventing stale or irrelevant data from reaching your API.

```ts
submitButton.addEventListener('click', async () => {
  await form.validate()
  const state = form.getState()
  if (Object.keys(state.errors).length > 0) return

  const payload = form.getPayload()
  // payload only contains fields with live or persisted connections
  await fetch('/api/submit', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
})
```

## `useFormConnect` (React Zero-Rerender Pattern)

The React adapter's `useFormConnect` hook wires up `connect` inside a `useEffect`, giving you an uncontrolled field that never causes a React re-render:

```tsx
import { useFormConnect } from '@neutro/form/adapters/react'

function PhoneField({ form }: { form: ReturnType<typeof createForm> }) {
  const ref = useFormConnect(form, 'phone', {
    persist: false,
    format: (v) => formatPhone(String(v)),
  })

  return <input ref={ref} type="tel" />
}
```

The hook returns a React `ref` that you attach to the DOM element. When the element mounts, `form.connect` is called; when it unmounts, the returned disconnect function is called.

---

## Automatic ARIA

`connect()` manages the following ARIA attributes on the element automatically:

| Attribute | Behaviour |
|---|---|
| `aria-invalid` | Set to `'true'` when the field has an error; `'false'` otherwise. Updated reactively whenever errors change. |
| `aria-describedby` | Set once on connect when a `[data-error="${path}"]` element is found in the DOM. The element is given a generated `id` if it lacks one (`error-desc-${path-with-dashes}`). Not updated reactively — the error container must be present when `connect()` is called. |
| `aria-required` | Set to `'true'` once on connect when the field's `rules` config includes `'required'`. Not reactive — field requiredness is treated as a static schema property. Only the built-in `'required'` string rule is detected; conditional rules (`requiredIf`, `requiredUnless`) are not. |

For framework adapter contexts (React, Vue, Svelte) where `connect()` is not used, see [`getAriaProps()`](/api/core#getariaprops-path-options) instead.
