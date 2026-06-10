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
}

form.connect(
  path: string,
  element: HTMLElement,
  options?: ConnectOptions
): () => void
```

`connect` stores a `WeakRef<HTMLElement>` in an internal `connectionRegistry` keyed by `path`. The returned function disconnects the element and — if `persist` is false — clears the field's state.

### Basic Usage

```ts
const emailInput = document.getElementById('email') as HTMLInputElement

// Connect the input — the form now tracks this element
const disconnect = form.connect('email', emailInput)

emailInput.addEventListener('input', (e) => {
  form.set('email', (e.target as HTMLInputElement).value, {
    touch: true,
    validate: true,
  })
})

// Disconnect when the component teardown
disconnect()
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
import { useFormConnect } from '@agnostic-web/form-react'

function PhoneField({ form }: { form: ReturnType<typeof createForm> }) {
  const ref = useFormConnect(form, 'phone', {
    persist: false,
    format: (v) => formatPhone(String(v)),
  })

  return <input ref={ref} type="tel" />
}
```

The hook returns a React `ref` that you attach to the DOM element. When the element mounts, `form.connect` is called; when it unmounts, the returned disconnect function is called.
