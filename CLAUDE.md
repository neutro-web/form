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
# or: pnpm --filter "@neutro/*" run build

# Build only core
pnpm --filter @neutro/form-core run build

# Bootstrap workspace from scratch (generates all package files)
node workspace_auto_initializer.js

# Documentation
pnpm docs:dev      # start VitePress dev server
pnpm docs:build    # build static site to docs/.vitepress/dist
pnpm docs:preview  # preview the built site locally
```

## Pre-push checklist (must match CI exactly)

The CI pipeline runs these steps in order. Lefthook enforces the same sequence on pre-push, so a local pass means CI will pass.

| Step | Command | Common failure |
|---|---|---|
| Lint | `pnpm lint` (`biome check packages vitest.config.ts`) | Biome formatted a file but it was never staged — run `git add` after any biome write |
| Type check | `pnpm exec tsc --noEmit` | Missing `.js` extensions on relative imports (NodeNext requirement), or implicit `any` |
| Build | `pnpm build` | Missing export, bad import path |
| Test | `pnpm test` | Failing assertions |

**Key rule:** If you run `pnpm exec biome check --write` or `biome check --write --unsafe`, always `git add` the changed files before committing. Biome edits the working tree but does not stage — pushing without staging will fail CI even though local lint passes.

**NodeNext imports:** All relative imports in `packages/` must use `.js` extensions (e.g. `from '../src/index.js'`), even though the actual file is `.ts`. This applies to bench files, adapter source, and any new files added under `packages/`.

## Architecture

This is a pnpm monorepo. The published packages live under `packages/`. Two root-level `.ts` files (`production_grade_ts_engine.ts`, `framework_reactivity_adapters.ts`) are **orphan drafts** — earlier monolithic versions that predate the package structure. Do not edit them as source of truth; reconcile changes into the packages instead.

### Package Map

| Package | npm name | Path |
|---|---|---|
| Core engine | `@neutro/form-core` | `packages/core/src/index.ts` |
| React adapter | `@neutro/form-react` | `packages/adapters/react/src/index.ts` |
| Svelte 5 adapter | `@neutro/form-svelte` | `packages/adapters/svelte/src/index.ts` |
| Vue 3 adapter | `@neutro/form-vue` | `packages/adapters/vue/src/index.ts` |
| SolidJS adapter | `@neutro/form-solid` | `packages/adapters/solid/src/index.ts` |
| Angular 16+ adapter | `@neutro/form-angular` | `packages/adapters/angular/src/index.ts` |
| Alias wrapper | `@neutro/form` | `packages/alias/package.json` |

The alias package is a zero-code shell: its `package.json` `exports` map re-routes `@neutro/form/core`, `@neutro/form/adapters/react`, etc. to the scoped packages. The `tsconfig.json` at the root also maps these paths directly to source for local development.

### Core Engine Design (`createForm<T>`)

`createForm` is a closure factory — no classes, no global state. All state lives inside the closure: `values`, `errors`, `touched`, `dirty`, `isSubmitting`, `isValidating`.

**Notification system:** `notify(mutatedPath?)` walks the mutated path's segments and fans out to matching `pathSubscribers` entries. The wildcard `'*'` path receives every notification. Global `subscribe()` listeners always receive the full state snapshot. Batching (`isBatching` flag) defers notifications until the batch completes.

**Dependency graph:** The `dependencies` config (`Record<string, string[]>`) is resolved into a full transitive closure at `createForm` init time by `compileDependencyScopes`. This produces `preComputedScopes` — a static dictionary that maps every field path to the set of paths that must also be validated when it changes. Runtime lookup is O(1). Wildcard index substitution (e.g. `destinations.*.url` → `destinations.1.url`) happens inside `runValidation` when an indexed path has no direct entry.

**Async validation:** `runValidation` increments `asyncEpoch` on each call. Each scope gets its own `AbortController` stored in `activeAbortControllers`. When a path is re-validated, any prior controller for that path is aborted first. `asyncDebounceTimer` delays the actual `await` by `asyncDebounceMs` (default 300ms). Stale results are discarded when `activeEpoch !== asyncEpoch`.

**Array operations:** `arrayRemove`, `arrayMove`, `arraySwap` must keep `errors`, `touched`, and `dirty` in sync with the array's new indices. `shiftStateIndices` handles remove/insert by renumbering keys, looking up affected keys via `ctx.pathIndex` (a refcounted shadow index maintained by `ctx.indexKey`/`ctx.unindexKey`) instead of scanning all tracked state — O(affected keys), not O(total form state). `rekeyArrayState` handles move by remapping the sliding window. These operate inside `batch()`.

**DOM bridge (`connect`):** Registers a `WeakRef<HTMLElement>` in `connectionRegistry`. A lazy `MutationObserver` on `document.body` fires whenever nodes are removed; it prunes GC'd or removed elements from the registry and clears their state (unless the path is in `persistedPaths`). `getPayload()` returns only values for paths that are currently connected or persisted — not the full form values object.

### Mutation invariant

`ctx.errors`, `ctx.touched`, `ctx.dirty`, `ctx.wasSet`, `ctx.values`, `ctx.initialValues` are never reassigned — only cleared-and-repopulated in place. This is what makes cross-module `ctx` composition (see `engine.ts`/`features/*.ts`) safe: a feature function that destructures `const { values } = ctx` at setup time keeps observing the live object forever, never a stale snapshot. **Exceptions, all deliberately reassigned rather than mutated in place — always read these fresh via `ctx.X`, never destructure-and-cache:** `ctx.lastSubmittedValues` (read only by the engine's own `getState()`, never by feature-cluster code); `ctx.mutationObserver`/`ctx.persistenceUnsubscribe`/`ctx.persistenceWriteTimer` (the three nullable engine-owned slots reassigned by `features/dom-bridge.ts`'s `initMutationObserver` and `features/persistence.ts`'s `hydrate`, then read/nulled again by `engine.ts`'s `destroy()` and, for `persistenceUnsubscribe`, by `reset()`'s `onReset` hook guard — these cross module boundaries in both directions, so the staleness risk is real despite being an accepted, documented exception).

### Release Flow

Releases are gated on `main` directly. A `release` branch exists but is **not wired to anything** — `.github/workflows/release-please.yml` has no `target-branch` override, so any push it sees (including one to `release`) always evaluates against and opens its PR against `main` regardless. `release` sat 43+ commits behind `main` for most of the 0.5.0 cycle with no functional effect. If a real staged gate is ever wanted, `target-branch: release` would need to be added explicitly and verified — until then, treat `release` as vestigial and don't rely on pushing to it for anything.

**To cut a release:**
1. `git push origin main` — pushing to `main` is what actually triggers release-please (confirmed via GitHub Actions run history: pushes to `main` trigger it; `release` is not a real gate, see above)
2. release-please detects the push and opens/updates a "chore(main): release vX.Y.Z" PR against `main`, computing the version bump from conventional commits since the last tag
3. Merge the PR — release-please creates the `vX.Y.Z` tag and bumps all `package.json` files via `extra-files`
4. The tag push triggers `publish.yml`, which runs tests, builds, and publishes `@neutro/form` to npm — and also triggers `bench-full.yml`, which re-runs the full benchmark suite and auto-commits an updated `docs/benchmarks/index.md` back to `main`

**Note:** release-please only resyncs its open PR's branch when a new commit lands with a changelog-tracked type (`feat`/`fix`/`perf`/`docs`, per `changelog-sections` below) — a `ci:`, `test:`, `chore:`, etc. commit on `main` won't refresh the PR's branch or its CI checks, even though the PR's actual merge target (`main`) has moved. Don't be surprised if the PR shows stale (possibly red) checks after an unrelated fix lands on `main`; merging is still safe since it's a real merge against current `main`, not a snapshot overwrite.

**Version sync:** `release-please-config.json` lists all 9 `package.json` files under `extra-files`. Every release PR bumps all of them in lockstep — no manual version edits needed.

**`release-as` field:** `release-please-config.json` briefly had `"release-as": "0.4.0"` to force the first release to that version (all commits since `0.3.0` were `fix:/docs:`, which would otherwise produce `0.3.1`). It was removed once `0.4.0` shipped, so releases since then (including any future one) follow normal semver bump rules from conventional commits — no override is currently present.

Only `@neutro/form` (the alias package) is published — all other packages are `"private": true` and are bundled into the alias.

### Benchmark Suite

`bench/` is a separate pnpm-workspace-excluded package (`@neutro/bench`, own `pnpm-lock.yaml`) that benchmarks `@neutro/form` against react-hook-form, formik, tanstack-form, vee-validate, and felte across correctness (Node/Vitest), browser performance (Playwright/Chromium), and bundle size (esbuild + gzip).

- `pnpm --dir bench bench:full` runs the whole local pipeline: builds the React/Vue/Svelte comparison apps, runs core/correctness/browser/bundle-size suites, merges results into `bench/results/latest.json`, and regenerates `docs/benchmarks/index.md`.
- **Local runs must copy `results/latest.json` over `results/baseline.json` before `bench:generate`** — `generate-page.ts` reads only `baseline.json`, and `bench:update-baseline` (the script that normally does this copy) is CI-gated. Skipping this step regenerates the page from stale data.
- `bench/annotations.ts` is the hand-maintained source of truth for: why neutro passes a correctness check (`PASS_REASONS`), why a competitor is N/A or a Tradeoff badge is softened (`ANNOTATIONS`), and which exact competitor version was benchmarked (`COMPETITOR_VERSIONS`) — update all three whenever a competitor dependency bumps in `bench/package.json` or `bench/apps/*/package.json`.
- The generated `docs/benchmarks/index.md` is a committed artifact, not build-time generated by VitePress — regenerate and commit it whenever `bench/scripts/generate-page.ts` or the underlying results change.

### Documentation

The VitePress documentation site lives in `docs/`. Source files are Markdown; the config is at `docs/.vitepress/config.ts`.

- Dev server: `pnpm docs:dev` → http://localhost:5173/form/
- Production build: `pnpm docs:build` → outputs to `docs/.vitepress/dist`
- The site is deployed to GitHub Pages automatically on every push to `main` via `.github/workflows/docs.yml`
- Public URL: https://neutro-web.github.io/form/

### Browser Demo

`docs/public/playground.html` is a self-contained browser demo (Tailwind via CDN, engine inlined as vanilla JS). It exercises all features: multi-step wizard with scoped validation, async uniqueness checks with visible AbortSignal cancellation, cursor-preserving phone formatter, multi-select, date cross-field dependency, dynamic array CRUD with move/swap, and `reset(newValues)` re-seeding. Open it directly in a browser — it has no build step.

**Playground tab ordering rule:** The "Performance Lab" tab must always be the last step in the vanilla JS section. Do not insert new demos after it — place them before it.
