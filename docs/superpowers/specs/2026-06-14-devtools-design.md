# Devtools / Observability — Design Spec

**Date:** 2026-06-14
**Status:** Approved

## Problem

During development there is no way to inspect live form state without manually adding a `form.subscribe()` call and writing your own console logging. Every developer debugging a form writes the same boilerplate. There is no labelled action trace, no state diff, and no structured output — just raw state snapshots.

## Solution

Add a minimal internal action hook to the core (`_subscribeToActions`) and ship a standalone `devtools()` utility at `@neutro/form/devtools` that uses only the browser Console API to produce rich, interactive, structured output. No browser extension required. No external dependencies. Zero bundle impact when not imported.

A future phase (out of scope here) will add a floating browser inspector panel that opens via keyboard shortcut when devtools is active.

## API

### `devtools(form, options?)`

```ts
import { createForm } from '@neutro/form/core'
import { devtools } from '@neutro/form/devtools'

const form = createForm({ initialValues: { email: '', password: '' } })

if (process.env.NODE_ENV !== 'production') {
  const disconnect = devtools(form, { name: 'LoginForm' })
}
```

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | `'Form'` | Label shown in the console badge |
| `collapsed` | `boolean` | `true` | Whether action groups start collapsed |

Returns an unsubscribe function. Calling it stops all console output and removes the internal action listener. Production guarding is the caller's responsibility — the function does not auto-detect `NODE_ENV`. A bundler dead-branch eliminates the call in production builds when wrapped in the `if` guard above.

### `FormAction` type (exported from `@neutro/form/core`)

```ts
export type FormAction =
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

### `_subscribeToActions` (internal escape hatch on `FormInstance`)

```ts
_subscribeToActions: (fn: (action: FormAction, state: FormState<T>) => void) => () => void
```

Prefixed with `_` to signal it is an internal API. `devtools()` is the supported consumer. Anyone calling it directly gets no stability guarantees across versions. The callback receives the labeled action and the post-mutation state snapshot; the caller maintains its own `prevState` for diffing.

## Console Output

### Header (visible when collapsed)

```
[NeutroForm: LoginForm]  SET email  14:23:07.452  +156ms
```

The `[NeutroForm: LoginForm]` badge is styled with a colored background via `console.log('%c text', 'background:#6366f1;color:white;...')`. The action label (`SET email`, `VALIDATE`, `SUBMIT`) follows. Timestamp is absolute; `+156ms` is elapsed since the previous action, both rendered in dimmed text.

### When expanded

```
  action     {type: "SET", path: "email", value: "alice@example.com", options: {touch: true}}
  ┌──────────┬──────────┬───────┬────────────────────┐
  │ (index)  │ key      │ prev  │ next               │
  ├──────────┼──────────┼───────┼────────────────────┤
  │ values   │ email    │ ""    │ "alice@example.com" │
  │ dirty    │ email    │ false │ true               │
  └──────────┴──────────┴───────┴────────────────────┘
  ▶ full state   {values: {…}, errors: {…}, touched: {…}, …}
```

- **action object**: `console.log('%o', action)` — fully interactive in DevTools
- **diff table**: `console.table(rows)` where each row is `{ slice, key, prev, next }`. Only slices with changed keys appear. If nothing changed (e.g. a `CONNECT` action), a single dim line reads `no state change`
- **full state**: nested `console.groupCollapsed('full state')` wrapping `console.log('%o', state)` — expandable on demand

### Batch grouping

Batch actions are nested inside a parent group showing mutation count:

```
▶ [NeutroForm: LoginForm]  BATCH (3 mutations)  14:23:08.100  +648ms
    ▶ SET firstName  …
    ▶ SET lastName   …
    ▶ SET role       …
```

The `BATCH_START` action opens a `console.group`; each inner action logs normally; `BATCH_END` closes it.

### Initialization

On first call to `devtools()`:

```
▶ [NeutroForm: LoginForm]  init
  ▶ initial state   {values: {…}, errors: {…}, …}
```

### Silent operations

`subscribeToPath`, `subscribe`, `getState`, `getPayload`, `destroy` — read-only or teardown, produce no output.

## Implementation

### `packages/core/src/index.ts`

1. Export `FormAction` type (discriminated union, listed above).
2. Add `_subscribeToActions` to `FormInstance<T>` interface.
3. Inside `createForm` closure: maintain `actionListeners: Set<(action: FormAction, state: FormState<T>) => void>` and implement `_subscribeToActions` as a Set-based subscribe/unsubscribe.
4. Add a private `dispatchAction(action: FormAction)` helper that fans out to all action listeners passing `(action, getState())`.
5. Call `dispatchAction` in: `set`, `validate`, `submit`, `reset`, `setErrors`, `batch` (start and end), `connect` (connect and disconnect cleanup), `handleBlur` inside `connect`, and all five array methods.

### `packages/core/src/devtools.ts` (new file)

Exports `devtools<T extends object>(form: FormInstance<T>, options?: DevtoolsOptions): () => void`.

Internals:
- Maintains `prevState: FormState<T>` initialised from `form.getState()` at call time.
- Maintains `lastActionTime: number` for elapsed calculation.
- Maintains `inBatch: boolean` and `batchActions: Array<{action, state, prevState}>` to accumulate mutations during a batch.
- On `BATCH_START`: set `inBatch = true`, reset `batchActions = []`.
- On any action while `inBatch`: push `{action, state, prevState}` to `batchActions` instead of logging immediately.
- On `BATCH_END`: flush the batch — open a `console.groupCollapsed` (or `group`) with the mutation count now known, log each accumulated action inside it, `console.groupEnd()`. Reset `inBatch = false`.
- On all other actions: open a `console.groupCollapsed` (or `console.group` if `collapsed: false`), log action object, compute diff, `console.table(diffRows)`, `console.groupCollapsed('full state')` + `console.log('%o', state)` + `console.groupEnd()`, `console.groupEnd()`.
- State diff computed by walking `values`, `errors`, `touched`, `dirty` and collecting keys where `prev[key] !== next[key]`. For `errors`, `touched`, and `dirty` slices, `!==` per key is sufficient (strings and booleans). For the `values` slice, use `isDeepEqual` from core so nested object fields are not reported as changed when their content is identical.

### `packages/alias/package.json`

Add:
```json
"./devtools": {
  "types": "./dist/devtools.d.ts",
  "import": "./dist/devtools.js",
  "require": "./dist/devtools.cjs"
}
```

And in `typesVersions`:
```json
"devtools": ["./dist/devtools.d.ts"]
```

### `docs/api/devtools.md` (new file)

Documents `devtools()`, options, the `FormAction` type, `_subscribeToActions` (with stability warning), and the production guard pattern.

## Testing

### `packages/core/test/devtools.test.ts` (new file)

**`_subscribeToActions` unit tests (no jsdom):**
- Returns unsubscribe function that stops delivery
- `SET` action fires with correct path, value, options, and post-mutation state
- `VALIDATE` fires with paths array (or undefined for full validate)
- `SUBMIT` fires
- `RESET` fires with newValues (or undefined)
- `SET_ERRORS` fires with the errors map
- `CONNECT` fires with path on connect; `DISCONNECT` fires with path on cleanup
- `BLUR` fires with path (requires jsdom — mark with `// @vitest-environment jsdom`)
- `BATCH_START` fires before first SET inside batch; `BATCH_END` fires after
- Array operations each fire their respective action types

**`devtools()` integration tests (spy on `console`):**
- `init` group logged on call
- `console.groupCollapsed` called per action (when `collapsed: true`)
- `console.group` called per action (when `collapsed: false`)
- `console.table` called with correct diff rows
- `console.groupCollapsed` called for `full state` section
- No console calls after `disconnect()` is called
- Batch group nesting: `console.group` for batch wrapper, inner actions logged inside

## Scope

In scope: `FormAction` type, `_subscribeToActions` hook, `devtools()` console utility, `@neutro/form/devtools` entrypoint, tests, docs.

Out of scope: floating browser inspector panel (future phase), Redux DevTools protocol integration, Node.js environment detection inside `devtools()`, per-action filtering options.
