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
| Type check tests | `pnpm typecheck` (`vitest --typecheck run packages/core/test/types.test.ts`) | A `Path<T>`/`GetPathValue<T, P>` type-level assertion in `types.test.ts` no longer holds |
| Test | `pnpm test` | Failing assertions — runs before Build since the root `vitest.config.ts` aliases `@neutro/form-core`/`-testing` straight to `src/`, not `dist/`, so tests never depend on a build having happened |
| Build | `pnpm build` | Missing export, bad import path |

**Key rule:** If you run `pnpm exec biome check --write` or `biome check --write --unsafe`, always `git add` the changed files before committing. Biome edits the working tree but does not stage — pushing without staging will fail CI even though local lint passes.

**NodeNext imports:** All relative imports in `packages/` must use `.js` extensions (e.g. `from '../src/index.js'`), even though the actual file is `.ts`. This applies to bench files, adapter source, and any new files added under `packages/`.

## Architecture

This is a pnpm monorepo. The published packages live under `packages/`. Two root-level `.ts` files (`production_grade_ts_engine.ts`, `framework_reactivity_adapters.ts`) are **orphan drafts** — earlier monolithic versions that predate the package structure. Do not edit them as source of truth; reconcile changes into the packages instead.

### Package Map

| Package | npm name | Path |
|---|---|---|
| Core engine | `@neutro/form-core` | `packages/core/src/index.ts` |
| React adapter | `@neutro/form-react` | `packages/adapters/react/src/index.ts` |
| Svelte adapter (store-based, rune-free — Svelte 4 & 5) | `@neutro/form-svelte` | `packages/adapters/svelte/src/index.ts` |
| Vue 3 adapter | `@neutro/form-vue` | `packages/adapters/vue/src/index.ts` |
| SolidJS adapter | `@neutro/form-solid` | `packages/adapters/solid/src/index.ts` |
| Angular 16+ adapter | `@neutro/form-angular` | `packages/adapters/angular/src/index.ts` |
| Testing utilities | `@neutro/form-testing` | `packages/testing/src/index.ts` |
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

`main` is trunk: changes land via PR and are fully CI-gated by `ci.yml` and `bench-regression.yml`. `release` is a deliberate "ready to ship" checkpoint: it only ever fast-forwards to a commit already on `main`, and after each release cycle it's merged back into `main` so it never carries a commit `main` doesn't have. `.github/workflows/release-please.yml` triggers only on pushes to `release` and passes `target-branch: release` to `googleapis/release-please-action@v4`, so its PR always targets `release`, not `main`.

**Branch rulesets (not classic branch protection):** both branches are enforced via GitHub repository rulesets (`repos/.../rulesets`), not the older `branches/{branch}/protection` API. Classic protection was tried first and had a real, reproducible bug in this repo — its `required_status_checks` never matched actual Actions check-runs (its `<workflow name> / <job name>` context format silently never bridged to the Checks API here, confirmed via `/commits/{sha}/status` returning zero legacy statuses), permanently blocking merges despite checks passing. Rulesets fixed it by matching on the raw job name + `integration_id: 15368` (GitHub Actions' app ID) instead.
- **`main`'s ruleset**: `pull_request` (0 required approvals — PR required but no mandatory review), `required_status_checks` (`test`, `bench-apps-typecheck`, `bench-regression`), `non_fast_forward`, `deletion`. No bypass actors — enforced for everyone, including admins.
- **`release`'s ruleset**: `non_fast_forward` + `deletion` only — **deliberately no `pull_request` or `required_status_checks` rule**. `release` advances via direct push (the fast-forward in step 1 below, and `bench-full.yml`'s bot commit), and `required_status_checks` evaluates synchronously against the exact SHA being pushed — it can't "wait for CI," so it would permanently block any direct push whose commit doesn't already carry a matching check-run. Worse, `bench-regression.yml` has no `push` trigger at all, so a directly-pushed commit could never satisfy it under any circumstances. Don't add `required_status_checks` to `release`'s ruleset — it's structurally incompatible with this branch's write pattern, not a config oversight. CI still runs and is visible on release-please's PR (via `ci.yml`/`bench-regression.yml`'s `pull_request` triggers, widened to cover `release`); it's just not merge-blocking there, since that's a normal PR (checks-run-before-merge) which is exactly the case `required_status_checks` handles correctly — the fast-forward push and `bench-full.yml`'s bot commit are the cases it doesn't.

**To cut a release:**
1. Fast-forward `release` to the commit on `main` you want to ship: `git checkout release && git merge --ff-only main && git push origin release`.
2. That push triggers `release-please.yml`, which opens/updates a "chore(release): release vX.Y.Z" PR against `release`, computing the version bump from conventional commits since the last tag.
3. Merge the PR — release-please creates the `vX.Y.Z` tag on `release` and bumps all `package.json` files via `extra-files`.
4. The tag push triggers `publish.yml` (tests, builds, and publishes `@neutro/form` to npm) and `bench-full.yml` (re-runs the full benchmark suite). `bench-full.yml` now checks out and commits its results to `release` (not `main`) — see below for why.
5. **Required:** once `bench-full.yml`'s commit (if any) has landed on `release`, open a PR merging `release` back into `main` (`git checkout main && git pull && git merge --ff-only release`, push to a feature branch, `gh pr create --base main`) and merge it through the normal `main` PR flow. **Merge this PR via a real merge commit ("Create a merge commit"), never squash or rebase** — the weekly `release-branch-drift.yml` check verifies `release`'s tip is a literal git ancestor of `main`'s tip via `git merge-base --is-ancestor`, and a squash/rebase merge synthesizes a new SHA that breaks this permanently, turning the check into a false positive on an otherwise healthy repo. This keeps `release`'s tip an ancestor of `main`'s tip, which is what makes the *next* cycle's fast-forward in step 1 valid.

**Gotcha (hit on the v0.5.1 cycle, the first release cut under this two-branch flow):** when `bench-full.yml` did commit results in step 4, that bot commit is a skip-CI commit — so it carries no check-runs at all. If the step 5 merge-back PR's head lands exactly on that commit, `main`'s `required_status_checks` (zero bypass actors, not even admins) can never be satisfied, and the PR is stuck forever. Fix: push one empty commit onto the merge-back **feature branch** (never onto `release` itself, which should stay exactly at the tagged/benchmarked commit) to give the PR a fresh head that actually runs CI; `release`'s tip remains reachable as an ancestor either way, so this doesn't affect the `git merge-base --is-ancestor` invariant. Don't put the skip-CI marker's literal text anywhere in that commit's message, including while explaining why you're adding it — GitHub's skip detection is a plain substring match over the whole message, so even quoting it verbatim causes the same commit to be skipped again.

**Why `bench-full.yml` targets `release`, not `main`:** the version-bump/CHANGELOG commit from step 3 lands on `release`. If `bench-full.yml` (tag-triggered, so it can fire within seconds of step 3) still checked out and pushed to `main`, its auto-commit could land on `main` *before* the step 5 merge-back happens, corrupting the fast-forward relationship. Targeting `release` means both commits travel through the same merge-back PR together.

**Version sync:** `release-please-config.json` lists all 9 `package.json` files under `extra-files`. Every release PR bumps all of them in lockstep — no manual version edits needed.

Only `@neutro/form` (the alias package) is published — all other packages are `"private": true` and are bundled into the alias.

### Benchmark Suite

`bench/` is a separate pnpm-workspace-excluded package (`@neutro/bench`, own `pnpm-lock.yaml`) that benchmarks `@neutro/form` against react-hook-form, formik, tanstack-form, vee-validate, and felte across correctness (Node/Vitest), browser performance (Playwright/Chromium), and bundle size (esbuild + gzip).

- `pnpm --dir bench bench:full` runs the whole local pipeline: builds the React/Vue/Svelte comparison apps, runs core/correctness/browser/bundle-size suites, merges results into `bench/results/latest.json`, and regenerates `docs/benchmarks/index.md`.
- **Local runs must copy `results/latest.json` over `results/baseline.json` before `bench:generate`** — `generate-page.ts` reads only `baseline.json`, and `bench:update-baseline` (the script that normally does this copy) is CI-gated. Skipping this step regenerates the page from stale data.
- `bench/annotations.ts` is the hand-maintained source of truth for: why neutro passes a correctness check (`PASS_REASONS`), why a competitor is N/A or a Tradeoff badge is softened (`ANNOTATIONS`), and which exact competitor version was benchmarked (`COMPETITOR_VERSIONS`) — update all three whenever a competitor dependency bumps in `bench/package.json` or `bench/apps/*/package.json`.
- The generated `docs/benchmarks/index.md` is a committed artifact, not build-time generated by VitePress — regenerate and commit it whenever `bench/scripts/generate-page.ts` or the underlying results change.
- `.github/workflows/bench-weekly.yml` runs the full bench pipeline every Sunday (cron) independent of any push, then runs `bench:post-drift` to file a GitHub issue if results have regressed since the last recorded baseline.

### Documentation

The VitePress documentation site lives in `docs/`. Source files are Markdown; the config is at `docs/.vitepress/config.ts`.

- Dev server: `pnpm docs:dev` → http://localhost:5173/form/
- Production build: `pnpm docs:build` → outputs to `docs/.vitepress/dist`
- The site deploys to GitHub Pages via `.github/workflows/docs.yml`, which triggers on `workflow_run` completion of `CI` or `Bench Full` on `main`, gated on `conclusion == 'success'` — not a direct `push` trigger. In practice this fires on nearly every push to `main` (since CI always runs), but a CI failure silently skips the docs deploy too, which a bare "on push" description wouldn't suggest
- Public URL: https://neutro-web.github.io/form/

### Browser Demo

`docs/public/playground.html` is a self-contained browser demo (Tailwind via CDN, engine inlined as vanilla JS). It exercises all features: multi-step wizard with scoped validation, async uniqueness checks with visible AbortSignal cancellation, cursor-preserving phone formatter, multi-select, date cross-field dependency, dynamic array CRUD with move/swap, and `reset(newValues)` re-seeding. Open it directly in a browser — it has no build step.

**Playground tab ordering rule:** The "Performance Lab" tab must always be the last step in the vanilla JS section. Do not insert new demos after it — place them before it.
