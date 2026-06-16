# Devtools

```ts
import { devtools } from '@neutro/form/devtools'
```

`devtools` wires a form instance to the browser Console API for rich, interactive debugging output. It has no external dependencies and produces zero output unless explicitly called.

## Usage

```ts
import { createForm } from '@neutro/form/core'
import { devtools } from '@neutro/form/devtools'

const form = createForm({
  initialValues: { email: '', password: '' },
  validator: ...,
})

if (process.env.NODE_ENV !== 'production') {
  devtools(form, { name: 'LoginForm' })
}
```

Call `devtools()` once after creating the form. The production guard is optional but recommended — when the `if` wraps the call, bundlers like Vite and Webpack will eliminate it entirely from production builds.

## `devtools(form, options?)`

```ts
function devtools<T extends object>(
  form: FormInstance<T>,
  options?: DevtoolsOptions
): () => void
```

Returns an unsubscribe function. Call it to stop all console output and remove the action listener.

```ts
const disconnect = devtools(form, { name: 'LoginForm' })

// Later, when the form is removed:
disconnect()
```

### `DevtoolsOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | `'Form'` | Label shown in the styled console badge |
| `collapsed` | `boolean` | `true` | When `true`, action groups start collapsed — click to expand |

## Console Output

Each form action produces a collapsible group. Collapsed by default so the console stays quiet — expand only what you care about.

**Header (visible when collapsed):**

```
[NeutroForm: LoginForm]  SET email  14:23:07  +156ms
```

**When expanded:**

```
  action     {type: "SET", path: "email", value: "alice@example.com", options: {touch: true}}
  ┌──────────┬──────────┬───────┬─────────────────────┐
  │ (index)  │ key      │ prev  │ next                │
  ├──────────┼──────────┼───────┼─────────────────────┤
  │ values   │ email    │ ""    │ "alice@example.com"  │
  │ dirty    │ email    │ false │ true                │
  └──────────┴──────────┴───────┴─────────────────────┘
  ▶ full state   {values: {…}, errors: {…}, touched: {…}, …}
```

The diff table uses `console.table()` — sortable, copyable, no plugins required. Unchanged slices are omitted. The `full state` section is a nested collapsible group with a fully interactive object you can expand and copy in DevTools.

When `form.batch()` is used, all mutations in the batch are nested inside a single `BATCH (N mutations)` group.

## `FormAction` type

`FormAction` is exported from `@neutro/form/core`. Use it to build custom tooling on top of `_subscribeToActions`.

```ts
import type { FormAction } from '@neutro/form/core'
```

```ts
type FormAction =
  | { type: 'SET'; path: string; value: unknown; options?: { touch?: boolean; validate?: boolean } }
  | { type: 'VALIDATE'; paths?: string[] }
  | { type: 'SUBMIT' }
  | { type: 'RESET'; newValues?: unknown }
  | { type: 'SET_ERRORS'; errors: Record<string, string> }
  | { type: 'CONNECT'; path: string }
  | { type: 'DISCONNECT'; path: string }
  | { type: 'BLUR'; path: string }
  | { type: 'BATCH_START' }
  | { type: 'BATCH_END' }
  | { type: 'ARRAY_APPEND'; path: string; item: unknown }
  | { type: 'ARRAY_INSERT'; path: string; index: number; item: unknown }
  | { type: 'ARRAY_REMOVE'; path: string; index: number }
  | { type: 'ARRAY_MOVE'; path: string; from: number; to: number }
  | { type: 'ARRAY_SWAP'; path: string; i: number; j: number }
```

## `_subscribeToActions` (advanced)

```ts
form._subscribeToActions(fn: (action: FormAction, state: FormState<T>) => void): () => void
```

Internal escape hatch used by `devtools()`. The callback receives the labeled action and the post-mutation state snapshot. Use `devtools()` instead — `_subscribeToActions` has no stability guarantees across versions.

## `createNeutroFormDevtoolsPanel(form, options?)`

Mounts a reactive devtools overlay for a form instance. Returns an unsubscribe function that removes the overlay and cleans up all subscriptions.

```ts
function createNeutroFormDevtoolsPanel<T extends object>(
  form: FormInstance<T>,
  options?: DevtoolsPanelOptions
): () => void
```

**Default (floating overlay):** when called without `options.container`, a fixed-position panel is appended to `document.body` with a `▴ NF` toggle button in the bottom-right corner.

```ts
import { createNeutroFormDevtoolsPanel } from '@neutro/form/devtools'

const unsub = createNeutroFormDevtoolsPanel(form, { name: 'Signup Form' })

// Call unsub() to remove the overlay
```

**Inline mode:** provide `options.container` to mount the panel inside a specific element instead.

```ts
const unsub = createNeutroFormDevtoolsPanel(form, {
  name: 'Signup Form',
  container: document.getElementById('debug-panel')!,
})
```

**`DevtoolsPanelOptions`:**

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | `'Form'` | Label shown in the panel header |
| `container` | `HTMLElement` | — | Mount inline inside this element. Omit for floating overlay. |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'auto'` | Color theme (reserved for future use) |
| `maxLogEntries` | `number` | `50` | Maximum action log entries before oldest are dropped |
| `collapsed` | `boolean` | `false` | Start with the panel body hidden |

**Notes:**
- No-op in SSR environments (`typeof document === 'undefined'`)
- One floating panel per form — calling twice without first unsubscribing logs a warning and returns a no-op
- The same form can power panels in multiple different containers (inline mode)
- State values are rendered via `textContent` (never `innerHTML`) — safe against XSS
- Inline mode uses Shadow DOM when available, with a light DOM fallback
