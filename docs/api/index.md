# API Overview

## Core Factory

`createForm<T>(config)` is the single entry point for the library. It is a closure factory — no classes, no singletons, no global state. Each call returns an isolated form instance whose entire state (`values`, `errors`, `touched`, `dirty`, `isSubmitting`, `isValidating`) lives inside the closure. The generic type parameter `T` constrains `initialValues` and flows through to all method signatures so `form.get('some.path')` is fully typed.

See [Core API](/api/core) for the full `FormConfig` and method reference.

## Subscription Model

The engine exposes two subscription primitives:

- **`form.subscribe(fn)`** — global subscriber. `fn` receives a complete `FormState<T>` snapshot on every state mutation. Use this when a component needs to react to the whole form (e.g. a submit button that reflects `isSubmitting`).
- **`form.subscribeToPath(path, fn)`** — path-level subscriber. `fn` receives `(value, fieldState)` where `fieldState` contains `{ error, touched, dirty }` for that path alone. Mutations to unrelated paths do not trigger this callback, making it ideal for individual field components.

Both return an unsubscribe function. Framework adapters call this automatically on component teardown.

## Validation Lifecycle

Validation is always initiated by `form.validate(paths?)` or implicitly by `form.set(path, value, { validate: true })`. The engine:

1. Expands `paths` into a full scope using the pre-computed dependency graph.
2. Aborts any in-flight `AbortController` for those paths.
3. Waits for `asyncDebounceMs` (default 300 ms) before calling the validator.
4. Increments an internal epoch counter; stale results arriving after a newer call has started are discarded.
5. Merges returned errors into the `errors` map and notifies subscribers.

See [Validation Adapters](/api/validation) for schema library integrations and [Async Validation](/guides/async-validation) for a deep dive on the epoch and abort mechanics.

## DOM Bridge

`form.connect(path, element, options?)` registers an `HTMLElement` under a form field path using a `WeakRef`. A lazy `MutationObserver` on `document.body` monitors node removals; when an element leaves the DOM its registry entry is pruned and its field state is cleared — unless the path was connected with `persist: true`, in which case the value is retained.

`form.getPayload()` returns a partial values object containing only the paths that are currently connected or persisted. This makes it straightforward to collect only the data belonging to the currently-visible step of a multi-step form.

See [DOM Connect Bridge](/api/connect) for full usage.

## Array Operations

`createForm` exposes five array mutation methods — `arrayAppend`, `arrayInsert`, `arrayRemove`, `arrayMove`, `arraySwap` — that operate inside an internal `batch()` call. Beyond mutating the values array, they remap the `errors`, `touched`, and `dirty` maps so that field state follows the item as it moves rather than staying attached to the old index.

See [Array Operations](/api/array-operations) for signatures and examples.
