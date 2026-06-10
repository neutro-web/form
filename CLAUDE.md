# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (from repo root)
pnpm install

# Run all tests
pnpm test
# or: vitest run

# Run a single test file
pnpm exec vitest run packages/core/test/form.test.ts

# Run tests in watch mode
pnpm exec vitest

# Build all packages
pnpm build
# or: pnpm --filter "@agnostic-web/*" run build

# Build only core
pnpm --filter @agnostic-web/form-core run build

# Bootstrap workspace from scratch (generates all package files)
node workspace_auto_initializer.js

# Documentation
pnpm docs:dev      # start VitePress dev server
pnpm docs:build    # build static site to docs/.vitepress/dist
pnpm docs:preview  # preview the built site locally
```

## Architecture

This is a pnpm monorepo. The published packages live under `packages/`. Two root-level `.ts` files (`production_grade_ts_engine.ts`, `framework_reactivity_adapters.ts`) are **orphan drafts** — earlier monolithic versions that predate the package structure. Do not edit them as source of truth; reconcile changes into the packages instead.

### Package Map

| Package | npm name | Path |
|---|---|---|
| Core engine | `@agnostic-web/form-core` | `packages/core/src/index.ts` |
| React adapter | `@agnostic-web/form-react` | `packages/adapters/react/src/index.ts` |
| Svelte 5 adapter | `@agnostic-web/form-svelte` | `packages/adapters/svelte/src/index.ts` |
| Vue 3 adapter | `@agnostic-web/form-vue` | `packages/adapters/vue/src/index.ts` |
| SolidJS adapter | `@agnostic-web/form-solid` | `packages/adapters/solid/src/index.ts` |
| Angular 16+ adapter | `@agnostic-web/form-angular` | `packages/adapters/angular/src/index.ts` |
| Alias wrapper | `@neutro/form` | `packages/alias/package.json` |

The alias package is a zero-code shell: its `package.json` `exports` map re-routes `@neutro/form/core`, `@neutro/form/adapters/react`, etc. to the scoped packages. The `tsconfig.json` at the root also maps these paths directly to source for local development.

### Core Engine Design (`createForm<T>`)

`createForm` is a closure factory — no classes, no global state. All state lives inside the closure: `values`, `errors`, `touched`, `dirty`, `isSubmitting`, `isValidating`.

**Notification system:** `notify(mutatedPath?)` walks the mutated path's segments and fans out to matching `pathSubscribers` entries. The wildcard `'*'` path receives every notification. Global `subscribe()` listeners always receive the full state snapshot. Batching (`isBatching` flag) defers notifications until the batch completes.

**Dependency graph:** The `dependencies` config (`Record<string, string[]>`) is resolved into a full transitive closure at `createForm` init time by `compileDependencyScopes`. This produces `preComputedScopes` — a static dictionary that maps every field path to the set of paths that must also be validated when it changes. Runtime lookup is O(1). Wildcard index substitution (e.g. `destinations.*.url` → `destinations.1.url`) happens inside `runValidation` when an indexed path has no direct entry.

**Async validation:** `runValidation` increments `asyncEpoch` on each call. Each scope gets its own `AbortController` stored in `activeAbortControllers`. When a path is re-validated, any prior controller for that path is aborted first. `asyncDebounceTimer` delays the actual `await` by `asyncDebounceMs` (default 300ms). Stale results are discarded when `activeEpoch !== asyncEpoch`.

**Array operations:** `arrayRemove`, `arrayMove`, `arraySwap` must keep `errors`, `touched`, and `dirty` in sync with the array's new indices. `shiftStateIndices` handles remove/insert by renumbering keys. `rekeyArrayState` handles move by remapping the sliding window. These operate inside `batch()`.

**DOM bridge (`connect`):** Registers a `WeakRef<HTMLElement>` in `connectionRegistry`. A lazy `MutationObserver` on `document.body` fires whenever nodes are removed; it prunes GC'd or removed elements from the registry and clears their state (unless the path is in `persistedPaths`). `getPayload()` returns only values for paths that are currently connected or persisted — not the full form values object.

### Documentation

The VitePress documentation site lives in `docs/`. Source files are Markdown; the config is at `docs/.vitepress/config.ts`.

- Dev server: `pnpm docs:dev` → http://localhost:5173/agw-form/
- Production build: `pnpm docs:build` → outputs to `docs/.vitepress/dist`
- The site is deployed to GitHub Pages automatically on every push to `main` via `.github/workflows/docs.yml`
- Public URL: https://koficodedat.github.io/agw-form/

### Browser Demo

`hardened_sandbox_playground.html` is a self-contained browser demo (Tailwind via CDN, engine inlined as vanilla JS). It exercises all features: multi-step wizard with scoped validation, async uniqueness checks with visible AbortSignal cancellation, cursor-preserving phone formatter, multi-select, date cross-field dependency, dynamic array CRUD with move/swap, and `reset(newValues)` re-seeding. Open it directly in a browser — it has no build step.
