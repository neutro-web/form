---
layout: home

hero:
  name: '@neutro/form'
  tagline: Zero-dependency reactive form engine for every framework.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: API Reference
      link: /api/

features:
  - title: Framework Agnostic
    details: First-class adapters for React, Svelte 5, Vue 3, SolidJS, and Angular. The core engine has zero runtime dependencies and works in any environment.

  - title: Pre-computed Dependency Graph
    details: Cross-field validation dependencies are resolved into a transitive closure at init time. Runtime lookup is O(1) — no graph traversal on every keystroke.

  - title: Automatic GC
    details: A lazy MutationObserver on document.body prunes disconnected DOM elements from the registry automatically. WeakRef ensures elements can be garbage-collected without leaking form state.

  - title: AbortController Async Validation
    details: Every async validation invocation gets its own AbortController. Stale in-flight requests are cancelled immediately when the field changes, and epoch tracking prevents stale results from landing.

  - title: Array Operations
    details: Built-in arrayAppend, arrayInsert, arrayRemove, arrayMove, and arraySwap keep errors, touched, and dirty maps in sync with the array's new indices automatically.

  - title: DOM Bridge
    details: connect() links any HTMLElement to a form field path. getPayload() returns only values for currently-connected or persisted paths — perfect for multi-step wizards that unmount fields.
---

## Why @neutro/form?

Most form libraries are coupled to a single framework or require a large runtime. `@neutro/form` ships a single closure factory — `createForm<T>` — that manages all form state internally. Framework adapters are thin reactive wrappers around the same engine, so you get identical validation behaviour, array operations, and DOM bridge semantics regardless of which UI framework you use.

```ts
import { createForm } from '@neutro/form/core'
// or the scoped package directly:
import { createForm } from '@neutro/form-core'

const form = createForm({
  initialValues: { email: '', password: '' },
  validator: (values) => {
    const errors: Record<string, string> = {}
    if (!values.email) errors.email = 'Required'
    if (values.password.length < 8) errors.password = 'Min 8 characters'
    return errors
  },
})
```

[Get Started](/getting-started) | [API Reference](/api/) | [Playground](/playground)
