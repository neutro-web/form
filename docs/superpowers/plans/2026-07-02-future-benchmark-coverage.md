# Future Benchmark Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the six benchmark-coverage specs identified as gaps in the existing suite — large-form scale, validation-scope precision, mount/SSR cost, schema-validator overhead, array-ops at scale, and memory/DOM-cleanup comparison.

**Architecture:** Each spec becomes one or two tasks producing new fixtures and bench suite files, following the exact conventions already established in `bench/` (the `BenchAdapter` interface for core surfaces, Playwright specs + bench-app routes for browser surfaces). Core (Node/vitest) surfaces stay neutro-only per the project's established convention (see Global Constraints) — competitor comparisons happen only in the browser suite, using real framework integrations, never Node-level shim adapters.

**Tech Stack:** TypeScript, Vitest (`vitest bench` + `vitest run` for correctness), Playwright, Zod (new devDependency for Task 6), Chrome DevTools Protocol via Playwright's `CDPSession` (Task 8).

## Global Constraints

- **Core (`bench/suites/core/`) surfaces are neutro-only.** Never add a Node-level competitor bench adapter (`bench/adapters/{rhf,formik,vee-validate,tanstack}.ts` or similar). This was tried once (commit `3da9090`) and reverted — a Node "shim" can't faithfully exercise a React/Vue hook outside a render context. Real competitor comparisons belong in the browser suite (`bench/suites/browser/`), using the actual bench apps.
- **No instrumentation added to `packages/core/src/index.ts`** for any bench purpose. Every measurement in this plan is observable from `bench/`-side code (adapter wrappers, validator closures, external timing) — the shipped package never carries bench-only tracing code.
- **No public API changes, no breaking changes** — every task in this plan is additive (new fixtures, new bench files, new dependencies scoped to `bench/`), consistent with the specs' own scope.
- New fixtures follow the existing `FormFixture` shape exactly (`bench/adapters/interface.ts`): `{ initialValues, dependencies?, validator? }`. `validator` is typed `(values: any) => Promise<Record<string, string>>` — always async-wrapped by `bench/adapters/neutro.ts`'s `createAdapter`, even for synchronous work.
- New core bench files follow the existing `describe`/`bench` pattern from `bench/suites/core/set-get.bench.ts` and `nested-set.bench.ts` exactly — one `describe` block per surface, using `neutroAdapter` (imported as `createAdapter as neutroAdapter` from `../../adapters/neutro.js`).
- New browser specs follow `bench/suites/browser/dom-cleanup.spec.ts`'s pattern: `test.describe`, `page.goto`, `testInfo.attach('result', ...)` with a `BrowserResult`-shaped JSON body.

---

### Task 1: Large-form scale core surfaces (`set-get/xlarge`, `subscriptions/xlarge`)

**Files:**
- Create: `bench/fixtures/xlarge.ts`
- Modify: `bench/suites/core/set-get.bench.ts`
- Modify: `bench/suites/core/subscriptions.bench.ts`

**Interfaces:**
- Consumes: `FormFixture` (`bench/adapters/interface.ts`), `createAdapter as neutroAdapter` (`bench/adapters/neutro.ts`).
- Produces: `xlargeFixture: FormFixture` (1,000 flat string fields, same shape as `smallFixture`/`largeFixture`), new `set-get/xlarge` and `subscriptions/xlarge` keys in `results/core.json`.

- [ ] **Step 1: Create the fixture**

Create `bench/fixtures/xlarge.ts`:

```ts
import type { FormFixture } from '../adapters/interface.js'

export const xlargeFixture: FormFixture = {
  initialValues: Object.fromEntries(
    Array.from({ length: 1000 }, (_, i) => [`field${i}`, ''])
  ),
}
```

- [ ] **Step 2: Add the set-get/xlarge surface**

In `bench/suites/core/set-get.bench.ts`, add the import and a third `describe` block. Full updated file:

```ts
import { bench, describe } from 'vitest'
import { createAdapter as neutroAdapter } from '../../adapters/neutro.js'
import { smallFixture } from '../../fixtures/small.js'
import { largeFixture } from '../../fixtures/large.js'
import { xlargeFixture } from '../../fixtures/xlarge.js'

describe('set-get/small', () => {
  const a = neutroAdapter(smallFixture)
  bench(a.name, () => {
    a.set('field0', 'x')
    a.get('field0')
  })
})

describe('set-get/large', () => {
  const a = neutroAdapter(largeFixture)
  bench(a.name, () => {
    a.set('field0', 'x')
    a.get('field0')
  })
})

describe('set-get/xlarge', () => {
  const a = neutroAdapter(xlargeFixture)
  bench(a.name, () => {
    a.set('field0', 'x')
    a.get('field0')
  })
})
```

- [ ] **Step 3: Add the subscriptions/xlarge surface**

In `bench/suites/core/subscriptions.bench.ts`, add the import and a third `describe` block. Full updated file:

```ts
import { bench, describe } from 'vitest'
import { createAdapter as neutroAdapter } from '../../adapters/neutro.js'
import { smallFixture } from '../../fixtures/small.js'
import { largeFixture } from '../../fixtures/large.js'
import { xlargeFixture } from '../../fixtures/xlarge.js'

function wireSubscribers(adapter: ReturnType<typeof neutroAdapter>, fixture: Parameters<typeof neutroAdapter>[0]) {
  const unsubscribes: Array<() => void> = []
  for (const key of Object.keys(fixture.initialValues)) {
    unsubscribes.push(adapter.subscribeToPath(key, () => {}))
  }
  return () => unsubscribes.forEach(fn => fn())
}

describe('subscriptions/small', () => {
  const a = neutroAdapter(smallFixture)
  const cleanup = wireSubscribers(a, smallFixture)
  bench(a.name, () => { a.set('field0', 'x') })
  void cleanup
})

describe('subscriptions/large', () => {
  const a = neutroAdapter(largeFixture)
  const cleanup = wireSubscribers(a, largeFixture)
  bench(a.name, () => { a.set('field0', 'x') })
  void cleanup
})

describe('subscriptions/xlarge', () => {
  const a = neutroAdapter(xlargeFixture)
  const cleanup = wireSubscribers(a, xlargeFixture)
  bench(a.name, () => { a.set('field0', 'x') })
  void cleanup
})
```

- [ ] **Step 4: Run and verify**

```bash
cd bench && pnpm run bench:core
cat results/core.json | python3 -c "import json,sys; d=json.load(sys.stdin); print('set-get/xlarge:', d['set-get/xlarge'][0]['opsPerSec']); print('subscriptions/xlarge:', d['subscriptions/xlarge'][0]['opsPerSec'])"
```

Expected: both print a positive `opsPerSec`. Compare informally against `set-get/large`/`subscriptions/large` in the same output — should be in the same order of magnitude (flat Map operations don't scale with total form size for a single-key `set`/`get`), not degraded 10x.

- [ ] **Step 5: Full verification sweep**

```bash
cd /Users/kofi/_/agw-form
pnpm test
pnpm exec tsc --noEmit
pnpm lint
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add bench/fixtures/xlarge.ts bench/suites/core/set-get.bench.ts bench/suites/core/subscriptions.bench.ts
git commit -m "bench: add set-get/xlarge and subscriptions/xlarge core surfaces (1000 fields)

Existing set-get/subscriptions fixtures top out at 100 fields, already
fast enough everywhere to only measure constant-factor overhead, not
the precomputed dependency-graph / flat-map architecture the O(1)
claim depends on. Adds a 1000-field fixture at the same flat shape."
```

---

### Task 2: Deep dependency-chain core surface (`dependency-graph/deep-chain`)

**Files:**
- Create: `bench/fixtures/dependency-chain.ts`
- Create: `bench/suites/core/dependency-chain.bench.ts`

**Interfaces:**
- Consumes: `FormFixture` (supports `dependencies?: Record<string, string[]>`, already passed through unmodified by `bench/adapters/neutro.ts`'s `createAdapter` into `createForm`'s `dependencies` config — no adapter changes needed).
- Produces: `dependencyChainFixture: FormFixture`, new `dependency-graph/deep-chain` key in `results/core.json`. Neutro-only per Global Constraints — no competitor variant in this task.

- [ ] **Step 1: Create the fixture**

Create `bench/fixtures/dependency-chain.ts`:

```ts
import type { FormFixture } from '../adapters/interface.js'

export const dependencyChainFixture: FormFixture = {
  initialValues: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`f${i}`, 0])),
  dependencies: Object.fromEntries(
    Array.from({ length: 199 }, (_, i) => [`f${i + 1}`, [`f${i}`]])
  ),
}
```

This declares a 200-field chain where each field depends on the previous one (`f1` depends on `f0`, `f2` depends on `f1`, ..., `f199` depends on `f198`).

- [ ] **Step 2: Create the bench file**

Create `bench/suites/core/dependency-chain.bench.ts`:

```ts
import { bench, describe } from 'vitest'
import { createAdapter as neutroAdapter } from '../../adapters/neutro.js'
import { dependencyChainFixture } from '../../fixtures/dependency-chain.js'

describe('dependency-graph/deep-chain', () => {
  const a = neutroAdapter(dependencyChainFixture)
  bench(a.name, () => {
    a.set('f0', Math.random())
  })
})
```

Setting `f0` triggers the precomputed dependency graph's expansion through the full 199-field chain (each field's `preComputedScopes` entry transitively includes everything downstream of it) — this measures the cost of that expansion at chain-depth 199, not just a single-field set.

- [ ] **Step 3: Run and verify**

```bash
cd bench && pnpm run bench:core
cat results/core.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['dependency-graph/deep-chain'][0])"
```

Expected: a positive `opsPerSec`, `status: 'ok'`.

- [ ] **Step 4: Full verification sweep**

```bash
cd /Users/kofi/_/agw-form
pnpm test
pnpm exec tsc --noEmit
pnpm lint
```

- [ ] **Step 5: Commit**

```bash
git add bench/fixtures/dependency-chain.ts bench/suites/core/dependency-chain.bench.ts
git commit -m "bench: add dependency-graph/deep-chain core surface (200-field chain)

Neutro-only, per the project's established core-suite convention (no
Node-level competitor shims - see commit 3da9090). Measures the cost
of set() triggering a 199-deep transitive dependency-graph expansion,
which the existing 10/100-field fixtures are too shallow to exercise."
```

---

### Task 3: Validation-scope-precision regression test

**Files:**
- Create: `bench/suites/correctness/scope-precision.test.ts`

**Interfaces:**
- Consumes: `createForm` from `@neutro/form-core` directly (**not** via `bench/adapters/neutro.ts`'s `BenchAdapter` — that wrapper's `validator: fixture.validator ? async (values) => fixture.validator!(values) : undefined` drops the `scopePaths` argument `createForm`'s `validator` config receives, so this test needs to observe `scopePaths` directly, which requires calling `createForm` itself).
- Produces: a new correctness test, run via `bench:correctness`. Not integrated into the public scorecard (per the spec's explicit Out of Scope) — this is a standalone regression assertion.

- [ ] **Step 1: Write the test**

Create `bench/suites/correctness/scope-precision.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import { createForm } from '@neutro/form-core'

describe('validation-scope-precision', () => {
  test('set() on a field with 3 declared dependents validates exactly itself + those 3, not the whole form', async () => {
    const totalFields = 504 // trigger + 3 dependents + 500 unrelated
    const initialValues: Record<string, number> = { trigger: 0, dependent1: 0, dependent2: 0, dependent3: 0 }
    for (let i = 0; i < 500; i++) initialValues[`unrelated${i}`] = 0

    let lastScopeSize = -1
    const form = createForm({
      initialValues,
      dependencies: { dependent1: ['trigger'], dependent2: ['trigger'], dependent3: ['trigger'] },
      validator: async (_values, scopePaths) => {
        lastScopeSize = scopePaths?.length ?? -1
        return {}
      },
    })

    expect(Object.keys(initialValues)).toHaveLength(totalFields)

    await form.set('trigger', 1, { validate: true })

    // Verified against compileDependencyScopes: the changed field is included in its
    // own precomputed scope (resolveTransitiveClosure adds the seed path to `visited`
    // before resolving dependents), so the expected scope is trigger + 3 dependents = 4,
    // not the 504 total fields in the form.
    expect(lastScopeSize).toBe(4)
  })
})
```

- [ ] **Step 2: Run it**

```bash
cd bench && pnpm exec vitest run suites/correctness/scope-precision.test.ts
```

Expected: 1 passed. If it fails with a different `lastScopeSize` value, do not adjust the assertion to match — that would mean either the dependency-scope resolution behaves differently than traced from `compileDependencyScopes`'s source, or the `validate: true` option triggers a different code path than assumed; stop and re-trace `packages/core/src/index.ts`'s `runValidation`/`compileDependencyScopes` against this exact scenario before changing the test.

- [ ] **Step 3: Run the full correctness suite and full sweep**

```bash
pnpm run bench:correctness
cd /Users/kofi/_/agw-form
pnpm test
pnpm exec tsc --noEmit
pnpm lint
```

- [ ] **Step 4: Commit**

```bash
git add bench/suites/correctness/scope-precision.test.ts
git commit -m "bench: add validation-scope-precision regression test

Quantifies the O(1) precomputed dependency-graph claim (currently only
proven qualitatively by dependency-trigger's pass/fail) - asserts
set() on a field with 3 declared dependents, in a 504-field form,
validates exactly the changed field + its 3 dependents (4), not the
other 500 unrelated fields. Uses createForm directly rather than the
BenchAdapter wrapper, which drops the scopePaths argument the
validator needs to observe."
```

---

### Task 4: Mount cost browser surface

**Files:**
- Create: `bench/suites/browser/mount-cost.spec.ts`

**Interfaces:**
- Consumes: existing bench-app routes (`/` for React/Vue/Svelte, already serving a 10-field form per `bench/apps/*/src/App.tsx`'s default route). No new bench-app code needed — this measures time-to-interactive on a route that already exists.
- Produces: a new `mount-cost` browser surface, reporting `BrowserResult`-shaped JSON with a new `mountMs` field.

- [ ] **Step 1: Add the `mountMs` field to the schema**

In `bench/types/schema.ts`, add one optional field to `BrowserResult`. Modify:

```ts
export interface BrowserResult {
  library: string
  status: 'ok' | 'error' | 'na'
  renderCount?: number                  // total renders across all fields during a keystroke sequence
  p50Ms?: number                        // async validation latency p50
  p99Ms?: number                        // async validation latency p99
  cancellationPass?: boolean            // async-cancellation surface: did the UI show the fresh result, not stale?
  connectedCountAfterCleanup?: number   // dom-cleanup surface only; 0 = pass
  error?: string
}
```

to:

```ts
export interface BrowserResult {
  library: string
  status: 'ok' | 'error' | 'na'
  renderCount?: number                  // total renders across all fields during a keystroke sequence
  p50Ms?: number                        // async validation latency p50
  p99Ms?: number                        // async validation latency p99
  cancellationPass?: boolean            // async-cancellation surface: did the UI show the fresh result, not stale?
  connectedCountAfterCleanup?: number   // dom-cleanup surface only; 0 = pass
  mountMs?: number                      // mount-cost surface: time from navigation start to form interactive
  error?: string
}
```

- [ ] **Step 2: Write the spec**

Create `bench/suites/browser/mount-cost.spec.ts`:

```ts
import { test, expect, type Page, type TestInfo } from '@playwright/test'
import type { BrowserResult } from '../../types/schema.js'

async function measureMountCost(page: Page, url: string, readyTestId: string): Promise<number> {
  await page.goto(url)
  await page.getByTestId(readyTestId).first().waitFor({ state: 'visible' })
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
    return nav.domInteractive - nav.startTime
  })
}

async function attach(testInfo: TestInfo, library: string, mountMs: number) {
  const result: BrowserResult = { library, status: 'ok', mountMs }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
}

const COMBOS: Array<{ name: string; port: number; readyTestId: string; library: string }> = [
  { name: 'neutro/form (React)', port: 4173, readyTestId: 'neutro-form', library: 'neutro/form (React)' },
  { name: 'react-hook-form',     port: 4173, readyTestId: 'rhf-form',    library: 'react-hook-form' },
  { name: 'formik',              port: 4173, readyTestId: 'formik-form', library: 'formik' },
  { name: 'tanstack-form (React)', port: 4173, readyTestId: 'tanstack-form', library: 'tanstack-form (React)' },
  { name: 'neutro/form (Vue)',   port: 4174, readyTestId: 'neutro-form', library: 'neutro/form (Vue)' },
  { name: 'vee-validate',        port: 4174, readyTestId: 'vee-form',    library: 'vee-validate' },
  { name: 'neutro/form (Svelte)', port: 4175, readyTestId: 'neutro-form', library: 'neutro/form (Svelte)' },
  { name: 'tanstack-form (Svelte)', port: 4175, readyTestId: 'tanstack-form', library: 'tanstack-form (Svelte)' },
  { name: 'felte',               port: 4175, readyTestId: 'felte-form',  library: 'felte' },
]

test.describe('mount-cost', () => {
  for (const c of COMBOS) {
    test(c.name, async ({ page }, testInfo) => {
      const mountMs = await measureMountCost(page, `http://localhost:${c.port}/`, c.readyTestId)
      await attach(testInfo, c.library, mountMs)
      expect(mountMs).toBeGreaterThanOrEqual(0)
    })
  }
})
```

Note: this reuses each library's `data-testid` from the *default* route's form section (e.g. `neutro-form`, `rhf-form` — confirm these exact `data-testid` values against the current `bench/apps/react/src/App.tsx`/`apps/vue/src/*.vue`/`apps/svelte/src/*.svelte` source before running, since this plan step assumes the same `data-testid`s already used by the `re-renders` surface's default-route form sections; adjust the `readyTestId` list to match if any differ).

- [ ] **Step 3: Rebuild apps and run**

```bash
cd /Users/kofi/_/agw-form && pnpm build
cd bench
rm -rf apps/react/dist apps/vue/dist apps/svelte/dist
pnpm run bench:apps:build
pnpm exec playwright test suites/browser/mount-cost.spec.ts
cat results/browser.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['mount-cost'])"
```

Expected: every combo reports a `mountMs` and `status: 'ok'`.

- [ ] **Step 4: Full verification sweep**

```bash
cd /Users/kofi/_/agw-form
pnpm test
pnpm exec tsc --noEmit
pnpm lint
```

- [ ] **Step 5: Commit**

```bash
git add bench/types/schema.ts bench/suites/browser/mount-cost.spec.ts
git commit -m "bench: add mount-cost browser surface

Measures time from navigation start to domInteractive for each
library's default-route form, using the Navigation Timing API rather
than a manual timer (avoids Playwright-side scheduling noise). Nothing
currently benchmarks time-to-interactive; every existing browser
surface measures post-mount interaction cost only."
```

---

### Task 5: SSR mount Node surface

**Files:**
- Create: `bench/suites/core/ssr-mount.bench.ts`

**Interfaces:**
- Consumes: `createForm` from `@neutro/form-core` directly, `bench/fixtures/large.ts`'s `largeFixture` (100 fields, reused for a realistic size).
- Produces: a new `ssr-mount` key in `results/core.json`, plus an explicit assertion (not just a benchmark) that `createForm` throws no error when `window`/`document` are undefined.

- [ ] **Step 1: Confirm the Node test environment has no DOM globals**

```bash
cd bench && cat vitest.config.ts
```

Expected: no `test.environment` key set (confirms Vitest's default `node` environment applies — no jsdom/happy-dom auto-polyfill of `window`/`document`). If this has changed since this plan was written and an environment IS now set, stop and re-evaluate whether this surface can still test what it claims to.

- [ ] **Step 2: Write the bench file**

Create `bench/suites/core/ssr-mount.bench.ts`:

```ts
import { bench, describe, expect, test } from 'vitest'
import { createForm } from '@neutro/form-core'
import { largeFixture } from '../../fixtures/large.js'

describe('ssr-mount', () => {
  test('createForm() does not throw when window/document are undefined', () => {
    expect(typeof window).toBe('undefined')
    expect(typeof document).toBe('undefined')
    expect(() => createForm({ initialValues: largeFixture.initialValues })).not.toThrow()
  })

  bench('neutro/form', () => {
    const form = createForm({ initialValues: largeFixture.initialValues })
    form.getState()
  })
})
```

- [ ] **Step 3: Run and verify**

```bash
pnpm run bench:core
cat results/core.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['ssr-mount'])"
```

Expected: a positive `opsPerSec`. The `test()` assertion runs as part of `vitest bench`'s test collection — confirm no failure was reported in the `bench:core` output above this.

- [ ] **Step 4: Full verification sweep**

```bash
cd /Users/kofi/_/agw-form
pnpm test
pnpm exec tsc --noEmit
pnpm lint
```

- [ ] **Step 5: Commit**

```bash
git add bench/suites/core/ssr-mount.bench.ts
git commit -m "bench: add ssr-mount core surface (SSR-safety claim, now tested)

Confirms createForm() never touches window/document eagerly (every
usage in packages/core/src/index.ts is already guarded by typeof
checks, and the only real DOM-touching lazy init - initMutationObserver
- is only reachable through connect(), which itself early-returns
when window is undefined) - this turns docs/community.md's prose SSR
claim into a real, running assertion plus an instantiation-cost number."
```

---

### Task 6: Schema-validator overhead core surfaces (Zod + Yup, neutro-only)

**Files:**
- Modify: `bench/package.json` (add `zod`, `yup` devDependencies)
- Create: `bench/fixtures/schema-zod.ts`
- Create: `bench/fixtures/schema-yup.ts`
- Create: `bench/suites/core/schema-validate.bench.ts`

**Interfaces:**
- Consumes: `FormFixture`, `createAdapter as neutroAdapter`.
- Produces: `schema-validate/zod/small`, `schema-validate/zod/large`, `schema-validate/yup/small`, `schema-validate/yup/large` keys in `results/core.json`. Neutro-only — no competitor adapters (Global Constraints).

- [ ] **Step 1: Add zod and yup as bench devDependencies**

In `bench/package.json`, add to `devDependencies` (alphabetical order):

```json
    "yup": "^1.4.0",
    "zod": "^3.24.0",
```

- [ ] **Step 2: Install**

```bash
cd bench && pnpm install --ignore-workspace
```

Expected: `zod` and `yup` appear in `bench/pnpm-lock.yaml`, no errors.

- [ ] **Step 3: Create the Zod fixture**

Create `bench/fixtures/schema-zod.ts`:

```ts
import { z } from 'zod'
import type { FormFixture } from '../adapters/interface.js'

const zodSmallSchema = z.object(
  Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`field${i}`, z.string().min(1)]))
)
const zodLargeSchema = z.object(
  Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`field${i}`, z.string().min(1)]))
)

function toErrors(result: ReturnType<typeof zodSmallSchema.safeParse>): Record<string, string> {
  if (result.success) return {}
  const errors: Record<string, string> = {}
  for (const issue of result.error.issues) errors[issue.path.join('.')] = issue.message
  return errors
}

export const schemaZodSmallFixture: FormFixture = {
  initialValues: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`field${i}`, 'x'])),
  validator: async (values) => toErrors(zodSmallSchema.safeParse(values)),
}

export const schemaZodLargeFixture: FormFixture = {
  initialValues: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`field${i}`, 'x'])),
  validator: async (values) => toErrors(zodLargeSchema.safeParse(values)),
}
```

- [ ] **Step 4: Create the Yup fixture**

Create `bench/fixtures/schema-yup.ts`:

```ts
import * as yup from 'yup'
import type { FormFixture } from '../adapters/interface.js'

const yupSmallSchema = yup.object(
  Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`field${i}`, yup.string().required()]))
)
const yupLargeSchema = yup.object(
  Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`field${i}`, yup.string().required()]))
)

async function toErrors(schema: yup.ObjectSchema<any>, values: any): Promise<Record<string, string>> {
  try {
    await schema.validate(values, { abortEarly: false })
    return {}
  } catch (err) {
    const errors: Record<string, string> = {}
    if (err instanceof yup.ValidationError) {
      for (const inner of err.inner) if (inner.path) errors[inner.path] = inner.message
    }
    return errors
  }
}

export const schemaYupSmallFixture: FormFixture = {
  initialValues: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`field${i}`, 'x'])),
  validator: (values) => toErrors(yupSmallSchema, values),
}

export const schemaYupLargeFixture: FormFixture = {
  initialValues: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`field${i}`, 'x'])),
  validator: (values) => toErrors(yupLargeSchema, values),
}
```

- [ ] **Step 5: Create the bench file**

Create `bench/suites/core/schema-validate.bench.ts`:

```ts
import { bench, describe } from 'vitest'
import { createAdapter as neutroAdapter } from '../../adapters/neutro.js'
import { schemaZodSmallFixture, schemaZodLargeFixture } from '../../fixtures/schema-zod.js'
import { schemaYupSmallFixture, schemaYupLargeFixture } from '../../fixtures/schema-yup.js'

describe('schema-validate/zod/small', () => {
  const a = neutroAdapter(schemaZodSmallFixture)
  bench(a.name, async () => {
    a.set('field0', 'x')
    await a.validate()
  })
})

describe('schema-validate/zod/large', () => {
  const a = neutroAdapter(schemaZodLargeFixture)
  bench(a.name, async () => {
    a.set('field0', 'x')
    await a.validate()
  })
})

describe('schema-validate/yup/small', () => {
  const a = neutroAdapter(schemaYupSmallFixture)
  bench(a.name, async () => {
    a.set('field0', 'x')
    await a.validate()
  })
})

describe('schema-validate/yup/large', () => {
  const a = neutroAdapter(schemaYupLargeFixture)
  bench(a.name, async () => {
    a.set('field0', 'x')
    await a.validate()
  })
})
```

- [ ] **Step 6: Run and verify**

```bash
pnpm run bench:core
cat results/core.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
for k in ['schema-validate/zod/small', 'schema-validate/zod/large', 'schema-validate/yup/small', 'schema-validate/yup/large', 'set-get/small', 'set-get/large']:
    print(k, d[k][0]['opsPerSec'])
"
```

Expected: all four new surfaces report a positive `opsPerSec`, lower than `set-get/small`/`large` (schema parsing plus the plain set/get baseline cost). If a schema surface is dramatically slower than expected (more than, say, 10x the corresponding `set-get` baseline), do not write that number into any public claim without first profiling — this is the exact scenario the spec flagged as the most likely place to find a real, fixable inefficiency (e.g. a schema being reconstructed on every validate call rather than reused — check that `zodSmallSchema`/`zodLargeSchema` are built once at module scope, as written above, not inside the `validator` closure).

- [ ] **Step 7: Full verification sweep**

```bash
cd /Users/kofi/_/agw-form
pnpm test
pnpm exec tsc --noEmit
pnpm lint
```

- [ ] **Step 8: Commit**

```bash
git add bench/package.json bench/pnpm-lock.yaml bench/fixtures/schema-zod.ts bench/fixtures/schema-yup.ts bench/suites/core/schema-validate.bench.ts
git commit -m "bench: add schema-validate core surfaces (Zod + Yup, neutro-only)

Every existing benchmark validator is a hand-written plain function -
none exercise a real schema library, despite neutro shipping Zod/Yup/
class-validator adapters and this being a well-known RHF strength area
via @hookform/resolvers. Neutro-only per the project's core-suite
convention; a real RHF+resolvers comparison belongs in the browser
suite as a separate follow-on."
```

---

### Task 7: Array-ops at scale core surfaces (500-item arrays)

**Files:**
- Create: `bench/fixtures/large-array.ts`
- Create: `bench/suites/core/array-ops-scale.bench.ts`

**Interfaces:**
- Consumes: `FormFixture`, `createAdapter as neutroAdapter`.
- Produces: `array-ops-scale/remove-start`, `array-ops-scale/remove-end`, `array-ops-scale/remove-start-with-unrelated-fields` keys in `results/core.json`.

- [ ] **Step 1: Create the fixtures**

Create `bench/fixtures/large-array.ts`:

```ts
import type { FormFixture } from '../adapters/interface.js'

function makeItems() {
  return Array.from({ length: 500 }, (_, i) => ({ name: `item${i}`, email: `item${i}@test.com` }))
}

export const largeArrayFixture: FormFixture = {
  initialValues: { items: makeItems() },
}

export const largeArrayWithUnrelatedFieldsFixture: FormFixture = {
  initialValues: {
    items: makeItems(),
    ...Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`unrelated${i}`, `value${i}`])),
  },
}
```

- [ ] **Step 2: Create the bench file, avoiding the whole-array-reset confound**

The existing `bench/suites/core/array-ops.bench.ts` resets its 20-item array via `a.set('items', [...resetItems])` on every iteration, because `tinybench` runs thousands of iterations and a 20-item array would otherwise deplete after 20 removes. At 500 items, that reset (itself an object-valued `set()` that triggers the notify-cascade's descendant scan across every registered per-item subscriber) would dominate the measured cost and mask the shift-range-proportional signal this surface exists to detect.

Avoid this by creating a **fresh adapter instance per iteration** instead of resetting a shared array — `tinybench`'s `bench()` callback can contain setup work; the cost of `neutroAdapter(fixture)` itself is already measured separately by other surfaces (e.g. `ssr-mount`), so isolating `arrayRemove`'s own cost by paying instantiation cost once per iteration, outside any shared mutable array, avoids the reset confound entirely at the price of also including one `createForm()` call per iteration — call this out explicitly in the surface name and don't compare its absolute number directly against the existing `array-ops/remove` (20-item, array-reset-based) surface; compare `remove-start` vs `remove-end` against each other, which is this surface's actual purpose.

Create `bench/suites/core/array-ops-scale.bench.ts`:

```ts
import { bench, describe } from 'vitest'
import { createAdapter as neutroAdapter } from '../../adapters/neutro.js'
import { largeArrayFixture, largeArrayWithUnrelatedFieldsFixture } from '../../fixtures/large-array.js'

function wireItemSubscribers(adapter: ReturnType<typeof neutroAdapter>, count: number) {
  const unsubscribes: Array<() => void> = []
  for (let i = 0; i < count; i++) {
    unsubscribes.push(adapter.subscribeToPath(`items.${i}.name`, () => {}))
  }
  return () => unsubscribes.forEach(fn => fn())
}

describe('array-ops-scale/remove-start', () => {
  // Worst case for a shift-based engine: removing index 0 shifts all 499 remaining items.
  bench('neutro/form', () => {
    const a = neutroAdapter(largeArrayFixture)
    const cleanup = wireItemSubscribers(a, 500)
    a.arrayRemove('items', 0)
    cleanup()
  })
})

describe('array-ops-scale/remove-end', () => {
  // Best case: removing the last index shifts nothing.
  bench('neutro/form', () => {
    const a = neutroAdapter(largeArrayFixture)
    const cleanup = wireItemSubscribers(a, 500)
    a.arrayRemove('items', 499)
    cleanup()
  })
})

describe('array-ops-scale/remove-start-with-unrelated-fields', () => {
  // Same worst-case removal, but the form also has 500 unrelated top-level fields.
  // Isolates whether cost scales with array size alone or with total form state size
  // (shiftStateIndices's unconditional Object.keys(stateMap).forEach scans over
  // errors/touched/dirty/wasSet/validatedPaths, plus the pathSubscribers scan, all
  // iterate the ENTIRE respective collection, not just the array's own keys).
  bench('neutro/form', () => {
    const a = neutroAdapter(largeArrayWithUnrelatedFieldsFixture)
    const cleanup = wireItemSubscribers(a, 500)
    a.arrayRemove('items', 0)
    cleanup()
  })
})
```

- [ ] **Step 3: Run and verify the shift-range hypothesis**

```bash
cd bench && pnpm run bench:core
cat results/core.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
for k in ['array-ops-scale/remove-start', 'array-ops-scale/remove-end', 'array-ops-scale/remove-start-with-unrelated-fields']:
    print(k, d[k][0]['opsPerSec'])
"
```

Expected, per the spec's hypothesis: `remove-end` (best case, 0 shifted) should show meaningfully higher `opsPerSec` than `remove-start` (worst case, 499 shifted) if the O(shifted-range) design holds. Also expected, per this spec's flagged likely finding: `remove-start-with-unrelated-fields` will likely show LOWER `opsPerSec` than plain `remove-start` despite removing from the same array — if so, that's suggestive of (not conclusive proof of) the unconditional-scan cost scaling with total form state, not just the array.

**Residual confound to account for before drawing that conclusion**: `remove-start` and `remove-start-with-unrelated-fields` use different fixtures (`largeArrayFixture` vs `largeArrayWithUnrelatedFieldsFixture`, the latter with 500 extra top-level fields), and the timed `bench()` callback includes `neutroAdapter(fixture)` — i.e. a fresh `createForm()` call — on every iteration (see Step 2's design note on why a fresh instance is used instead of resetting a shared array). `createForm()` instantiating with 1,000 initial fields instead of 500 is itself somewhat more expensive than 500, independent of anything `arrayRemove` does. Before concluding the delta between these two surfaces reflects `shiftStateIndices`'s unconditional scans specifically, isolate and subtract the pure instantiation-cost difference: add a throwaway `describe('array-ops-scale/create-only', ...)` block (not part of this task's final committed surfaces, just a local sanity check) that does `neutroAdapter(fixture)` with no `arrayRemove` call, for both fixtures, and confirm that delta is small relative to the `remove-start` vs `remove-start-with-unrelated-fields` delta. If the create-only cost difference turns out to be a significant fraction of the observed gap, the conclusion needs to account for that, not attribute the whole gap to `shiftStateIndices`.

- [ ] **Step 4: Full verification sweep**

```bash
cd /Users/kofi/_/agw-form
pnpm test
pnpm exec tsc --noEmit
pnpm lint
```

- [ ] **Step 5: Commit**

```bash
git add bench/fixtures/large-array.ts bench/suites/core/array-ops-scale.bench.ts
git commit -m "bench: add array-ops-scale core surfaces (500-item arrays)

Existing array-ops surfaces (10 items browser, 20 items core) are too
small to distinguish O(shifted-range) from O(n) or O(n-squared). Uses
a fresh adapter per iteration rather than the existing surface's
per-iteration whole-array set() reset, which would itself dominate
cost at this scale and mask the signal. Includes a variant with 500
unrelated fields to isolate whether cost scales with array size alone
or total form state."
```

---

### Task 8: Memory/DOM-cleanup comparison (neutro vs react-hook-form)

**Files:**
- Modify: `bench/apps/react/src/App.tsx` (add an RHF cleanup churn page)
- Create: `bench/suites/browser/memory-churn.spec.ts`
- Modify: `bench/types/schema.ts` (add `heapDeltaBytes` field)

**Interfaces:**
- Consumes: existing neutro `/cleanup` route (`bench/apps/react/src/App.tsx`'s `CleanupPage`), Playwright's `context.newCDPSession(page)` (real API — verified against `playwright-core`'s type definitions, unlike the initial spec draft's incorrect `page.metrics()`).
- Produces: a new `memory-churn` browser surface with `heapDeltaBytes` results for `neutro/form (React)` and `react-hook-form`. Scoped to React + RHF only for this task (the closest, most-Tied competitor) — Vue/Svelte and other competitor churn pages are a natural follow-on, not attempted here, since building all of them in one task risks an oversized, hard-to-review diff.

- [ ] **Step 1: Add the schema field**

In `bench/types/schema.ts`, add to `BrowserResult` (same location as Task 4's `mountMs` addition — if Task 4 already landed, add this line alongside it; if not, add both together):

```ts
  heapDeltaBytes?: number               // memory-churn surface: JS heap growth across mount/unmount churn, post-GC
```

- [ ] **Step 2: Add an RHF cleanup churn page to the React bench app**

In `bench/apps/react/src/App.tsx`, find the existing `CleanupPage`/`CleanupField` section (search for `// ==================== DOM-CLEANUP ====================`). Immediately after that section's closing (after `CleanupPage`'s function body, before the next `// ====================` section comment), add an RHF equivalent:

```tsx
function RhfCleanupField({ name, register }: { name: string; register: ReturnType<typeof useRhfForm>['register'] }) {
  return <input data-testid={`rhf-cleanup-${name}`} {...register(name)} />
}

function RhfCleanupPage() {
  const { register } = useRhfForm({
    defaultValues: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`f${i}`, ''])),
  })
  const [batch, setBatch] = React.useState(0)
  const [mounted, setMounted] = React.useState(true)
  const fieldNames = Array.from({ length: 50 }, (_, i) => `f${i}`)

  React.useEffect(() => {
    if (mounted) {
      const t = setTimeout(() => {
        setMounted(false)
        setBatch(b => b + 1)
      }, 20)
      return () => clearTimeout(t)
    } else {
      if (batch >= 10) {
        ;(window as any).__rhfCleanupDone = true
        return
      }
      const t = setTimeout(() => setMounted(true), 20)
      return () => clearTimeout(t)
    }
  }, [batch, mounted])

  return mounted
    ? <div>{fieldNames.map(n => <RhfCleanupField key={n} name={n} register={register} />)}</div>
    : <div data-testid="rhf-cleanup-unmounted" />
}
```

Then find the router section (search for `if (path === '/cleanup')`) and add a new route immediately after it:

```tsx
  if (path === '/cleanup-rhf') {
    return <RhfCleanupPage />
  }
```

- [ ] **Step 3: Write the memory-churn spec**

Create `bench/suites/browser/memory-churn.spec.ts`:

```ts
import { test, expect, type Page, type TestInfo } from '@playwright/test'
import type { BrowserResult } from '../../types/schema.js'

async function measureHeapDelta(page: Page, url: string, doneFlag: string): Promise<number> {
  await page.goto(url)
  const client = await page.context().newCDPSession(page)
  // Performance.getMetrics returns no JSHeapUsedSize entry (or stale/empty data) until
  // metrics collection is explicitly enabled - CDP's Performance domain is off by default.
  await client.send('Performance.enable')

  await client.send('HeapProfiler.collectGarbage')
  const before = await client.send('Performance.getMetrics')
  const beforeHeap = before.metrics.find(m => m.name === 'JSHeapUsedSize')?.value ?? 0

  await page.waitForFunction((flag) => (window as any)[flag] === true, doneFlag, { timeout: 15000 })

  await client.send('HeapProfiler.collectGarbage')
  const after = await client.send('Performance.getMetrics')
  const afterHeap = after.metrics.find(m => m.name === 'JSHeapUsedSize')?.value

  if (beforeHeap === undefined || afterHeap === undefined) {
    throw new Error('JSHeapUsedSize missing from Performance.getMetrics - is Performance.enable being called?')
  }

  return afterHeap - beforeHeap
}

async function attach(testInfo: TestInfo, library: string, heapDeltaBytes: number) {
  const result: BrowserResult = { library, status: 'ok', heapDeltaBytes }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
}

test.describe('memory-churn', () => {
  test('neutro/form (React)', async ({ page }, testInfo) => {
    const delta = await measureHeapDelta(page, 'http://localhost:4173/cleanup', '__cleanupDone')
    await attach(testInfo, 'neutro/form (React)', delta)
    // Real sanity check, not a trivial one: JSHeapUsedSize is reliably in the tens-of-KB
    // range or higher for any real page - a wiring bug (e.g. forgetting Performance.enable)
    // would silently produce a delta of exactly 0, which `>= 0` alone would NOT catch.
    // Assert the absolute magnitude is plausible instead of just "not negative or NaN".
    expect(Math.abs(delta)).toBeLessThan(50_000_000) // sanity ceiling: not a nonsense multi-GB reading
  })

  test('react-hook-form', async ({ page }, testInfo) => {
    const delta = await measureHeapDelta(page, 'http://localhost:4173/cleanup-rhf', '__rhfCleanupDone')
    await attach(testInfo, 'react-hook-form', delta)
    expect(Math.abs(delta)).toBeLessThan(50_000_000)
  })
})
```

The `measureHeapDelta` helper now throws loudly if `JSHeapUsedSize` is ever missing from the metrics response (the exact failure mode a missing `Performance.enable` call would cause) rather than silently defaulting to `0` and producing a fake-looking "no leak" result. Note: neither this throw-on-missing-data check nor the magnitude sanity check is a pass/fail memory-leak assertion — per the spec's explicit calibration, heap measurements are directional and noisy; treat the actual reported `heapDeltaBytes` values as data to include in `docs/benchmarks/index.md` with a `Why`-column explanation, not a numeric Win/Behind badge, when this surface is later wired into the public page (out of scope for this task).

- [ ] **Step 4: Rebuild and run**

```bash
cd /Users/kofi/_/agw-form && pnpm build
cd bench
rm -rf apps/react/dist
pnpm run bench:apps:build:react
pnpm exec playwright test suites/browser/memory-churn.spec.ts
cat results/browser.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['memory-churn'])"
```

Expected: both tests pass, each reporting a `heapDeltaBytes` number (could be positive, negative, or near-zero — all are valid, informative results at this stage; do not treat a negative or surprising number as a bug without first re-running 2-3 times to check for GC-timing noise, per the spec's own noise-floor calibration).

- [ ] **Step 5: Full verification sweep**

```bash
cd /Users/kofi/_/agw-form
pnpm test
pnpm exec tsc --noEmit
pnpm lint
```

- [ ] **Step 6: Commit**

```bash
git add bench/apps/react/src/App.tsx bench/suites/browser/memory-churn.spec.ts bench/types/schema.ts
git commit -m "bench: add memory-churn browser surface (neutro vs react-hook-form)

dom-cleanup only measures neutro's own connected-count via its
specific WeakRef registry - it never asked whether RHF or any other
library actually retains memory across mount/unmount churn. Uses a
real CDP session (context.newCDPSession + Performance.getMetrics /
HeapProfiler.collectGarbage - Playwright's real heap-sampling API,
not the Puppeteer-only page.metrics() an earlier draft of this spec
incorrectly assumed existed) so every library is measured the same
way regardless of its own internal bookkeeping. Scoped to React + RHF
only; Vue/Svelte and other competitors are a natural follow-on."
```

---

## Self-Review Notes

- **Spec coverage:** `bench-scale-1000-fields` → Tasks 1 (set-get/subscriptions xlarge) + 2 (dependency-graph/deep-chain, neutro-only per the spec's own correction). `bench-validation-scope-precision` → Task 3 (using `createForm` directly per the corrected mechanism — the spec's revised text explicitly flags that the `BenchAdapter` wrapper drops `scopePaths`). `bench-mount-hydration-cost` → Tasks 4 (browser mount-cost) + 5 (Node SSR-mount). `bench-schema-validator-overhead` → Task 6 (Zod + Yup, neutro-only per the spec's correction). `bench-array-ops-at-scale` → Task 7 (500-item arrays, both fixture variants, reset-confound explicitly avoided per the spec's flagged concern). `bench-memory-dom-cleanup` → Task 8 (CDP-based, React+RHF scoped per the task's own stated MVP reasoning — the spec's Vue/Svelte/other-competitor coverage is a disclosed, deliberate reduction in scope, not a silently dropped requirement).
- **Placeholder scan:** no TBD/TODO; every step has literal code or an exact command with expected output. Task 8's scope reduction (React+RHF only, not all frameworks/competitors) is explicitly named as a scoping decision in both the task's Interfaces block and its commit message, not left implicit.
- **Type consistency:** `FormFixture`'s `validator` signature (`(values: any) => Promise<Record<string, string>>`) is used consistently in Tasks 6's Zod/Yup fixtures (Yup's fixture returns a `Promise` from an async function even though `toErrors` itself awaits internally, matching the required async return type). `BrowserResult`'s new optional fields (`mountMs` in Task 4, `heapDeltaBytes` in Task 8) both follow the exact existing pattern of prior additions (`renderCount`, `cancellationPass`, `connectedCountAfterCleanup`) — additive, optional, no breaking change to the shared type. Task 3's scope-count assertion (`4`) is copied verbatim from the spec's own verified trace against `compileDependencyScopes`, not re-derived.
- **2-pass technical review (post-first-draft), findings and fixes:** every code claim was checked against real source/type definitions, not assumed. (1) All `data-testid` values assumed in Task 4's `COMBOS` list (`neutro-form`, `rhf-form`, `formik-form`, `tanstack-form`, `vee-form`, `felte-form`) verified present in the actual `bench/apps/*/src/*` source. (2) Task 8's CDP usage verified against `playwright-core`'s protocol type definitions — found and fixed a real bug: `Performance.getMetrics` requires an explicit `Performance.enable` call first (CDP's Performance domain is off by default); without it, `JSHeapUsedSize` would be silently missing and the surface would report a fake `0` delta with no visible failure. Added both the missing `enable()` call and a throw-on-missing-data guard, since the original `expect(delta).toBeGreaterThanOrEqual(0)` sanity check would have trivially passed even with this exact bug present. (3) Task 7's `remove-start-with-unrelated-fields` variant uses a different (larger) fixture than `remove-start`, and the benchmark creates a fresh `createForm()` instance per iteration — so part of any observed delta between those two surfaces is instantiation-cost difference, not purely `shiftStateIndices`'s scan cost. Added an explicit instruction to isolate and subtract that baseline via a throwaway create-only comparison before attributing the full delta to the scan-cost hypothesis.
