# Bundle Size Tiers

`@neutro/form/core` ships in two entry points so you only pay for what your form actually needs.

| Entry point | Gzip size | Includes |
|---|---|---|
| `@neutro/form/core` | ~11.8 KB | Everything — full engine |
| `@neutro/form/core/minimal` | ~8.0 KB | Core engine only |

(Measured by the benchmark suite's esbuild + gzip bundle-size check; see `bench/results/bundle-size.json`.)

## What `minimal` gives you

`@neutro/form/core/minimal` exports the same `createForm` shape for the essentials: `set`, `get`, `validate`, `subscribe`, `subscribeToPath`, `reset`, `resetField`, `submit`, `batch`, `setErrors`, `watch`, and the dependency graph. If your form is a flat or nested object with no dynamic arrays, no DOM-managed inputs, no save-to-storage requirement, and no derived fields, `minimal` is a drop-in replacement for `@neutro/form/core` at roughly two-thirds the gzip weight.

```ts
import { createForm } from '@neutro/form/core/minimal'

const form = createForm({
  initialValues: { email: '', password: '' },
  rules: { email: ['required', 'email'] },
})
```

## The four excluded clusters

`minimal` deliberately leaves out four feature clusters. Each one has genuine code weight tied to a footprint that many real forms never touch:

1. **Array operations** (`arrayAppend`, `arrayRemove`, `arrayMove`, `arraySwap`, etc.) — the index-shifting and rekeying logic (`shiftStateIndices`, `rekeyArrayState`) that keeps `errors`/`touched`/`dirty` in sync across array mutations. Forms without dynamic, user-editable lists don't need it.
2. **DOM bridge** (`connect`, `focus`, `getAriaProps`, `focusFirstError`) — the `WeakRef` connection registry and lazy `MutationObserver` that track which elements are mounted. Framework adapters (React, Vue, Svelte, Solid, Angular) drive form state through their own reactivity and never call `connect()`, so this is dead weight outside vanilla-DOM usage.
3. **Persistence** (`hydrate`, `localStorageAdapter`, `sessionStorageAdapter`, the `persistence` config) — storage read/write/debounce plumbing that only matters if you're auto-saving drafts.
4. **Computed fields** (the `computed` config option) — dependency-driven derived-field re-evaluation. Most forms have zero derived fields; the ones that do tend to also need array ops or DOM binding, so they're already on the full tier.

If your form uses any of the four, use `@neutro/form/core` instead — don't reach for `minimal` and try to work around the gap.

### Computed fields are a silent no-op under `minimal`

This is easy to miss: passing a `computed` config to `createForm` from `@neutro/form/core/minimal` **does not throw and does not warn**. The engine simply never evaluates the computed function, so the field just holds whatever value you gave it in `initialValues` and never updates. If a field that's supposed to be derived (a `total`, a `fullName`) is staying frozen at its initial value, check whether the form was created from `minimal` before you check the computed function itself.

### Persistence is a silent no-op under `minimal` — same shape of gap

Passing a `persistence` config to `createForm` from `@neutro/form/core/minimal` **also does not throw and does not warn**. `hydrate()` doesn't exist on the minimal instance, so the adapter is never wired up: nothing reads stored values on load, and nothing writes on change or on `reset()`. The config is accepted at the type level (so switching import paths never causes a config-shape error), but nothing about it actually runs. If a form built from `minimal` isn't restoring or saving drafts, check the import path before debugging the adapter itself.

## Upgrade path

Swapping tiers is a one-line import change — nothing else in your code changes, because `@neutro/form/core` is a superset of `@neutro/form/core/minimal`'s API surface:

```diff
- import { createForm } from '@neutro/form/core/minimal'
+ import { createForm } from '@neutro/form/core'
```

There's no data migration and no config restructuring — just add whichever of `computed`, `persistence`, array operations, or `connect()` your form now needs.

## Which one should I start with?

Default to `@neutro/form/core` unless bundle size is a measured constraint (e.g. a widget embedded on a marketing page, or a form shipped to a low-bandwidth audience). Reach for `minimal` when you know up front the form is simple — a login form, a contact form, a settings panel with no derived fields — and you want the smaller download. See the [FAQ](/community#faq) for a quick decision tree.
