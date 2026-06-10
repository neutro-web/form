# @agw/form — Hardening, Fixes & Documentation Design Spec

**Date:** 2026-06-09
**Author:** kofirc
**Status:** Approved

---

## 1. Overview

This spec covers the full hardening pass on the `agw-form` monorepo: fixing all known bugs, completing the build infrastructure, expanding test coverage to production-grade, and launching a consumer-facing documentation site via VitePress on GitHub Pages.

---

## 2. Scope

### 2.1 Bug Fixes & API Completions

| # | Issue | Fix |
|---|---|---|
| 1 | React `useFormPath` broken — wrong subscriber signature | Wrap `subscribeToPath` to adapt React's `() => void` notifier |
| 2 | `arrayInsert` missing from public API | Wire existing `shiftStateIndices('insert')` into a public method |
| 3 | `valibotAdapter`, `yupAdapter`, `classValidatorAdapter` orphaned in root file | Move into `packages/core/src/index.ts`, delete orphan files |
| 4 | Alias package `"types"` fields are invalid (point to package names, not paths) | Create stub re-export `.ts` source files, build to `.d.ts` |
| 5 | Adapter packages have no build scripts | Add `tsup.config.ts` + `build` script to all 5 adapters |
| 6 | Adapter package names don't match white paper (`form-adapters-*` vs `form-*`) | Rename all adapter packages |

### 2.2 Package Renames

| Old name | New name |
|---|---|
| `@agnostic-web/form-adapters-react` | `@agnostic-web/form-react` |
| `@agnostic-web/form-adapters-svelte` | `@agnostic-web/form-svelte` |
| `@agnostic-web/form-adapters-vue` | `@agnostic-web/form-vue` |
| `@agnostic-web/form-adapters-solid` | `@agnostic-web/form-solid` |
| `@agnostic-web/form-adapters-angular` | `@agnostic-web/form-angular` |

Update sites: each adapter's `package.json` `"name"`, alias `package.json` dependencies + workspace refs, root `tsconfig.json` path aliases.

### 2.3 Files Deleted

- `production_grade_ts_engine.ts` (orphan draft — content absorbed into core package)
- `framework_reactivity_adapters.ts` (orphan draft — content absorbed into adapter packages)
- `White Paper & Documentation.md` (content absorbed into docs/)
- `Monorepo & Packaging Strategy.md` (content absorbed into docs/)
- `NPM Installation and Usage Guide.md` (content absorbed into docs/getting-started.md)

---

## 3. Final Repository Structure

```
packages/
  core/                              @agnostic-web/form-core
    src/index.ts
    test/form.test.ts
    tsup.config.ts
    package.json
    tsconfig.json
  adapters/
    react/                           @agnostic-web/form-react
    svelte/                          @agnostic-web/form-svelte
    vue/                             @agnostic-web/form-vue
    solid/                           @agnostic-web/form-solid
    angular/                         @agnostic-web/form-angular
      (each has src/index.ts, tsup.config.ts, package.json)
  alias/                             @agw/form
    src/
      core.ts
      adapters/
        react.ts / svelte.ts / vue.ts / solid.ts / angular.ts
    tsup.config.ts
    package.json

docs/
  .vitepress/
    config.ts
  public/
    logo.svg
  index.md                           Landing page
  getting-started.md
  api/
    index.md
    core.md
    connect.md
    array-operations.md
    validation.md
  guides/
    react.md
    svelte.md
    vue.md
    solid.md
    angular.md
    async-validation.md
    dependency-graph.md
    multi-step-forms.md
  playground.md

.github/
  workflows/
    docs.yml                         VitePress → GitHub Pages on push to main

CLAUDE.md                            Updated
README.md                            Updated (links to docs site)
```

---

## 4. Core Package Changes (`packages/core/src/index.ts`)

### 4.1 New Validator Adapters

Add alongside the existing `zodAdapter`:

```ts
valibotAdapter<T>(schema, safeParseFn)       // valibot v0.31+ API
yupAdapter<T>(schema)                         // yup validateSync
classValidatorAdapter<T>(Cls, validateFn)     // async, class-validator
```

### 4.2 New `arrayInsert` Method

```ts
arrayInsert(path, index, item)
// Inserts item at index, shifts all entries >= index up by 1
// Shifts errors/touched/dirty key indices via shiftStateIndices('insert', index)
// Out-of-bounds index (< 0 or > arr.length) is a no-op
// Triggers runValidation([targetPath]) after mutation
```

---

## 5. Alias Package (`packages/alias/`)

### 5.1 Stub Source Files

Each stub re-exports everything from its target package:

```ts
// src/core.ts
export * from '@agnostic-web/form-core';

// src/adapters/react.ts
export * from '@agnostic-web/form-react';
// ... etc
```

### 5.2 tsup Config

Multiple entry points, ESM + CJS + `.d.ts`:

```ts
entry: {
  core: 'src/core.ts',
  'adapters/react': 'src/adapters/react.ts',
  'adapters/svelte': 'src/adapters/svelte.ts',
  'adapters/vue': 'src/adapters/vue.ts',
  'adapters/solid': 'src/adapters/solid.ts',
  'adapters/angular': 'src/adapters/angular.ts',
}
```

### 5.3 Fixed `package.json` Exports

```json
"./core": {
  "types": "./dist/core.d.ts",
  "import": "./dist/core.js",
  "require": "./dist/core.cjs"
}
```

---

## 6. Adapter Package Build Config (all 5 adapters)

Each adapter gains identical structure:

```
src/index.ts         (already exists)
tsup.config.ts       (new)
package.json         (add build script + exports fields)
```

`package.json` gains:
- `"main": "./dist/index.cjs"`
- `"module": "./dist/index.js"`
- `"types": "./dist/index.d.ts"`
- `"exports"` map (types/import/require)
- `"scripts": { "build": "tsup src/index.ts --format esm,cjs --dts --clean" }`
- `"devDependencies": { "tsup": "^8.0.0" }`

---

## 7. React Adapter Fix

```ts
// Before (broken):
(callback: () => void) => form.subscribeToPath(path, callback)

// After (correct):
(onStoreChange: () => void) => form.subscribeToPath(path, () => onStoreChange())
```

---

## 8. Test Suite Design

Single file: `packages/core/test/form.test.ts`

Organized into `describe` blocks:

| Block | Key cases |
|---|---|
| Initialization | Deep clone isolation, initial state shape |
| get / set | Nested reads/writes, no-op on equal value, touch flag, validate:false |
| Dirty tracking | Marks on change, clears when value returns to initial |
| Sync validation | Valid returns true, errors keyed by path, scoped merge leaves others intact |
| Async validation | Debounce timing, stale epoch discarded, AbortSignal fires on re-validation |
| Dependency graph | Direct dep, transitive chain, circular (no infinite loop), wildcard index substitution |
| Batching | Multiple sets inside batch() → single notification |
| Array — arrayAppend | Adds item, validates |
| Array — arrayInsert | Inserts at index, shifts metadata, out-of-bounds no-op |
| Array — arrayRemove | Splices, shifts indices in errors/touched/dirty, last-element removal |
| Array — arrayMove | Rekeyes state, fromIndex === toIndex no-op |
| Array — arraySwap | Swaps metadata, single-element array no-op |
| Reset | Clears state, reset(newValues) re-seeds baseline |
| Payload isolation | getPayload() returns only connected + persisted paths |
| Subscriptions | subscribe fires immediately + on change, unsubscribe stops; subscribeToPath scoped correctly; '*' fires on all |
| Destroy | No notifications after destroy() |

---

## 9. VitePress Documentation

### 9.1 Site Metadata

- **Title:** `@agw/form`
- **Description:** High-performance, zero-dependency, framework-agnostic reactive form engine
- **Base:** `/agw-form/` (for GitHub Pages deployment under a repo sub-path)
- **Theme:** Default VitePress theme with custom accent color

### 9.2 Navigation

**Top nav:** Home · Getting Started · API · Guides · Playground

**Sidebar — API Reference:**
- Overview
- createForm & Core API
- DOM Connect Bridge
- Array Operations
- Validation Adapters

**Sidebar — Framework Guides:**
- React
- Svelte 5
- Vue 3
- SolidJS
- Angular

**Sidebar — Advanced:**
- Async Validation
- Dependency Graph
- Multi-Step Forms

### 9.3 Content Approach

- Consumer-facing only — no internal algorithm detail
- Every page has a working code example as its first block
- Framework guide pages show the minimal wiring to get a form running, then the path-scoped hook pattern
- `playground.md` embeds `hardened_sandbox_playground.html` via an `<iframe>` with a brief description of what to try

### 9.4 GitHub Actions Deployment

`.github/workflows/docs.yml` triggers on push to `main`, runs `pnpm run docs:build`, and deploys `docs/.vitepress/dist` to the `gh-pages` branch using `actions/deploy-pages`.

---

## 10. CLAUDE.md Updates

- Add `docs:dev`, `docs:build` commands
- Update all adapter package names to new `form-*` convention
- Remove the "Known Issues" section entirely (all fixed)
- Add "VitePress Docs" section noting the `docs/` folder structure

---

## 11. Implementation Order

1. Core fixes (adapters + arrayInsert) — unblocks everything else
2. React adapter fix
3. Package renames
4. Adapter build scripts
5. Alias package stub re-exports
6. Delete orphan files
7. Expanded test suite
8. VitePress setup + config
9. All doc content
10. GitHub Actions workflow
11. CLAUDE.md update
