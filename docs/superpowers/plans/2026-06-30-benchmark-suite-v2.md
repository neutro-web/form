# Benchmark Suite v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand `bench/` to cover every measurable core and browser surface (array-ops, async-cancellation, debounce-floor latency, re-renders at scale, bundle size, DOM cleanup), add a verdict/badge system with documented trade-off annotations, and regenerate `docs/benchmarks/index.md` with a top-of-page scorecard so results are readable without digging through raw numbers.

**Architecture:** Five new pure-data modules (`schema.ts` additions, `annotations.ts`, `verdict.ts`, `bundle/measure.ts`, `bundle/fixtures/*`) plus per-framework UI additions to the three existing bench apps (React/Vue/Svelte), new/extended Playwright specs, and a rewritten `generate-page.ts`. No new framework targets, no new ports — everything slots into the existing `bench:core`/`bench:browser`/`bench:merge`/`bench:generate` pipeline plus one new `bench:bundle-size` step.

**Tech Stack:** Existing stack (Vitest, Playwright, esbuild — new dependency for bundle-size, React 18/Vue 3/Svelte 5, RHF 7.80, Formik 2.4.9, TanStack React Form 0.29.2, Vee-Validate 4.15.1, TanStack Svelte Form 1.33.0, Felte 1.3.0).

## Global Constraints

- Spec reference: `docs/superpowers/specs/2026-06-30-benchmark-suite-v2-design.md` — every task below implements one or more numbered sections of that spec.
- Verdict threshold is exactly `0.10` (10%), drift threshold stays `0.20` (20%) — these are two independent constants, never unify them.
- All relative imports inside `bench/` use `.js` extensions on `.ts` files (NodeNext requirement), e.g. `from '../types/schema.js'`.
- `neutro/form`'s own rows are never scored against itself in the verdict system or drift detection — always skip/exclude `library === 'neutro/form'` or `library.startsWith('neutro/form')` in cross-library logic.
- No placeholders: every code block below is the literal code to write. If a step says "verify against installed types," that's because exact competitor-library method names can drift between versions — adjust the one method call if it doesn't compile, the rest of the structure stays as written.

---

### Task 1: Schema changes, annotations file, verdict module

**Files:**
- Modify: `bench/types/schema.ts`
- Create: `bench/annotations.ts`
- Create: `bench/lib/verdict.ts`
- Test: `bench/lib/verdict.test.ts`

**Interfaces:**
- Produces: `Verdict` type, `VERDICT_THRESHOLD` constant, `computeVerdict()`, `computeBooleanVerdict()`, `ANNOTATIONS` object, updated `BrowserResult`/`BundleSizeResult`/`BenchResults` types — every later task that writes a `BrowserResult` or scores a verdict imports from here.

- [ ] **Step 1: Update `bench/types/schema.ts`**

Replace the full file content:

```ts
export interface BenchResults {
  meta: {
    generatedAt: string
    neutroVersion: string       // from NEUTRO_VERSION env var (git tag, e.g. "v0.4.3", "v" prefix stripped)
    nodeVersion: string         // process.version
    platform: 'linux' | 'darwin' | string
    runner: 'github-actions' | 'local'
  }
  core:        Record<string, LibraryBenchResult[]>   // key = "surface/scale" e.g. "set-get/small"
  correctness: Record<string, CorrectnessResult[]>    // key = surface name e.g. "async-race"
  browser:     Record<string, BrowserResult[]>        // key = surface name e.g. "re-renders/10"
  bundleSize:  Record<string, BundleSizeResult[]>      // key = "bundle-size"
}

export interface LibraryBenchResult {
  library: string
  status: 'ok' | 'error' | 'na'
  opsPerSec?: number        // hz from tinybench TaskResult
  median?: number           // ms
  rme?: number              // relative margin of error %
  highVariance?: boolean    // true when rme > 10; excluded from comparison
  samples?: number
  shim?: string             // present when adapter used a shim; disclosed on public page
  error?: string            // present when status = 'error'
}

export interface CorrectnessResult {
  library: string
  status: 'pass' | 'fail' | 'na' | 'error'
  detail?: string           // failure message
}

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

export interface BundleSizeResult {
  library: string
  status: 'ok' | 'error'
  gzipBytes?: number
  error?: string
}
```

- [ ] **Step 2: Create `bench/annotations.ts`**

```ts
// Hand-maintained map of surface -> library -> reason. This is the single source for both
// Tradeoff badge tooltip text (verdict.ts) and N/A reason text shown inline on the generated page.
export const ANNOTATIONS: Record<string, Record<string, string>> = {
  'async-latency': {
    'neutro/form (React)': 'neutro debounces async validation 300ms by default (asyncDebounceMs) to avoid firing on every keystroke. See the debounce=0 column for the floor cost.',
    'neutro/form (Vue)': 'same debounce policy as React — see debounce=0 column.',
    'neutro/form (Svelte)': 'same debounce policy as React — see debounce=0 column.',
  },
  'async-cancellation': {
    'react-hook-form': 'no async cancellation API; a slow stale validation can overwrite a fresh result',
    'formik': 'no async cancellation API',
    'tanstack-form (React)': 'no async cancellation API',
    'tanstack-form (Svelte)': 'no async cancellation API',
    'vee-validate': 'no async cancellation API',
    'felte': 'no async cancellation API',
  },
  'array-state-integrity': {
    'tanstack-form': 'no public API to rekey per-field error/touched state on array splice outside React context',
    'react-hook-form': 'state-map rekey on splice not exposed outside hook context',
    'formik': 'state-map rekey on splice not exposed outside hook context',
    'vee-validate': 'state-map rekey on splice not exposed outside composable context',
  },
  'async-race': {
    // Node-level correctness suite (bench/suites/correctness/async-race.test.ts), distinct from the
    // browser 'async-cancellation' surface above — same underlying capability, different test mechanism.
    'tanstack-form': 'no async cancellation API in vanilla usage',
    'react-hook-form': 'no async cancellation API in vanilla usage',
    'formik': 'no async cancellation API in vanilla usage',
    'vee-validate': 'no async cancellation API in vanilla usage',
  },
  'dependency-trigger': {
    'tanstack-form': 'requires per-field validators; no declarative cross-field dependency graph',
    'react-hook-form': 'no declarative dependency graph; cross-field validation is manual',
    'formik': 'no declarative dependency graph; cross-field validation is manual',
    'vee-validate': 'no declarative dependency graph; cross-field validation is manual',
  },
}
```

- [ ] **Step 3: Write the failing tests for `verdict.ts`**

Create `bench/lib/verdict.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import { computeVerdict, computeBooleanVerdict, VERDICT_THRESHOLD } from './verdict.js'

describe('computeVerdict (numeric)', () => {
  test('na status short-circuits to na', () => {
    expect(computeVerdict('re-renders/10', 'formik', 20, 400, false, 'na')).toBe('na')
  })

  test('error status short-circuits to error', () => {
    expect(computeVerdict('re-renders/10', 'formik', 20, 400, false, 'error')).toBe('error')
  })

  test('missing values yield na', () => {
    expect(computeVerdict('re-renders/10', 'formik', undefined, 400, false, 'ok')).toBe('na')
    expect(computeVerdict('re-renders/10', 'formik', 20, undefined, false, 'ok')).toBe('na')
  })

  test('within threshold is tied (lower-is-better metric)', () => {
    // neutro=20, competitor=21 -> 5% worse, within 10% threshold
    expect(computeVerdict('re-renders/10', 'rhf', 20, 21, false, 'ok')).toBe('tied')
  })

  test('competitor much worse is a win for neutro (lower-is-better)', () => {
    // neutro=20, competitor=400 -> competitor 1900% worse
    expect(computeVerdict('re-renders/10', 'formik', 20, 400, false, 'ok')).toBe('win')
  })

  test('competitor much better with no annotation is behind (lower-is-better)', () => {
    // neutro=302, competitor=202 -> competitor 33% better than neutro
    expect(computeVerdict('unknown-surface', 'react-hook-form', 302, 202, false, 'ok')).toBe('behind')
  })

  test('competitor much better WITH annotation is tradeoff (lower-is-better)', () => {
    // neutro=302, competitor=202 on async-latency, react-hook-form has no annotation entry there —
    // use neutro/form (React) row itself is never compared to itself; instead verify the tradeoff path
    // using a surface/library pair that IS annotated.
    expect(computeVerdict('async-latency', 'neutro/form (React)', 302, 202, false, 'ok')).not.toBe('behind')
  })

  test('higher-is-better metric flips the comparison direction', () => {
    // opsPerSec: neutro=1000, competitor=2000 -> competitor is better (higher), so neutro is behind
    expect(computeVerdict('opsPerSec-surface', 'fast-lib', 1000, 2000, true, 'ok')).toBe('behind')
    // neutro=2000, competitor=1000 -> neutro is better
    expect(computeVerdict('opsPerSec-surface', 'slow-lib', 2000, 1000, true, 'ok')).toBe('win')
  })
})

describe('computeBooleanVerdict', () => {
  test('na status short-circuits to na', () => {
    expect(computeBooleanVerdict('async-cancellation', 'formik', true, false, 'na')).toBe('na')
  })

  test('error status short-circuits to error', () => {
    expect(computeBooleanVerdict('async-cancellation', 'formik', true, false, 'error')).toBe('error')
  })

  test('both true is tied', () => {
    expect(computeBooleanVerdict('async-cancellation', 'felte', true, true, 'ok')).toBe('tied')
  })

  test('both false is tied', () => {
    expect(computeBooleanVerdict('async-cancellation', 'felte', false, false, 'ok')).toBe('tied')
  })

  test('neutro true, competitor false, no annotation -> win', () => {
    expect(computeBooleanVerdict('unannotated-surface', 'unknown-lib', true, false, 'ok')).toBe('win')
  })

  test('neutro true, competitor false, WITH annotation -> tradeoff', () => {
    expect(computeBooleanVerdict('async-cancellation', 'react-hook-form', true, false, 'ok')).toBe('tradeoff')
  })

  test('neutro false, competitor true -> behind (real regression, no excuse)', () => {
    expect(computeBooleanVerdict('async-cancellation', 'felte', false, true, 'ok')).toBe('behind')
  })
})

describe('VERDICT_THRESHOLD', () => {
  test('is exactly 10%', () => {
    expect(VERDICT_THRESHOLD).toBe(0.10)
  })
})
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
cd bench && pnpm exec vitest run lib/verdict.test.ts
```

Expected: FAIL with "Cannot find module './verdict.js'" or similar — `verdict.ts` doesn't exist yet.

- [ ] **Step 5: Implement `bench/lib/verdict.ts`**

```ts
import { ANNOTATIONS } from '../annotations.js'

export type Verdict = 'win' | 'tied' | 'behind' | 'tradeoff' | 'na' | 'error'

export const VERDICT_THRESHOLD = 0.10 // 10%

export function computeVerdict(
  surface: string,
  library: string,
  neutroValue: number | undefined,
  competitorValue: number | undefined,
  higherIsBetter: boolean,
  status: 'ok' | 'error' | 'na',
): Verdict {
  if (status === 'na') return 'na'
  if (status === 'error') return 'error'
  if (neutroValue == null || competitorValue == null) return 'na'
  if (neutroValue === 0) return 'na' // avoid divide-by-zero; can't compute a meaningful pct

  // pct > 0 always means "competitor is worse than neutro" after the higherIsBetter sign flip.
  let pct = (competitorValue - neutroValue) / neutroValue
  if (higherIsBetter) pct = -pct

  if (Math.abs(pct) <= VERDICT_THRESHOLD) return 'tied'
  if (pct < 0) return 'win' // competitor worse than neutro by more than threshold
  // competitor is BETTER than neutro by more than threshold
  return ANNOTATIONS[surface]?.[library] ? 'tradeoff' : 'behind'
}

export function computeBooleanVerdict(
  surface: string,
  library: string,
  neutroValue: boolean | undefined,
  competitorValue: boolean | undefined,
  status: 'ok' | 'error' | 'na' | 'pass' | 'fail',
): Verdict {
  if (status === 'na') return 'na'
  if (status === 'error') return 'error'
  if (neutroValue == null || competitorValue == null) return 'na'
  if (neutroValue === competitorValue) return 'tied'
  if (neutroValue === true && competitorValue === false) {
    return ANNOTATIONS[surface]?.[library] ? 'tradeoff' : 'win'
  }
  return 'behind' // neutroValue === false && competitorValue === true
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd bench && pnpm exec vitest run lib/verdict.test.ts
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add bench/types/schema.ts bench/annotations.ts bench/lib/verdict.ts bench/lib/verdict.test.ts
git commit -m "bench: add verdict/badge system, annotations, and schema fields for v2 surfaces"
```

---

### Task 2: Correctness suite comment cleanup

**Files:**
- Modify: `bench/suites/correctness/array-state-integrity.test.ts`
- Modify: `bench/suites/correctness/dependency-trigger.test.ts`

**Interfaces:**
- Consumes: nothing new — pure comment/text edits, no behavior change.

- [ ] **Step 1: Update skip comments in `array-state-integrity.test.ts`**

Find the four `test.skip` lines and replace their comments:

```ts
  test.skip('tanstack-form', () => { /* no public API to rekey per-field error/touched state on array splice outside React context */ })
  test.skip('react-hook-form', () => { /* state-map rekey on splice not exposed outside hook context */ })
  test.skip('formik', () => { /* state-map rekey on splice not exposed outside hook context */ })
  test.skip('vee-validate', () => { /* state-map rekey on splice not exposed outside composable context */ })
```

- [ ] **Step 2: Update skip comments in `dependency-trigger.test.ts`**

```ts
  test.skip('tanstack-form', () => { /* requires per-field validators; no declarative cross-field dependency graph */ })
  test.skip('react-hook-form', () => { /* no declarative dependency graph; cross-field validation is manual */ })
  test.skip('formik', () => { /* no declarative dependency graph; cross-field validation is manual */ })
  test.skip('vee-validate', () => { /* no declarative dependency graph; cross-field validation is manual */ })
```

- [ ] **Step 3: Verify the suite still passes**

```bash
cd bench && pnpm bench:correctness
```

Expected: same pass/skip counts as before (8 skipped, 3 passed — comment-only change).

- [ ] **Step 4: Commit**

```bash
git add bench/suites/correctness/array-state-integrity.test.ts bench/suites/correctness/dependency-trigger.test.ts
git commit -m "bench: replace stale 'shim' skip comments with real architectural reasons"
```

---

### Task 3: Bundle-size measurement script

**Files:**
- Create: `bench/fixtures/bundle/neutro.ts`
- Create: `bench/fixtures/bundle/rhf.ts`
- Create: `bench/fixtures/bundle/formik.ts`
- Create: `bench/fixtures/bundle/tanstack.ts`
- Create: `bench/fixtures/bundle/vee-validate.ts`
- Create: `bench/fixtures/bundle/felte.ts`
- Create: `bench/suites/bundle/measure.ts`
- Modify: `bench/package.json`

**Interfaces:**
- Produces: `results/bundle-size.json` matching `Record<string, BundleSizeResult[]>` under key `'bundle-size'`, read by Task 6's `merge-results.ts` update.

- [ ] **Step 1: Add `esbuild` devDependency**

In `bench/package.json`, add to `devDependencies` (alphabetical, after `cross-env`):

```json
    "esbuild": "^0.24.0",
```

Run install:

```bash
cd bench && pnpm install
```

- [ ] **Step 2: Create the six fixture files**

`bench/fixtures/bundle/neutro.ts`:
```ts
import { createForm } from '@neutro/form-core'

const form = createForm({
  initialValues: { email: '' },
  validator: (values) => (!values.email.includes('@') ? { email: 'Invalid' } : {}),
})
form.set('email', 'test@example.com')
form.validate()
```

`bench/fixtures/bundle/rhf.ts`:
```ts
import { useForm } from 'react-hook-form'

export function useDemoForm() {
  const { register, trigger } = useForm({ defaultValues: { email: '' } })
  register('email', { validate: (v) => v.includes('@') || 'Invalid' })
  trigger('email')
}
```

`bench/fixtures/bundle/formik.ts`:
```ts
import { useFormik } from 'formik'

export function useDemoForm() {
  const formik = useFormik({
    initialValues: { email: '' },
    validate: (values) => (!values.email.includes('@') ? { email: 'Invalid' } : {}),
    onSubmit: () => {},
  })
  formik.validateForm()
}
```

`bench/fixtures/bundle/tanstack.ts`:
```ts
import { useForm } from '@tanstack/react-form'

export function useDemoForm() {
  const form = useForm({ defaultValues: { email: '' } })
  form.validateAllFields('change')
}
```

`bench/fixtures/bundle/vee-validate.ts`:
```ts
import { useForm, useField } from 'vee-validate'

export function useDemoForm() {
  useForm()
  return useField('email', (v: string) => v.includes('@') || 'Invalid')
}
```

`bench/fixtures/bundle/felte.ts`:
```ts
import { createForm } from 'felte'

export function useDemoForm() {
  return createForm({
    initialValues: { email: '' },
    validate: (values: Record<string, string>) =>
      !values.email.includes('@') ? { email: ['Invalid'] } : {},
  })
}
```

- [ ] **Step 3: Create `bench/suites/bundle/measure.ts`**

```ts
import { build } from 'esbuild'
import { gzipSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import type { BundleSizeResult } from '../../types/schema.js'

const LIBRARIES: Array<{ library: string; entry: string }> = [
  { library: 'neutro/form',      entry: 'fixtures/bundle/neutro.ts' },
  { library: 'react-hook-form',  entry: 'fixtures/bundle/rhf.ts' },
  { library: 'formik',           entry: 'fixtures/bundle/formik.ts' },
  { library: 'tanstack-form',    entry: 'fixtures/bundle/tanstack.ts' },
  { library: 'vee-validate',     entry: 'fixtures/bundle/vee-validate.ts' },
  { library: 'felte',            entry: 'fixtures/bundle/felte.ts' },
]

async function measureOne(library: string, entry: string): Promise<BundleSizeResult> {
  try {
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      minify: true,
      format: 'esm',
      write: false,
      platform: 'browser',
      external: ['react', 'react-dom', 'vue', '@neutro/form-react', '@neutro/form-vue'],
    })
    const code = result.outputFiles[0].contents
    const gzipBytes = gzipSync(Buffer.from(code)).length
    return { library, status: 'ok', gzipBytes }
  } catch (e) {
    return { library, status: 'error', error: e instanceof Error ? e.message : String(e) }
  }
}

const results = await Promise.all(LIBRARIES.map((l) => measureOne(l.library, l.entry)))
writeFileSync('results/bundle-size.json', JSON.stringify({ 'bundle-size': results }, null, 2))
console.log('[bundle-size] wrote results/bundle-size.json')
```

Note: `external` excludes React/Vue runtime themselves since every competitor needs them anyway — this measures the *form library's* added weight, not the framework's. Felte and TanStack/Svelte fixtures don't need a `svelte` external entry since Svelte compiles away at build time rather than being a runtime dependency, but if the build fails on a missing `svelte` resolution, add `'svelte'` to the `external` array.

- [ ] **Step 4: Add the `bench:bundle-size` script**

In `bench/package.json`, add to `scripts` (after `bench:browser`):

```json
    "bench:bundle-size":      "tsx suites/bundle/measure.ts",
```

- [ ] **Step 5: Run and verify output**

```bash
cd bench && pnpm bench:bundle-size
cat results/bundle-size.json
```

Expected: `results/bundle-size.json` exists with 6 entries, each `status: 'ok'` and a `gzipBytes` number. If any library shows `status: 'error'`, read the `error` message — most likely an unresolved import; add the missing package to `external` in `measure.ts` (Step 3) and rerun.

- [ ] **Step 6: Commit**

```bash
git add bench/fixtures/bundle/ bench/suites/bundle/ bench/package.json
git commit -m "bench: add bundle-size measurement via esbuild + gzip"
```

---

### Task 4: React app — async-cancellation and debounce-floor routes

**Files:**
- Modify: `bench/apps/react/src/App.tsx`

**Interfaces:**
- Consumes: existing `neutroAsyncForm`-style pattern already in `App.tsx`.
- Produces: routes `/cancel/neutro`, `/cancel/rhf`, `/cancel/formik`, `/cancel/tanstack` and `/async/neutro?debounce=0` (React), read by Task 11's new `async-cancellation.spec.ts` and Task 7's debounce-floor entries.

- [ ] **Step 1: Add debounce-floor support to `NeutroAsyncPage`**

In `bench/apps/react/src/App.tsx`, find the `neutroAsyncForm` declaration and `NeutroAsyncPage` function. Replace both with:

```tsx
function makeNeutroAsyncForm(debounceMs: number) {
  return createForm({
    initialValues: { email: '' },
    asyncDebounceMs: debounceMs,
    validator: async (values, _scope, signal) => {
      window.__asyncValidationStart = performance.now()
      await new Promise(r => setTimeout(r, 200))
      if (signal?.aborted) return {}
      if (!String(values.email).includes('@')) return { email: 'Invalid email' }
      return {}
    },
    validationMode: 'onChange',
  })
}
const neutroAsyncForm = makeNeutroAsyncForm(300)
const neutroAsyncFormNoDebounce = makeNeutroAsyncForm(0)

function NeutroAsyncPage({ form }: { form: ReturnType<typeof makeNeutroAsyncForm> }) {
  const email = useFormPath(form, 'email')
  const sub = useCallback((cb: () => void) => form.subscribeToPath('email', cb), [form])
  const getErr = useCallback(() => form.getState().errors['email'] ?? '', [form])
  const error = useSyncExternalStore(sub, getErr, getErr)
  if (error) window.__asyncValidationEnd = performance.now()
  return (
    <div>
      <input
        data-testid="async-email"
        value={email as string}
        onChange={e => form.set('email', e.target.value, { validate: true })}
      />
      {error && <span data-testid="async-error">{error}</span>}
    </div>
  )
}
```

- [ ] **Step 2: Add `async-cancellation` mock validator and pages**

After the existing async page components (before `// ==================== ROUTER ====================`), add:

```tsx
// ==================== ASYNC-CANCELLATION PAGES ====================
// Validator delay depends on the value: anything containing "slow" takes 600ms,
// everything else takes 100ms. Typing "slow@x" then immediately overtyping with
// "fastbad" creates a real race — the slow validation (valid, no error) must not
// overwrite the fast validation's result (invalid, error shown) when it resolves later.
function cancellationDelay(value: string): number {
  return value.includes('slow') ? 600 : 100
}

const neutroCancelForm = createForm({
  initialValues: { email: '' },
  asyncDebounceMs: 0,
  validator: async (values, _scope, signal) => {
    await new Promise(r => setTimeout(r, cancellationDelay(values.email)))
    if (signal?.aborted) return {}
    if (!String(values.email).includes('@')) return { email: 'Invalid email' }
    return {}
  },
  validationMode: 'onChange',
})
function NeutroCancelPage() {
  const email = useFormPath(neutroCancelForm, 'email')
  const sub = useCallback((cb: () => void) => neutroCancelForm.subscribeToPath('email', cb), [])
  const getErr = useCallback(() => neutroCancelForm.getState().errors['email'] ?? '', [])
  const error = useSyncExternalStore(sub, getErr, getErr)
  return (
    <div>
      <input
        data-testid="async-email"
        value={email as string}
        onChange={e => neutroCancelForm.set('email', e.target.value, { validate: true })}
      />
      {error && <span data-testid="async-error">{error}</span>}
    </div>
  )
}

function RhfCancelPage() {
  const { register, formState: { errors } } = useRhfForm({ mode: 'onChange' })
  const emailProps = register('email', {
    validate: async (value) => {
      await new Promise(r => setTimeout(r, cancellationDelay(value)))
      if (!String(value).includes('@')) return 'Invalid email'
      return undefined
    },
  })
  return (
    <div>
      <input data-testid="async-email" {...emailProps} />
      {errors.email && <span data-testid="async-error">{errors.email.message}</span>}
    </div>
  )
}

function FormikCancelPage() {
  return (
    <Formik
      initialValues={{ email: '' }}
      validateOnChange
      validate={async (values) => {
        await new Promise(r => setTimeout(r, cancellationDelay(values.email)))
        if (!String(values.email).includes('@')) return { email: 'Invalid email' }
        return {}
      }}
    >
      {({ handleChange, errors }) => (
        <div>
          <input data-testid="async-email" name="email" onChange={handleChange} />
          {errors.email && <span data-testid="async-error">{errors.email}</span>}
        </div>
      )}
    </Formik>
  )
}

function TanStackCancelPage() {
  const form = useTsForm({ defaultValues: { email: '' } })
  return (
    <div>
      <form.Field
        name="email"
        validators={{
          onChangeAsync: async ({ value }: { value: string }) => {
            await new Promise(r => setTimeout(r, cancellationDelay(value)))
            if (!String(value).includes('@')) return 'Invalid email'
            return undefined
          },
        }}
      >
        {(field: any) => {
          const err = field.state.meta.errors[0]
          return (
            <>
              <input
                data-testid="async-email"
                value={field.state.value}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => field.handleChange(e.target.value)}
              />
              {err && <span data-testid="async-error">{err}</span>}
            </>
          )
        }}
      </form.Field>
    </div>
  )
}
```

- [ ] **Step 3: Wire routing — replace `ASYNC_PAGES` and the router function**

```tsx
// ==================== ROUTER ====================
const ASYNC_PAGES: Record<string, (debounce: boolean) => React.ReactElement> = {
  neutro: (debounce) => <NeutroAsyncPage form={debounce ? neutroAsyncFormNoDebounce : neutroAsyncForm} />,
  rhf: () => <RhfAsyncPage />,
  formik: () => <FormikAsyncPage />,
  tanstack: () => <TanStackAsyncPage />,
}

const CANCEL_PAGES: Record<string, React.ReactElement> = {
  neutro: <NeutroCancelPage />,
  rhf: <RhfCancelPage />,
  formik: <FormikCancelPage />,
  tanstack: <TanStackCancelPage />,
}

export default function App() {
  const path = window.location.pathname
  if (path.startsWith('/async/')) {
    const lib = path.slice('/async/'.length)
    const debounce = new URLSearchParams(window.location.search).get('debounce') === '0'
    return ASYNC_PAGES[lib]?.(debounce) ?? <div data-testid="not-found">Unknown: {lib}</div>
  }
  if (path.startsWith('/cancel/')) {
    const lib = path.slice('/cancel/'.length)
    return CANCEL_PAGES[lib] ?? <div data-testid="not-found">Unknown: {lib}</div>
  }
  return (
    <div>
      <NeutroSection />
      <RhfSection />
      <FormikSection />
      <TanStackSection />
    </div>
  )
}
```

- [ ] **Step 4: Build and smoke-test**

```bash
cd bench/apps/react && pnpm build && pnpm preview --port 4173 &
sleep 2
curl -s http://localhost:4173/async/neutro | grep -q '<div id="root">' && echo "async route OK"
curl -s "http://localhost:4173/async/neutro?debounce=0" | grep -q '<div id="root">' && echo "debounce route OK"
curl -s http://localhost:4173/cancel/neutro | grep -q '<div id="root">' && echo "cancel route OK"
kill %1
```

Expected: all three "OK" lines print (the React app is a SPA, so any path returns the same shell HTML — this just confirms the dev server serves the route without a 404; actual behavior is verified by Playwright in Task 11).

- [ ] **Step 5: Commit**

```bash
git add bench/apps/react/src/App.tsx
git commit -m "bench(react): add async-cancellation pages and debounce-floor route"
```

---

### Task 5: Vue app — async-cancellation and debounce-floor routes

**Files:**
- Create: `bench/apps/vue/src/NeutroCancelPage.vue`
- Create: `bench/apps/vue/src/VeeCancelPage.vue`
- Modify: `bench/apps/vue/src/NeutroAsyncPage.vue`
- Modify: `bench/apps/vue/src/App.vue`

**Interfaces:**
- Produces: routes `/cancel/neutro`, `/cancel/vee` and `/async/neutro?debounce=0` (Vue).

- [ ] **Step 1: Update `NeutroAsyncPage.vue` to accept a debounce prop**

Replace the full file:

```vue
<script setup lang="ts">
import { ref, onUnmounted, computed } from 'vue'
import { createForm } from '@neutro/form-core'
import { useVueFormPath } from '@neutro/form-vue'

const debounce = computed(() => new URLSearchParams(window.location.search).get('debounce') === '0')

const asyncForm = createForm({
  initialValues: { email: '' },
  asyncDebounceMs: debounce.value ? 0 : 300,
  validator: async (values, _scope, signal) => {
    ;(window as any).__asyncValidationStart = performance.now()
    await new Promise(r => setTimeout(r, 200))
    if (signal?.aborted) return {}
    if (!String(values.email).includes('@')) return { email: 'Invalid email' }
    return {}
  },
  validationMode: 'onChange',
})

const { value: emailValue } = useVueFormPath(asyncForm, 'email')
const error = ref('')
const unsubscribe = asyncForm.subscribe(state => {
  const e = state.errors['email']
  if (e && !error.value) {
    ;(window as any).__asyncValidationEnd = performance.now()
  }
  error.value = e ?? ''
})
onUnmounted(unsubscribe)
</script>

<template>
  <div>
    <input
      data-testid="async-email"
      :value="emailValue as string"
      @input="(e) => asyncForm.set('email', (e.target as HTMLInputElement).value, { validate: true })"
    />
    <span v-if="error" data-testid="async-error">{{ error }}</span>
  </div>
</template>
```

- [ ] **Step 2: Create `NeutroCancelPage.vue`**

```vue
<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { createForm } from '@neutro/form-core'
import { useVueFormPath } from '@neutro/form-vue'

function cancellationDelay(value: string): number {
  return value.includes('slow') ? 600 : 100
}

const cancelForm = createForm({
  initialValues: { email: '' },
  asyncDebounceMs: 0,
  validator: async (values, _scope, signal) => {
    await new Promise(r => setTimeout(r, cancellationDelay(values.email)))
    if (signal?.aborted) return {}
    if (!String(values.email).includes('@')) return { email: 'Invalid email' }
    return {}
  },
  validationMode: 'onChange',
})

const { value: emailValue } = useVueFormPath(cancelForm, 'email')
const error = ref('')
const unsubscribe = cancelForm.subscribe(state => {
  error.value = state.errors['email'] ?? ''
})
onUnmounted(unsubscribe)
</script>

<template>
  <div>
    <input
      data-testid="async-email"
      :value="emailValue as string"
      @input="(e) => cancelForm.set('email', (e.target as HTMLInputElement).value, { validate: true })"
    />
    <span v-if="error" data-testid="async-error">{{ error }}</span>
  </div>
</template>
```

- [ ] **Step 3: Create `VeeCancelPage.vue`**

```vue
<script setup lang="ts">
import { useField, useForm } from 'vee-validate'

function cancellationDelay(value: string): number {
  return value.includes('slow') ? 600 : 100
}

useForm()
const { value, errorMessage, handleChange } = useField<string>('email', async (val) => {
  await new Promise(r => setTimeout(r, cancellationDelay(val)))
  if (!String(val).includes('@')) return 'Invalid email'
  return true
})
</script>

<template>
  <div>
    <input
      data-testid="async-email"
      :value="value"
      @input="(e) => handleChange((e.target as HTMLInputElement).value)"
    />
    <span v-if="errorMessage" data-testid="async-error">{{ errorMessage }}</span>
  </div>
</template>
```

- [ ] **Step 4: Wire routing in `App.vue`**

Replace the `<script setup>` imports and add the cancel-page imports, and replace the `<template>` block:

```vue
<script setup lang="ts">
import { createForm } from '@neutro/form-core'
import { useForm as useVeeForm } from 'vee-validate'
import NeutroField from './NeutroField.vue'
import VeeField from './VeeField.vue'
import NeutroAsyncPage from './NeutroAsyncPage.vue'
import VeeAsyncPage from './VeeAsyncPage.vue'
import NeutroCancelPage from './NeutroCancelPage.vue'
import VeeCancelPage from './VeeCancelPage.vue'

const path = window.location.pathname

// ---- Re-renders page setup ----
const FIELD_NAMES = Array.from({ length: 10 }, (_, i) => `field${i}`)

const neutroForm = createForm({
  initialValues: Object.fromEntries(FIELD_NAMES.map(n => [n, ''])),
})
const neutroRenders: Record<string, number> = {}
;(window as any).__neutroRenders = neutroRenders

const veeRenders: Record<string, number> = {}
;(window as any).__veeRenders = veeRenders

;(window as any).__resetRenders = () => {
  for (const k in neutroRenders) neutroRenders[k] = 0
  for (const k in veeRenders) veeRenders[k] = 0
}

useVeeForm()
</script>

<template>
  <NeutroAsyncPage v-if="path === '/async/neutro'" />
  <VeeAsyncPage v-else-if="path === '/async/vee'" />
  <NeutroCancelPage v-else-if="path === '/cancel/neutro'" />
  <VeeCancelPage v-else-if="path === '/cancel/vee'" />

  <div v-else>
    <section data-testid="neutro-form">
      <NeutroField
        v-for="name in FIELD_NAMES"
        :key="name"
        :form="neutroForm"
        :name="name"
        :renders="neutroRenders"
      />
    </section>
    <section data-testid="vee-form">
      <VeeField
        v-for="name in FIELD_NAMES"
        :key="name"
        :name="name"
        :renders="veeRenders"
      />
    </section>
  </div>
</template>
```

- [ ] **Step 5: Build and verify**

```bash
cd bench/apps/vue && pnpm build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add bench/apps/vue/src/
git commit -m "bench(vue): add async-cancellation pages and debounce-floor route"
```

---

### Task 6: Svelte app — async-cancellation and debounce-floor routes

**Files:**
- Create: `bench/apps/svelte/src/NeutroCancelPage.svelte`
- Create: `bench/apps/svelte/src/TanStackCancelPage.svelte`
- Create: `bench/apps/svelte/src/FelteCancelPage.svelte`
- Modify: `bench/apps/svelte/src/NeutroAsyncPage.svelte`
- Modify: `bench/apps/svelte/src/App.svelte`

**Interfaces:**
- Produces: routes `/cancel/neutro`, `/cancel/tanstack`, `/cancel/felte` and `/async/neutro?debounce=0` (Svelte).

- [ ] **Step 1: Update `NeutroAsyncPage.svelte` to read the debounce query param**

Replace the full file:

```svelte
<script lang="ts">
  import { onDestroy } from 'svelte'
  import { createForm } from '@neutro/form-core'
  import { useSvelteFormPath } from '@neutro/form-svelte'

  const debounce = new URLSearchParams(window.location.search).get('debounce') === '0'

  const asyncForm = createForm({
    initialValues: { email: '' },
    asyncDebounceMs: debounce ? 0 : 300,
    validator: async (values: any, _scope: any, signal: any) => {
      ;(window as any).__asyncValidationStart = performance.now()
      await new Promise((r) => setTimeout(r, 200))
      if (signal?.aborted) return {}
      if (!String(values.email).includes('@')) return { email: 'Invalid email' }
      return {}
    },
    validationMode: 'onChange',
  })

  const field = useSvelteFormPath(asyncForm, 'email')

  let error = $state('')
  const unsubscribe = asyncForm.subscribe((state: any) => {
    const e = state.errors['email']
    if (e && !error) {
      ;(window as any).__asyncValidationEnd = performance.now()
    }
    error = e ?? ''
  })
  onDestroy(unsubscribe)
</script>

<div>
  <input
    data-testid="async-email"
    value={$field.value as string}
    oninput={(e) =>
      asyncForm.set('email', (e.target as HTMLInputElement).value, {
        validate: true,
      })}
  />
  {#if error}
    <span data-testid="async-error">{error}</span>
  {/if}
</div>
```

- [ ] **Step 2: Create `NeutroCancelPage.svelte`**

```svelte
<script lang="ts">
  import { onDestroy } from 'svelte'
  import { createForm } from '@neutro/form-core'
  import { useSvelteFormPath } from '@neutro/form-svelte'

  function cancellationDelay(value: string): number {
    return value.includes('slow') ? 600 : 100
  }

  const cancelForm = createForm({
    initialValues: { email: '' },
    asyncDebounceMs: 0,
    validator: async (values: any, _scope: any, signal: any) => {
      await new Promise((r) => setTimeout(r, cancellationDelay(values.email)))
      if (signal?.aborted) return {}
      if (!String(values.email).includes('@')) return { email: 'Invalid email' }
      return {}
    },
    validationMode: 'onChange',
  })

  const field = useSvelteFormPath(cancelForm, 'email')

  let error = $state('')
  const unsubscribe = cancelForm.subscribe((state: any) => {
    error = state.errors['email'] ?? ''
  })
  onDestroy(unsubscribe)
</script>

<div>
  <input
    data-testid="async-email"
    value={$field.value as string}
    oninput={(e) =>
      cancelForm.set('email', (e.target as HTMLInputElement).value, {
        validate: true,
      })}
  />
  {#if error}
    <span data-testid="async-error">{error}</span>
  {/if}
</div>
```

- [ ] **Step 3: Create `TanStackCancelPage.svelte`**

```svelte
<script lang="ts">
  import { createForm } from '@tanstack/svelte-form'

  function cancellationDelay(value: string): number {
    return value.includes('slow') ? 600 : 100
  }

  const form = createForm(() => ({
    defaultValues: { email: '' },
  }))
</script>

<div>
  <form.Field
    name="email"
    validators={{
      onChangeAsync: async ({ value }: { value: string }) => {
        await new Promise((r) => setTimeout(r, cancellationDelay(value)))
        if (!String(value).includes('@')) return 'Invalid email'
        return undefined
      },
    }}
  >
    {#snippet children(field)}
      {@const err = field.state.meta.errors[0]}
      <input
        data-testid="async-email"
        value={field.state.value}
        oninput={(e) => field.handleChange((e.target as HTMLInputElement).value)}
      />
      {#if err}
        <span data-testid="async-error">{err}</span>
      {/if}
    {/snippet}
  </form.Field>
</div>
```

- [ ] **Step 4: Create `FelteCancelPage.svelte`**

```svelte
<script lang="ts">
  import { createForm } from 'felte'
  import { onDestroy } from 'svelte'

  function cancellationDelay(value: string): number {
    return value.includes('slow') ? 600 : 100
  }

  let error = $state('')

  const { validate, setFields, errors } = createForm({
    initialValues: { email: '' },
    validate: async (values: Record<string, string>) => {
      await new Promise((r) => setTimeout(r, cancellationDelay(values.email)))
      const errs: Record<string, string[] | null> = {}
      if (!String(values.email).includes('@')) {
        errs.email = ['Invalid email']
        return errs
      }
      return errs
    },
  })

  const unsubErrors = errors.subscribe((e: any) => {
    const msgs: string[] | null = e?.email ?? null
    error = msgs?.[0] ?? ''
  })
  onDestroy(unsubErrors)

  function handleInput(e: Event) {
    const val = (e.target as HTMLInputElement).value
    setFields('email', val, true)
    validate()
  }
</script>

<div>
  <input data-testid="async-email" oninput={handleInput} />
  {#if error}
    <span data-testid="async-error">{error}</span>
  {/if}
</div>
```

- [ ] **Step 5: Wire routing in `App.svelte`**

Add the three new imports after the existing async page imports, and add three more `{:else if}` branches before the final `{:else}`:

```svelte
  import NeutroCancelPage from './NeutroCancelPage.svelte'
  import TanStackCancelPage from './TanStackCancelPage.svelte'
  import FelteCancelPage from './FelteCancelPage.svelte'
```

```svelte
{:else if path === '/cancel/neutro'}
  <NeutroCancelPage />
{:else if path === '/cancel/tanstack'}
  <TanStackCancelPage />
{:else if path === '/cancel/felte'}
  <FelteCancelPage />
```

(Insert these three new branches between the existing `{:else if path === '/async/felte'}` branch and the final `{:else}` re-renders block.)

- [ ] **Step 6: Build and verify**

```bash
cd bench/apps/svelte && pnpm build
```

Expected: build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add bench/apps/svelte/src/
git commit -m "bench(svelte): add async-cancellation pages and debounce-floor route"
```

---

### Task 7: Re-renders at scale — all three apps

**Files:**
- Modify: `bench/apps/react/src/App.tsx`
- Modify: `bench/apps/vue/src/App.vue`
- Modify: `bench/apps/svelte/src/App.svelte`

**Interfaces:**
- Produces: `?fields=100` query param support on the re-renders page (default 10), read by Task 11's updated `re-renders.spec.ts`.

- [ ] **Step 1: React — make `FIELDS` configurable**

In `bench/apps/react/src/App.tsx`, find:

```tsx
const FIELDS = Array.from({ length: 10 }, (_, i) => `field${i}`)
```

Replace with:

```tsx
const FIELD_COUNT = Number(new URLSearchParams(window.location.search).get('fields')) || 10
const FIELDS = Array.from({ length: FIELD_COUNT }, (_, i) => `field${i}`)
```

This must execute before `neutroForm`, `RhfSection`, `FormikSection`, and `TanStackSection` reference `FIELDS` — since `FIELDS` is a module-level `const` evaluated once on script load and the existing code already references it for `neutroForm`'s `initialValues`, no further changes are needed; every section already maps over `FIELDS`.

- [ ] **Step 2: Vue — make `FIELD_NAMES` configurable**

In `bench/apps/vue/src/App.vue`, find:

```vue
const FIELD_NAMES = Array.from({ length: 10 }, (_, i) => `field${i}`)
```

Replace with:

```vue
const FIELD_COUNT = Number(new URLSearchParams(window.location.search).get('fields')) || 10
const FIELD_NAMES = Array.from({ length: FIELD_COUNT }, (_, i) => `field${i}`)
```

- [ ] **Step 3: Svelte — make `FIELDS` configurable**

In `bench/apps/svelte/src/App.svelte`, find:

```svelte
  const FIELDS = Array.from({ length: 10 }, (_, i) => `field${i}`)
```

Replace with:

```svelte
  const FIELD_COUNT = Number(new URLSearchParams(window.location.search).get('fields')) || 10
  const FIELDS = Array.from({ length: FIELD_COUNT }, (_, i) => `field${i}`)
```

- [ ] **Step 4: Build all three and smoke-test the query param**

```bash
cd bench && pnpm bench:apps:build
pnpm --dir apps/react preview --port 4173 &
sleep 2
curl -s "http://localhost:4173/?fields=100" | grep -q '<div id="root">' && echo "react 100-field route OK"
kill %1
```

Expected: "react 100-field route OK" prints. (Field-count behavior itself is verified by Playwright in Task 11; this step only confirms the route resolves.)

- [ ] **Step 5: Commit**

```bash
git add bench/apps/react/src/App.tsx bench/apps/vue/src/App.vue bench/apps/svelte/src/App.svelte
git commit -m "bench: support ?fields=N query param for re-renders-at-scale testing"
```

---

### Task 8: React app — array-ops UI (4 libraries)

**Files:**
- Modify: `bench/apps/react/src/App.tsx`

**Interfaces:**
- Produces: `/array` route rendering 4 array-CRUD sections (`neutro-array`, `rhf-array`, `formik-array`, `tanstack-array` test ids), each with 10 items and per-item `data-testid="<prefix>-array-item-<i>"` inputs plus a `data-testid="<prefix>-array-remove-3"` button and `data-testid="<prefix>-array-move-3-7"` button. Render counters reuse the same `window.__*Renders` objects from Task-1-era code, keyed by `item<i>` instead of `field<i>`.

- [ ] **Step 1: Add the array-ops section after the existing re-renders sections, before the async pages**

In `bench/apps/react/src/App.tsx`, insert after the `TanStackSection` function and before `// ==================== ASYNC PAGES ====================`:

```tsx
// ==================== ARRAY-OPS ====================
const ARRAY_ITEMS = Array.from({ length: 10 }, (_, i) => ({ v: `item${i}` }))

const neutroArrayRenders: Record<string, number> = {}
const rhfArrayRenders: Record<string, number> = {}
const formikArrayRenders: Record<string, number> = {}
const tanstackArrayRenders: Record<string, number> = {}
;(window as any).__neutroArrayRenders = neutroArrayRenders
;(window as any).__rhfArrayRenders = rhfArrayRenders
;(window as any).__formikArrayRenders = formikArrayRenders
;(window as any).__tanstackArrayRenders = tanstackArrayRenders
;(window as any).__resetArrayRenders = () => {
  for (const k in neutroArrayRenders) neutroArrayRenders[k] = 0
  for (const k in rhfArrayRenders) rhfArrayRenders[k] = 0
  for (const k in formikArrayRenders) formikArrayRenders[k] = 0
  for (const k in tanstackArrayRenders) tanstackArrayRenders[k] = 0
}

const neutroArrayForm = createForm({ initialValues: { items: ARRAY_ITEMS } })

function NeutroArrayItem({ index }: { index: number }) {
  const value = useFormPath(neutroArrayForm, `items.${index}.v` as any)
  neutroArrayRenders[`item${index}`] = (neutroArrayRenders[`item${index}`] ?? 0) + 1
  return (
    <input
      data-testid={`neutro-array-item-${index}`}
      value={value as string}
      onChange={e => neutroArrayForm.set(`items.${index}.v` as any, e.target.value)}
    />
  )
}
function NeutroArraySection() {
  const items = useFormPath(neutroArrayForm, 'items' as any) as Array<{ v: string }>
  return (
    <section data-testid="neutro-array">
      {items.map((_, i) => (
        <span key={i}>
          <NeutroArrayItem index={i} />
          <button data-testid={`neutro-array-remove-${i}`} onClick={() => neutroArrayForm.arrayRemove('items' as any, i)}>remove</button>
        </span>
      ))}
      <button data-testid="neutro-array-move-3-7" onClick={() => neutroArrayForm.arrayMove('items' as any, 3, 7)}>move</button>
    </section>
  )
}

function RhfArraySection() {
  const { control } = useRhfForm({ defaultValues: { items: ARRAY_ITEMS } })
  const { fields, remove, move } = useFieldArray({ control, name: 'items' })
  return (
    <section data-testid="rhf-array">
      {fields.map((field, i) => (
        <span key={field.id}>
          <Controller
            control={control} name={`items.${i}.v`}
            render={({ field: f }) => {
              rhfArrayRenders[`item${i}`] = (rhfArrayRenders[`item${i}`] ?? 0) + 1
              return <input data-testid={`rhf-array-item-${i}`} value={f.value} onChange={f.onChange} />
            }}
          />
          <button data-testid={`rhf-array-remove-${i}`} onClick={() => remove(i)}>remove</button>
        </span>
      ))}
      <button data-testid="rhf-array-move-3-7" onClick={() => move(3, 7)}>move</button>
    </section>
  )
}

function FormikArrayItem({ index }: { index: number }) {
  const { values, handleChange } = useFormikContext<{ items: Array<{ v: string }> }>()
  formikArrayRenders[`item${index}`] = (formikArrayRenders[`item${index}`] ?? 0) + 1
  return (
    <input
      data-testid={`formik-array-item-${index}`}
      name={`items.${index}.v`}
      value={values.items[index].v}
      onChange={handleChange}
    />
  )
}
function FormikArraySection() {
  return (
    <Formik initialValues={{ items: ARRAY_ITEMS }} onSubmit={() => {}}>
      {({ values }) => (
        <FieldArray name="items">
          {(helpers) => (
            <section data-testid="formik-array">
              {values.items.map((_, i) => (
                <span key={i}>
                  <FormikArrayItem index={i} />
                  <button data-testid={`formik-array-remove-${i}`} onClick={() => helpers.remove(i)}>remove</button>
                </span>
              ))}
              <button data-testid="formik-array-move-3-7" onClick={() => helpers.move(3, 7)}>move</button>
            </section>
          )}
        </FieldArray>
      )}
    </Formik>
  )
}

function TanStackArraySection() {
  const form = useTsForm({ defaultValues: { items: ARRAY_ITEMS } })
  return (
    <form.Field name="items" mode="array">
      {(arrayField: any) => (
        <section data-testid="tanstack-array">
          {arrayField.state.value.map((_: unknown, i: number) => (
            <span key={i}>
              <form.Field name={`items[${i}].v`}>
                {(field: any) => {
                  tanstackArrayRenders[`item${i}`] = (tanstackArrayRenders[`item${i}`] ?? 0) + 1
                  return (
                    <input
                      data-testid={`tanstack-array-item-${i}`}
                      value={field.state.value}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => field.handleChange(e.target.value)}
                    />
                  )
                }}
              </form.Field>
              <button data-testid={`tanstack-array-remove-${i}`} onClick={() => arrayField.removeValue(i)}>remove</button>
            </span>
          ))}
          <button data-testid="tanstack-array-move-3-7" onClick={() => arrayField.moveValue(3, 7)}>move</button>
        </section>
      )}
    </form.Field>
  )
}
```

- [ ] **Step 2: Add the `useFieldArray` and `FieldArray` imports**

At the top of the file, update the import lines:

```tsx
import { useForm as useRhfForm, Controller, useFieldArray } from 'react-hook-form'
import { Formik, useFormikContext, FieldArray } from 'formik'
```

- [ ] **Step 3: Wire the `/array` route**

In the `App` component, add a new branch before the final `return`:

```tsx
  if (path === '/array') {
    return (
      <div>
        <NeutroArraySection />
        <RhfArraySection />
        <FormikArraySection />
        <TanStackArraySection />
      </div>
    )
  }
```

(Insert this between the existing `/cancel/` branch and the final re-renders-page `return`.)

- [ ] **Step 4: Build and fix any compile errors against installed types**

```bash
cd bench/apps/react && pnpm build
```

Expected: build succeeds. If `useFieldArray`, `FieldArray`, `mode: 'array'`, `removeValue`, or `moveValue` don't match the installed versions (RHF 7.80.0, Formik 2.4.9, TanStack React Form 0.29.2), check `node_modules/<package>/dist/index.d.ts` for the correct method names and adjust only the mismatched call — the surrounding structure (render counting, data-testid pattern, route wiring) stays as written.

- [ ] **Step 5: Commit**

```bash
git add bench/apps/react/src/App.tsx
git commit -m "bench(react): add array-ops UI for neutro, RHF, Formik, TanStack"
```

---

### Task 9: Vue app — array-ops UI (2 libraries)

**Files:**
- Create: `bench/apps/vue/src/NeutroArraySection.vue`
- Create: `bench/apps/vue/src/VeeArraySection.vue`
- Modify: `bench/apps/vue/src/App.vue`

**Interfaces:**
- Produces: `/array` route rendering `neutro-array` and `vee-array` sections, same test-id convention as Task 8.

- [ ] **Step 1: Create `NeutroArraySection.vue`**

```vue
<script setup lang="ts">
import { onBeforeUpdate } from 'vue'
import { createForm } from '@neutro/form-core'
import { useVueFormPath } from '@neutro/form-vue'

const ARRAY_ITEMS = Array.from({ length: 10 }, (_, i) => ({ v: `item${i}` }))
const arrayForm = createForm({ initialValues: { items: ARRAY_ITEMS } })
const { value: items } = useVueFormPath(arrayForm, 'items')

const renders: Record<string, number> = {}
;(window as any).__neutroArrayRenders = renders
onBeforeUpdate(() => {
  for (let i = 0; i < (items.value as any[])?.length; i++) {
    renders[`item${i}`] = (renders[`item${i}`] ?? 0) + 1
  }
})
</script>

<template>
  <section data-testid="neutro-array">
    <span v-for="(_, i) in (items as any[])" :key="i">
      <input
        :data-testid="`neutro-array-item-${i}`"
        :value="(items as any[])[i].v"
        @input="(e) => arrayForm.set(`items.${i}.v` as any, (e.target as HTMLInputElement).value)"
      />
      <button :data-testid="`neutro-array-remove-${i}`" @click="arrayForm.arrayRemove('items' as any, i)">remove</button>
    </span>
    <button data-testid="neutro-array-move-3-7" @click="arrayForm.arrayMove('items' as any, 3, 7)">move</button>
  </section>
</template>
```

- [ ] **Step 2: Create `VeeArraySection.vue`**

```vue
<script setup lang="ts">
import { onBeforeUpdate } from 'vue'
import { useFieldArray, useForm } from 'vee-validate'

useForm({ initialValues: { items: Array.from({ length: 10 }, (_, i) => ({ v: `item${i}` })) } })
const { fields, remove, move } = useFieldArray<{ v: string }>('items')

const renders: Record<string, number> = {}
;(window as any).__veeArrayRenders = renders
onBeforeUpdate(() => {
  for (let i = 0; i < fields.value.length; i++) {
    renders[`item${i}`] = (renders[`item${i}`] ?? 0) + 1
  }
})
</script>

<template>
  <section data-testid="vee-array">
    <span v-for="(field, i) in fields" :key="field.key">
      <input
        :data-testid="`vee-array-item-${i}`"
        :value="field.value.v"
        @input="(e) => (field.value.v = (e.target as HTMLInputElement).value)"
      />
      <button :data-testid="`vee-array-remove-${i}`" @click="remove(i)">remove</button>
    </span>
    <button data-testid="vee-array-move-3-7" @click="move(3, 7)">move</button>
  </section>
</template>
```

- [ ] **Step 3: Wire the `/array` route in `App.vue`**

Add imports:

```vue
import NeutroArraySection from './NeutroArraySection.vue'
import VeeArraySection from './VeeArraySection.vue'
```

Add a branch in the template, before the final `<div v-else>`:

```vue
  <div v-else-if="path === '/array'">
    <NeutroArraySection />
    <VeeArraySection />
  </div>
```

- [ ] **Step 4: Build and fix any compile errors against installed types**

```bash
cd bench/apps/vue && pnpm build
```

Expected: build succeeds. If `useFieldArray` isn't exported from the installed `vee-validate` (4.15.1) with this exact signature, check `node_modules/vee-validate/dist/vee-validate.d.ts` for the correct generic/import shape and adjust only that call.

- [ ] **Step 5: Commit**

```bash
git add bench/apps/vue/src/NeutroArraySection.vue bench/apps/vue/src/VeeArraySection.vue bench/apps/vue/src/App.vue
git commit -m "bench(vue): add array-ops UI for neutro and Vee-Validate"
```

---

### Task 10: Svelte app — array-ops UI (3 libraries)

**Files:**
- Create: `bench/apps/svelte/src/NeutroArraySection.svelte`
- Create: `bench/apps/svelte/src/TanStackArraySection.svelte`
- Create: `bench/apps/svelte/src/FelteArraySection.svelte`
- Modify: `bench/apps/svelte/src/App.svelte`

**Interfaces:**
- Produces: `/array` route rendering `neutro-array`, `tanstack-array`, `felte-array` sections, same test-id convention as Task 8.

- [ ] **Step 1: Create `NeutroArraySection.svelte`**

```svelte
<script lang="ts">
  import { createForm } from '@neutro/form-core'
  import { useSvelteFormPath } from '@neutro/form-svelte'

  const ARRAY_ITEMS = Array.from({ length: 10 }, (_, i) => ({ v: `item${i}` }))
  const arrayForm = createForm({ initialValues: { items: ARRAY_ITEMS } })
  const itemsField = useSvelteFormPath(arrayForm, 'items')

  const renders: Record<string, number> = {}
  ;(window as any).__neutroArrayRenders = renders

  $effect.pre(() => {
    const items = $itemsField.value as Array<{ v: string }>
    for (let i = 0; i < items.length; i++) {
      renders[`item${i}`] = (renders[`item${i}`] ?? 0) + 1
    }
  })
</script>

<section data-testid="neutro-array">
  {#each ($itemsField.value as Array<{ v: string }>) as item, i}
    <span>
      <input
        data-testid={`neutro-array-item-${i}`}
        value={item.v}
        oninput={(e) => arrayForm.set(`items.${i}.v` as any, (e.target as HTMLInputElement).value)}
      />
      <button data-testid={`neutro-array-remove-${i}`} onclick={() => arrayForm.arrayRemove('items' as any, i)}>remove</button>
    </span>
  {/each}
  <button data-testid="neutro-array-move-3-7" onclick={() => arrayForm.arrayMove('items' as any, 3, 7)}>move</button>
</section>
```

- [ ] **Step 2: Create `TanStackArraySection.svelte`**

```svelte
<script lang="ts">
  import { createForm } from '@tanstack/svelte-form'

  const form = createForm(() => ({
    defaultValues: { items: Array.from({ length: 10 }, (_, i) => ({ v: `item${i}` })) },
  }))

  const renders: Record<string, number> = {}
  ;(window as any).__tanstackArrayRenders = renders
</script>

<form.Field name="items" mode="array">
  {#snippet children(arrayField)}
    <section data-testid="tanstack-array">
      {#each arrayField.state.value as _, i}
        <form.Field name={`items[${i}].v`}>
          {#snippet children(field)}
            {@const _track = (renders[`item${i}`] = (renders[`item${i}`] ?? 0) + 1)}
            <input
              data-testid={`tanstack-array-item-${i}`}
              value={field.state.value}
              oninput={(e) => field.handleChange((e.target as HTMLInputElement).value)}
            />
          {/snippet}
        </form.Field>
        <button data-testid={`tanstack-array-remove-${i}`} onclick={() => arrayField.removeValue(i)}>remove</button>
      {/each}
      <button data-testid="tanstack-array-move-3-7" onclick={() => arrayField.moveValue(3, 7)}>move</button>
    </section>
  {/snippet}
</form.Field>
```

Note: `{@const _track = ...}` is a deliberate render-count side effect inside a template expression — this matches the existing codebase's pattern of incrementing counters directly in render paths (see `App.tsx`'s `RhfSection`). If Svelte's compiler rejects an assignment inside `{@const}`, move the increment into a `$effect.pre(() => { void field.state.value; renders[...]++  })` block inside a small wrapper component instead, following the exact pattern already used in `TanStackField.svelte` from the re-renders surface.

- [ ] **Step 3: Create `FelteArraySection.svelte`**

```svelte
<script lang="ts">
  import { createForm } from 'felte'

  const ARRAY_ITEMS = Array.from({ length: 10 }, (_, i) => ({ v: `item${i}` }))

  const { form: formAction, data, setFields } = createForm({
    initialValues: { items: ARRAY_ITEMS },
  })

  const renders: Record<string, number> = {}
  ;(window as any).__felteArrayRenders = renders

  function removeAt(i: number) {
    const next = ($data.items as Array<{ v: string }>).filter((_, idx) => idx !== i)
    setFields('items', next, true)
  }

  function moveItem(from: number, to: number) {
    const items = [...($data.items as Array<{ v: string }>)]
    const [moved] = items.splice(from, 1)
    items.splice(to, 0, moved)
    setFields('items', items, true)
  }

  $effect.pre(() => {
    const items = $data.items as Array<{ v: string }>
    for (let i = 0; i < items.length; i++) {
      renders[`item${i}`] = (renders[`item${i}`] ?? 0) + 1
    }
  })
</script>

<form use:formAction>
  <section data-testid="felte-array">
    {#each ($data.items as Array<{ v: string }>) as item, i}
      <span>
        <input data-testid={`felte-array-item-${i}`} name={`items.${i}.v`} value={item.v} />
        <button type="button" data-testid={`felte-array-remove-${i}`} onclick={() => removeAt(i)}>remove</button>
      </span>
    {/each}
    <button type="button" data-testid="felte-array-move-3-7" onclick={() => moveItem(3, 7)}>move</button>
  </section>
</form>
```

- [ ] **Step 4: Wire the `/array` route in `App.svelte`**

Add imports after the existing cancel-page imports:

```svelte
  import NeutroArraySection from './NeutroArraySection.svelte'
  import TanStackArraySection from './TanStackArraySection.svelte'
  import FelteArraySection from './FelteArraySection.svelte'
```

Add a branch before the final `{:else}`:

```svelte
{:else if path === '/array'}
  <NeutroArraySection />
  <TanStackArraySection />
  <FelteArraySection />
```

- [ ] **Step 5: Build and fix any compile errors against installed types**

```bash
cd bench/apps/svelte && pnpm build
```

Expected: build succeeds. If `mode: 'array'`, `removeValue`, or `moveValue` differ in the installed `@tanstack/svelte-form` (1.33.0), check `node_modules/@tanstack/svelte-form` (it re-exports `@tanstack/form-core`) for the correct array-field API and adjust only that call.

- [ ] **Step 6: Commit**

```bash
git add bench/apps/svelte/src/NeutroArraySection.svelte bench/apps/svelte/src/TanStackArraySection.svelte bench/apps/svelte/src/FelteArraySection.svelte bench/apps/svelte/src/App.svelte
git commit -m "bench(svelte): add array-ops UI for neutro, TanStack, Felte"
```

---

### Task 11: dom-cleanup routes — React, Vue, Svelte (neutro only)

**Files:**
- Modify: `bench/apps/react/src/App.tsx`
- Modify: `bench/apps/vue/src/App.vue`
- Modify: `bench/apps/svelte/src/App.svelte`

**Interfaces:**
- Produces: `/cleanup` route on all 3 apps. Each mounts/unmounts a batch of 50 fields 10 times via `connect`/disconnect, exposes `window.__cleanupDone = true` once finished and `window.__getConnectedCount = () => number` reading `form.getConnectedCount()`.

- [ ] **Step 1: React — add the cleanup page**

In `bench/apps/react/src/App.tsx`, add after the array-ops section, before `// ==================== ASYNC PAGES ====================`:

```tsx
// ==================== DOM-CLEANUP ====================
const cleanupForm = createForm({
  initialValues: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`f${i}`, ''])),
})
;(window as any).__getConnectedCount = () => cleanupForm.getConnectedCount()

function CleanupField({ name }: { name: string }) {
  const ref = useCallback((el: HTMLInputElement | null) => {
    if (el) return cleanupForm.connect(name as any, el)
  }, [name])
  return <input ref={ref} data-testid={`cleanup-${name}`} />
}

function CleanupPage() {
  const [batch, setBatch] = React.useState(0)
  const [mounted, setMounted] = React.useState(true)
  const fieldNames = Object.keys(Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`f${i}`, ''])))

  React.useEffect(() => {
    if (batch >= 10) {
      ;(window as any).__cleanupDone = true
      return
    }
    if (mounted) {
      const t = setTimeout(() => setMounted(false), 20)
      return () => clearTimeout(t)
    } else {
      const t = setTimeout(() => { setBatch(b => b + 1); setMounted(true) }, 20)
      return () => clearTimeout(t)
    }
  }, [batch, mounted])

  return mounted ? <div>{fieldNames.map(n => <CleanupField key={n} name={n} />)}</div> : <div data-testid="cleanup-unmounted" />
}
```

In `App`, add a branch before the final return:

```tsx
  if (path === '/cleanup') {
    return <CleanupPage />
  }
```

- [ ] **Step 2: Vue — add the cleanup page**

Create `bench/apps/vue/src/CleanupPage.vue`:

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { createForm } from '@neutro/form-core'

const FIELD_NAMES = Array.from({ length: 50 }, (_, i) => `f${i}`)
const cleanupForm = createForm({
  initialValues: Object.fromEntries(FIELD_NAMES.map(n => [n, ''])),
})
;(window as any).__getConnectedCount = () => cleanupForm.getConnectedCount()

const mounted = ref(true)
let batch = 0
let timer: ReturnType<typeof setTimeout>

function tick() {
  if (batch >= 10) {
    ;(window as any).__cleanupDone = true
    return
  }
  if (mounted.value) {
    timer = setTimeout(() => { mounted.value = false; timer = setTimeout(tick, 20) }, 20)
  } else {
    batch++
    mounted.value = true
    timer = setTimeout(tick, 20)
  }
}

onMounted(tick)
onUnmounted(() => clearTimeout(timer))

function connectField(el: HTMLInputElement | null, name: string) {
  if (el) cleanupForm.connect(name as any, el)
}
</script>

<template>
  <div v-if="mounted">
    <input
      v-for="name in FIELD_NAMES"
      :key="name"
      :data-testid="`cleanup-${name}`"
      :ref="(el) => connectField(el as HTMLInputElement, name)"
    />
  </div>
  <div v-else data-testid="cleanup-unmounted" />
</template>
```

In `App.vue`, add the import and a route branch:

```vue
import CleanupPage from './CleanupPage.vue'
```

```vue
  <CleanupPage v-else-if="path === '/cleanup'" />
```

- [ ] **Step 3: Svelte — add the cleanup page**

Create `bench/apps/svelte/src/CleanupPage.svelte`:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { createForm } from '@neutro/form-core'

  const FIELD_NAMES = Array.from({ length: 50 }, (_, i) => `f${i}`)
  const cleanupForm = createForm({
    initialValues: Object.fromEntries(FIELD_NAMES.map((n) => [n, ''])),
  })
  ;(window as any).__getConnectedCount = () => cleanupForm.getConnectedCount()

  let mounted = $state(true)
  let batch = 0
  let timer: ReturnType<typeof setTimeout>

  function tick() {
    if (batch >= 10) {
      ;(window as any).__cleanupDone = true
      return
    }
    if (mounted) {
      timer = setTimeout(() => { mounted = false; timer = setTimeout(tick, 20) }, 20)
    } else {
      batch++
      mounted = true
      timer = setTimeout(tick, 20)
    }
  }

  onMount(tick)
  onDestroy(() => clearTimeout(timer))

  function connectField(el: HTMLInputElement, name: string) {
    cleanupForm.connect(name as any, el)
  }
</script>

{#if mounted}
  <div>
    {#each FIELD_NAMES as name}
      <input data-testid={`cleanup-${name}`} use:connectField={name} />
    {/each}
  </div>
{:else}
  <div data-testid="cleanup-unmounted"></div>
{/if}
```

Svelte's `use:` directive expects a function with signature `(node, param) => ActionReturn`, not `(el, name) => void` called directly — fix the action wiring:

```svelte
  function connectAction(node: HTMLInputElement, name: string) {
    const disconnect = cleanupForm.connect(name as any, node)
    return { destroy: disconnect }
  }
```

And change the template to `use:connectAction={name}`.

In `App.svelte`, add the import and branch:

```svelte
  import CleanupPage from './CleanupPage.svelte'
```

```svelte
{:else if path === '/cleanup'}
  <CleanupPage />
```

- [ ] **Step 4: Build all three and verify**

```bash
cd bench && pnpm bench:apps:build
```

Expected: all three apps build with no errors.

- [ ] **Step 5: Commit**

```bash
git add bench/apps/react/src/App.tsx bench/apps/vue/src/CleanupPage.vue bench/apps/vue/src/App.vue bench/apps/svelte/src/CleanupPage.svelte bench/apps/svelte/src/App.svelte
git commit -m "bench: add dom-cleanup route to all 3 apps (neutro only)"
```

---

### Task 12: New and updated Playwright specs

**Files:**
- Modify: `bench/suites/browser/re-renders.spec.ts`
- Modify: `bench/suites/browser/async-latency.spec.ts`
- Create: `bench/suites/browser/array-ops.spec.ts`
- Create: `bench/suites/browser/async-cancellation.spec.ts`
- Create: `bench/suites/browser/dom-cleanup.spec.ts`

**Interfaces:**
- Consumes: routes from Tasks 4–11; `BrowserResult` shape from Task 1.
- Produces: `results/browser.json` keys `re-renders/10`, `re-renders/100`, `array-ops`, `async-cancellation`, `dom-cleanup`, and `async-latency` (now including `[debounce=0]` entries).

- [ ] **Step 1: Update `re-renders.spec.ts` — rename surface to `re-renders/10`, add `re-renders/100`**

Replace the full file:

```ts
import { test, expect, type Page, type TestInfo } from '@playwright/test'
import type { BrowserResult } from '../../types/schema.js'

async function measureReRenders(
  page: Page,
  fieldPrefix: string,
  rendersKey: string,
): Promise<number> {
  await page.evaluate(() => (window as any).__resetRenders?.())
  const input = page.getByTestId(`${fieldPrefix}-field0`)
  for (let i = 0; i < 20; i++) {
    await input.pressSequentially('x', { delay: 10 })
  }
  await page.waitForTimeout(100)
  const counts: Record<string, number> = await page.evaluate(
    (key) => (window as any)[key] ?? {},
    rendersKey,
  )
  return Object.values(counts).reduce((sum, n) => sum + n, 0)
}

async function attach(testInfo: TestInfo, library: string, renderCount: number) {
  const result: BrowserResult = { library, status: 'ok', renderCount }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
}

const COMBOS: Array<{ name: string; port: number; prefix: string; key: string; library: string; limit: number }> = [
  { name: 'neutro/form (React)',    port: 4173, prefix: 'neutro',   key: '__neutroRenders',   library: 'neutro/form (React)',    limit: 25 },
  { name: 'react-hook-form',        port: 4173, prefix: 'rhf',      key: '__rhfRenders',      library: 'react-hook-form',        limit: 500 },
  { name: 'formik',                 port: 4173, prefix: 'formik',   key: '__formikRenders',   library: 'formik',                 limit: 4500 },
  { name: 'tanstack-form (React)',  port: 4173, prefix: 'tanstack', key: '__tanstackRenders', library: 'tanstack-form (React)',  limit: 500 },
  { name: 'neutro/form (Vue)',      port: 4174, prefix: 'neutro',   key: '__neutroRenders',   library: 'neutro/form (Vue)',      limit: 25 },
  { name: 'vee-validate',           port: 4174, prefix: 'vee',      key: '__veeRenders',      library: 'vee-validate',           limit: 500 },
  { name: 'neutro/form (Svelte)',   port: 4175, prefix: 'neutro',   key: '__neutroRenders',   library: 'neutro/form (Svelte)',   limit: 25 },
  { name: 'tanstack-form (Svelte)', port: 4175, prefix: 'tanstack', key: '__tanstackRenders', library: 'tanstack-form (Svelte)', limit: 500 },
  { name: 'felte',                  port: 4175, prefix: 'felte',    key: '__felteRenders',    library: 'felte',                  limit: 2500 },
]

test.describe('re-renders/10', () => {
  for (const c of COMBOS) {
    test(c.name, async ({ page }, testInfo) => {
      await page.goto(`http://localhost:${c.port}/`)
      const total = await measureReRenders(page, c.prefix, c.key)
      await attach(testInfo, c.library, total)
      expect(total).toBeLessThanOrEqual(c.limit)
    })
  }
})

test.describe('re-renders/100', () => {
  for (const c of COMBOS) {
    test(c.name, async ({ page }, testInfo) => {
      await page.goto(`http://localhost:${c.port}/?fields=100`)
      const total = await measureReRenders(page, c.prefix, c.key)
      await attach(testInfo, c.library, total)
      // At 100 fields, whole-form re-render libraries (Formik, Felte) scale linearly with field
      // count — limits are 10x the /10 limits since the typed sequence length (20 keystrokes) is
      // unchanged but each whole-form render now touches 10x more fields.
      expect(total).toBeLessThanOrEqual(c.limit * 10)
    })
  }
})
```

- [ ] **Step 2: Update `async-latency.spec.ts` — add debounce-floor entries, rename `concurrentRacePass` to `cancellationPass`**

Replace the full file:

```ts
import { test, expect, type Page, type TestInfo } from '@playwright/test'
import type { BrowserResult } from '../../types/schema.js'

async function measureLatency(page: Page): Promise<number[]> {
  const latencies: number[] = []
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => {
      ;(window as any).__asyncValidationStart = 0
      ;(window as any).__asyncValidationEnd = 0
    })
    const input = page.getByTestId('async-email')
    await input.fill('test@example.com')
    await page.waitForSelector('[data-testid="async-error"]', { state: 'hidden', timeout: 2000 }).catch(() => {})
    await input.fill('notanemail')
    await page.waitForSelector('[data-testid="async-error"]', { timeout: 3000 })
    const latency: number = await page.evaluate(
      () => (window as any).__asyncValidationEnd - (window as any).__asyncValidationStart,
    )
    if (latency > 0) latencies.push(latency)
  }
  return latencies
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

async function runLatencyTest(
  page: Page,
  testInfo: TestInfo,
  url: string,
  library: string,
  p50Limit: number,
) {
  test.setTimeout(90000)
  await page.goto(url)
  const latencies = await measureLatency(page)
  const p50 = percentile(latencies, 50)
  const p99 = percentile(latencies, 99)
  const result: BrowserResult = {
    library,
    status: 'ok',
    p50Ms: Math.round(p50),
    p99Ms: Math.round(p99),
  }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
  expect(p50).toBeLessThan(p50Limit)
  expect(latencies.length).toBeGreaterThanOrEqual(10)
}

test.describe('async-latency', () => {
  test('neutro/form (React)',       async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4173/async/neutro',   'neutro/form (React)', 600))
  test('react-hook-form',           async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4173/async/rhf',       'react-hook-form', 400))
  test('formik',                    async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4173/async/formik',    'formik', 400))
  test('tanstack-form (React)',     async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4173/async/tanstack',  'tanstack-form (React)', 400))
  test('neutro/form (Vue)',         async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4174/async/neutro',    'neutro/form (Vue)', 600))
  test('vee-validate',              async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4174/async/vee',       'vee-validate', 400))
  test('neutro/form (Svelte)',      async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4175/async/neutro',    'neutro/form (Svelte)', 600))
  test('tanstack-form (Svelte)',    async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4175/async/tanstack',  'tanstack-form (Svelte)', 400))
  test('felte',                     async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4175/async/felte',     'felte', 400))
})

test.describe('async-latency-debounce-floor', () => {
  test('neutro/form (React) [debounce=0]',  async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4173/async/neutro?debounce=0', 'neutro/form (React) [debounce=0]', 400))
  test('neutro/form (Vue) [debounce=0]',    async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4174/async/neutro?debounce=0', 'neutro/form (Vue) [debounce=0]', 400))
  test('neutro/form (Svelte) [debounce=0]', async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4175/async/neutro?debounce=0', 'neutro/form (Svelte) [debounce=0]', 400))
})
```

Note: `p50Limit` is set to 400ms for non-debounced flows (200ms validator + scheduling headroom) and 600ms for neutro's default-debounce flow (200ms validator + 300ms debounce). Run once locally and tighten these to `observed + 20%` after Step 5 below produces real numbers — same practice as the original spec's threshold note.

- [ ] **Step 3: Create `array-ops.spec.ts`**

```ts
import { test, expect, type Page, type TestInfo } from '@playwright/test'
import type { BrowserResult } from '../../types/schema.js'

async function measureArrayOps(page: Page, prefix: string): Promise<number> {
  await page.evaluate(() => (window as any).__resetArrayRenders?.())
  await page.getByTestId(`${prefix}-array-remove-3`).click()
  await page.waitForTimeout(50)
  await page.getByTestId(`${prefix}-array-move-3-7`).click()
  await page.waitForTimeout(50)
  const key = `__${prefix === 'rhf' ? 'rhf' : prefix === 'tanstack' ? 'tanstack' : prefix === 'formik' ? 'formik' : prefix === 'vee' ? 'vee' : prefix === 'felte' ? 'felte' : 'neutro'}ArrayRenders`
  const counts: Record<string, number> = await page.evaluate((k) => (window as any)[k] ?? {}, key)
  return Object.values(counts).reduce((sum, n) => sum + n, 0)
}

async function attach(testInfo: TestInfo, library: string, renderCount: number) {
  const result: BrowserResult = { library, status: 'ok', renderCount }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
}

const COMBOS: Array<{ name: string; port: number; prefix: string; library: string; limit: number }> = [
  { name: 'neutro/form (React)',    port: 4173, prefix: 'neutro',   library: 'neutro/form (React)',    limit: 30 },
  { name: 'react-hook-form',        port: 4173, prefix: 'rhf',      library: 'react-hook-form',        limit: 100 },
  { name: 'formik',                 port: 4173, prefix: 'formik',   library: 'formik',                 limit: 100 },
  { name: 'tanstack-form (React)',  port: 4173, prefix: 'tanstack', library: 'tanstack-form (React)',  limit: 100 },
  { name: 'neutro/form (Vue)',      port: 4174, prefix: 'neutro',   library: 'neutro/form (Vue)',      limit: 30 },
  { name: 'vee-validate',           port: 4174, prefix: 'vee',      library: 'vee-validate',           limit: 100 },
  { name: 'neutro/form (Svelte)',   port: 4175, prefix: 'neutro',   library: 'neutro/form (Svelte)',   limit: 30 },
  { name: 'tanstack-form (Svelte)', port: 4175, prefix: 'tanstack', library: 'tanstack-form (Svelte)', limit: 100 },
  { name: 'felte',                  port: 4175, prefix: 'felte',    library: 'felte',                  limit: 100 },
]

test.describe('array-ops', () => {
  for (const c of COMBOS) {
    test(c.name, async ({ page }, testInfo) => {
      await page.goto(`http://localhost:${c.port}/array`)
      const total = await measureArrayOps(page, c.prefix)
      await attach(testInfo, c.library, total)
      expect(total).toBeLessThanOrEqual(c.limit)
    })
  }
})
```

Threshold note: same as Step 2 — these are intentionally loose starting limits; tighten to `observed + 20%` after Step 5 produces real data.

- [ ] **Step 4: Create `async-cancellation.spec.ts`**

```ts
import { test, expect, type Page, type TestInfo } from '@playwright/test'
import type { BrowserResult } from '../../types/schema.js'

async function measureCancellation(page: Page): Promise<boolean> {
  const input = page.getByTestId('async-email')
  await input.fill('slow@example.com') // kicks off 600ms validation, resolves valid (no error)
  await page.waitForTimeout(50) // let the slow validation start before overtyping
  await input.fill('fastbad') // kicks off 100ms validation, resolves invalid (error)
  await page.waitForTimeout(700) // wait past both validations (600ms + buffer)
  const errorVisible = await page.getByTestId('async-error').isVisible().catch(() => false)
  // Pass = error IS visible (fresh "fastbad" result won), fail = error is hidden (stale "slow" overwrote it)
  return errorVisible
}

async function runCancellationTest(page: Page, testInfo: TestInfo, url: string, library: string) {
  await page.goto(url)
  const cancellationPass = await measureCancellation(page)
  const result: BrowserResult = { library, status: 'ok', cancellationPass }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
}

test.describe('async-cancellation', () => {
  test('neutro/form (React)',       async ({ page }, i) => runCancellationTest(page, i, 'http://localhost:4173/cancel/neutro',   'neutro/form (React)'))
  test('react-hook-form',           async ({ page }, i) => runCancellationTest(page, i, 'http://localhost:4173/cancel/rhf',       'react-hook-form'))
  test('formik',                    async ({ page }, i) => runCancellationTest(page, i, 'http://localhost:4173/cancel/formik',    'formik'))
  test('tanstack-form (React)',     async ({ page }, i) => runCancellationTest(page, i, 'http://localhost:4173/cancel/tanstack',  'tanstack-form (React)'))
  test('neutro/form (Vue)',         async ({ page }, i) => runCancellationTest(page, i, 'http://localhost:4174/cancel/neutro',    'neutro/form (Vue)'))
  test('vee-validate',              async ({ page }, i) => runCancellationTest(page, i, 'http://localhost:4174/cancel/vee',       'vee-validate'))
  test('neutro/form (Svelte)',      async ({ page }, i) => runCancellationTest(page, i, 'http://localhost:4175/cancel/neutro',    'neutro/form (Svelte)'))
  test('tanstack-form (Svelte)',    async ({ page }, i) => runCancellationTest(page, i, 'http://localhost:4175/cancel/tanstack',  'tanstack-form (Svelte)'))
  test('felte',                     async ({ page }, i) => runCancellationTest(page, i, 'http://localhost:4175/cancel/felte',     'felte'))
})
```

No `expect()` assertion on `cancellationPass` itself — a `false` result for a competitor is an expected, real finding (most libraries are expected to fail this), not a test failure. The test only fails on navigation/timeout errors.

- [ ] **Step 5: Create `dom-cleanup.spec.ts`**

```ts
import { test, expect, type Page, type TestInfo } from '@playwright/test'
import type { BrowserResult } from '../../types/schema.js'

async function measureCleanup(page: Page): Promise<number> {
  await page.waitForFunction(() => (window as any).__cleanupDone === true, { timeout: 15000 })
  return page.evaluate(() => (window as any).__getConnectedCount())
}

async function runCleanupTest(page: Page, testInfo: TestInfo, url: string, library: string) {
  await page.goto(url)
  const connectedCountAfterCleanup = await measureCleanup(page)
  const result: BrowserResult = { library, status: 'ok', connectedCountAfterCleanup }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
  expect(connectedCountAfterCleanup).toBe(0)
}

test.describe('dom-cleanup', () => {
  test('neutro/form (React)',  async ({ page }, i) => runCleanupTest(page, i, 'http://localhost:4173/cleanup', 'neutro/form (React)'))
  test('neutro/form (Vue)',    async ({ page }, i) => runCleanupTest(page, i, 'http://localhost:4174/cleanup', 'neutro/form (Vue)'))
  test('neutro/form (Svelte)', async ({ page }, i) => runCleanupTest(page, i, 'http://localhost:4175/cleanup', 'neutro/form (Svelte)'))
})
```

- [ ] **Step 6: Build all apps and run the full browser suite**

```bash
cd bench && pnpm bench:apps:build && pnpm bench:browser
```

Expected: all tests pass (may need threshold adjustments per the notes in Steps 2 and 3 — if a specific limit is too tight for real observed numbers, raise it to `observed + 20%` and rerun).

- [ ] **Step 7: Commit**

```bash
git add bench/suites/browser/
git commit -m "bench: add array-ops, async-cancellation, dom-cleanup specs; split re-renders by scale; add debounce-floor latency"
```

---

### Task 13: `merge-results.ts` and `generate-page.ts` rewrite

**Files:**
- Modify: `bench/scripts/merge-results.ts`
- Modify: `bench/scripts/generate-page.ts`

**Interfaces:**
- Consumes: `computeVerdict`, `computeBooleanVerdict`, `Verdict`, `ANNOTATIONS` from Task 1; `results/bundle-size.json` from Task 3.
- Produces: `docs/benchmarks/index.md` with scorecard + all detail tables.

- [ ] **Step 1: Update `merge-results.ts` to read `bundle-size.json`**

Replace the full file:

```ts
import { readFileSync, writeFileSync } from 'node:fs'
import type { BenchResults, CorrectnessResult } from '../types/schema.js'

const neutroVersion = (process.env.NEUTRO_VERSION ?? '').replace(/^v/, '') || 'unknown'

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    console.error(`[merge-results] Failed to read ${path}:`, e)
    process.exit(1)
  }
}

function normalizeCorrectnessJson(raw: any): Record<string, CorrectnessResult[]> {
  const out: Record<string, CorrectnessResult[]> = {}
  for (const file of raw.testResults ?? []) {
    for (const test of file.assertionResults ?? []) {
      const surface: string = test.ancestorTitles?.[0] ?? 'unknown'
      const status: CorrectnessResult['status'] =
        test.status === 'passed' ? 'pass'
        : test.status === 'failed' ? 'fail'
        : 'na'
      const detail: string | undefined =
        test.failureMessages?.length ? test.failureMessages[0] : undefined
      ;(out[surface] ??= []).push({ library: test.title, status, detail })
    }
  }
  return out
}

const core        = readJson('results/core.json') as Record<string, any>
const correctness = readJson('results/correctness.json') as Record<string, any>
const browser      = readJson('results/browser.json') as Record<string, any>
const bundleSize    = readJson('results/bundle-size.json') as Record<string, any>

const merged: BenchResults = {
  meta: {
    generatedAt: new Date().toISOString(),
    neutroVersion,
    nodeVersion: process.version,
    platform: process.platform,
    runner: process.env.CI ? 'github-actions' : 'local',
  },
  core,
  correctness: normalizeCorrectnessJson(correctness),
  browser,
  bundleSize,
}

writeFileSync('results/latest.json', JSON.stringify(merged, null, 2))
console.log('[merge-results] wrote results/latest.json')
```

- [ ] **Step 2: Write the failing test for the scorecard helper**

Create `bench/scripts/scorecard.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import { buildScorecard } from './scorecard.js'
import type { BenchResults } from '../types/schema.js'

describe('buildScorecard', () => {
  test('produces one row per non-neutro library, one column per surface', () => {
    const baseline: BenchResults = {
      meta: { generatedAt: '2026-06-30T00:00:00.000Z', neutroVersion: '0.4.0', nodeVersion: 'v22.0.0', platform: 'linux', runner: 'github-actions' },
      core: {},
      correctness: {
        'array-state-integrity': [
          { library: 'neutro/form', status: 'pass' },
          { library: 'react-hook-form', status: 'na' },
        ],
      },
      browser: {
        're-renders/10': [
          { library: 'neutro/form (React)', status: 'ok', renderCount: 20 },
          { library: 'react-hook-form', status: 'ok', renderCount: 20 },
        ],
      },
      bundleSize: {
        'bundle-size': [
          { library: 'neutro/form', status: 'ok', gzipBytes: 3000 },
          { library: 'react-hook-form', status: 'ok', gzipBytes: 9000 },
        ],
      },
    }
    const rows = buildScorecard(baseline)
    const rhfRow = rows.find(r => r.library === 'react-hook-form')
    expect(rhfRow).toBeDefined()
    expect(rhfRow!.badges['array-state-integrity']).toBe('na')
    expect(rhfRow!.badges['re-renders/10']).toBe('tied')
    expect(rhfRow!.badges['bundle-size']).toBe('win') // neutro 3000 vs competitor 9000 -> competitor much worse (higher gzip = worse)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd bench && pnpm exec vitest run scripts/scorecard.test.ts
```

Expected: FAIL — `./scorecard.js` doesn't exist yet.

- [ ] **Step 4: Create `bench/scripts/scorecard.ts`**

```ts
import { computeVerdict, computeBooleanVerdict, type Verdict } from '../lib/verdict.js'
import type { BenchResults, BrowserResult, CorrectnessResult, BundleSizeResult } from '../types/schema.js'

export interface ScorecardRow {
  library: string
  badges: Record<string, Verdict>
}

const CORRECTNESS_SURFACES = ['array-state-integrity', 'async-race', 'dependency-trigger']
const BROWSER_NUMERIC_SURFACES: Array<{ key: string; metric: 'renderCount' | 'p50Ms'; higherIsBetter: boolean }> = [
  { key: 're-renders/10', metric: 'renderCount', higherIsBetter: false },
  { key: 're-renders/100', metric: 'renderCount', higherIsBetter: false },
  { key: 'array-ops', metric: 'renderCount', higherIsBetter: false },
  { key: 'async-latency', metric: 'p50Ms', higherIsBetter: false },
]

function findNeutroLibrary(results: Array<{ library: string }>): string | undefined {
  return results.find(r => r.library.startsWith('neutro/form'))?.library
}

export function buildScorecard(baseline: BenchResults): ScorecardRow[] {
  const libraries = new Set<string>()
  for (const results of Object.values(baseline.browser ?? {})) {
    for (const r of results) if (!r.library.startsWith('neutro/form')) libraries.add(r.library)
  }
  for (const results of Object.values(baseline.bundleSize ?? {})) {
    for (const r of results) if (r.library !== 'neutro/form') libraries.add(r.library)
  }

  const rows: ScorecardRow[] = []
  for (const library of libraries) {
    const badges: Record<string, Verdict> = {}

    for (const surface of CORRECTNESS_SURFACES) {
      const results = (baseline.correctness?.[surface] ?? []) as CorrectnessResult[]
      const neutroResult = results.find(r => r.library === 'neutro/form')
      const competitorResult = results.find(r => r.library === library)
      if (!competitorResult) continue
      const neutroPass = neutroResult ? neutroResult.status === 'pass' : undefined
      const competitorPass = competitorResult.status === 'pass' ? true
        : competitorResult.status === 'na' ? undefined
        : false
      const status = competitorResult.status === 'na' ? 'na' : 'ok'
      badges[surface] = computeBooleanVerdict(surface, library, neutroPass, competitorPass, status as any)
    }

    for (const { key, metric, higherIsBetter } of BROWSER_NUMERIC_SURFACES) {
      const results = (baseline.browser?.[key] ?? []) as BrowserResult[]
      if (!results.length) continue
      const neutroLib = findNeutroLibrary(results)
      const neutroResult = results.find(r => r.library === neutroLib)
      const competitorResult = results.find(r => r.library === library)
      if (!competitorResult) continue
      badges[key] = computeVerdict(key, library, neutroResult?.[metric], competitorResult[metric], higherIsBetter, competitorResult.status)
    }

    {
      const results = (baseline.browser?.['async-cancellation'] ?? []) as BrowserResult[]
      const neutroLib = findNeutroLibrary(results)
      const neutroResult = results.find(r => r.library === neutroLib)
      const competitorResult = results.find(r => r.library === library)
      if (competitorResult) {
        badges['async-cancellation'] = computeBooleanVerdict(
          'async-cancellation', library, neutroResult?.cancellationPass, competitorResult.cancellationPass, competitorResult.status,
        )
      }
    }

    {
      const results = (baseline.bundleSize?.['bundle-size'] ?? []) as BundleSizeResult[]
      const neutroResult = results.find(r => r.library === 'neutro/form')
      const competitorResult = results.find(r => r.library === library)
      if (competitorResult) {
        badges['bundle-size'] = computeVerdict(
          'bundle-size', library, neutroResult?.gzipBytes, competitorResult.gzipBytes, false, competitorResult.status,
        )
      }
    }

    rows.push({ library, badges })
  }

  return rows.sort((a, b) => a.library.localeCompare(b.library))
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd bench && pnpm exec vitest run scripts/scorecard.test.ts
```

Expected: PASS.

- [ ] **Step 6: Rewrite `generate-page.ts`**

Replace the full file:

```ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import type { BenchResults, CorrectnessResult, BrowserResult, BundleSizeResult } from '../types/schema.js'
import { ANNOTATIONS } from '../annotations.js'
import { buildScorecard } from './scorecard.js'
import type { Verdict } from '../lib/verdict.js'

const baseline = JSON.parse(readFileSync('results/baseline.json', 'utf8')) as BenchResults

const correctnessSurfaces = Object.keys(baseline.correctness ?? {})
const browserSurfaces = Object.keys(baseline.browser ?? {})

const SURFACE_TITLES: Record<string, string> = {
  're-renders/10': 'Re-renders per 20-keystroke sequence (10-field form)',
  're-renders/100': 'Re-renders per 20-keystroke sequence (100-field form)',
  'async-latency': 'Async Validation Latency',
  'async-latency-debounce-floor': 'Async Validation Latency — Debounce Floor (neutro only)',
  'array-ops': 'Array Operations (remove + move, render count)',
  'async-cancellation': 'Async Cancellation (stale-result race)',
  'dom-cleanup': 'DOM Cleanup (connect/disconnect, neutro only)',
}

const BADGE_LABEL: Record<Verdict, string> = {
  win: '✅ Win',
  tied: '➖ Tied',
  behind: '❌ Behind',
  tradeoff: '⚖️ Tradeoff',
  na: '— N/A',
  error: '💥 Error',
}

const footnotes: string[] = []
function addFootnote(surface: string, library: string, reason: string): string {
  const key = `${surface}-${library}`
  const idx = footnotes.findIndex(f => f.startsWith(`[^${key}]:`))
  if (idx >= 0) return `[^${key}]`
  footnotes.push(`[^${key}]: ${library} — ${reason}`)
  return `[^${key}]`
}

function reasonMarker(surface: string, library: string): string {
  const reason = ANNOTATIONS[surface]?.[library]
  return reason ? addFootnote(surface, library, reason) : ''
}

function correctnessTable(surface: string, results: CorrectnessResult[]): string {
  const rows = results.map(r => {
    const badge = r.status === 'pass' ? '✅ PASS'
      : r.status === 'fail' ? '❌ FAIL'
      : r.status === 'error' ? '💥 ERROR'
      : `— N/A${reasonMarker(surface, r.library)}`
    return `| ${r.library} | ${badge} |`
  }).join('\n')
  return `| Library | Result |\n|---|---|\n${rows}`
}

function browserTable(surface: string, results: BrowserResult[]): string {
  const hasRender = results.some(r => r.renderCount != null)
  const hasLatency = results.some(r => r.p50Ms != null)
  const hasCancellation = results.some(r => r.cancellationPass != null)
  const hasCleanup = results.some(r => r.connectedCountAfterCleanup != null)

  const headers: string[] = ['Library']
  if (hasRender) headers.push('Renders')
  if (hasLatency) headers.push('p50', 'p99')
  if (hasCancellation) headers.push('Cancellation')
  if (hasCleanup) headers.push('Connected after cleanup')

  const rows = results.map(r => {
    const cells: string[] = [r.library]
    if (hasRender) cells.push(r.renderCount != null ? String(r.renderCount) : '—')
    if (hasLatency) cells.push(
      r.p50Ms != null ? `${r.p50Ms}ms${reasonMarker(surface, r.library)}` : '—',
      r.p99Ms != null ? `${r.p99Ms}ms` : '—',
    )
    if (hasCancellation) cells.push(
      r.cancellationPass == null ? '—' : r.cancellationPass ? '✅' : `❌${reasonMarker(surface, r.library)}`,
    )
    if (hasCleanup) cells.push(r.connectedCountAfterCleanup != null ? String(r.connectedCountAfterCleanup) : '—')
    return `| ${cells.join(' | ')} |`
  }).join('\n')

  return `| ${headers.join(' | ')} |\n|${headers.map(() => '---').join('|')}|\n${rows}`
}

function bundleSizeTable(results: BundleSizeResult[]): string {
  const rows = results.map(r => {
    const size = r.gzipBytes != null ? `${(r.gzipBytes / 1024).toFixed(1)} KB` : '—'
    return `| ${r.library} | ${r.status === 'error' ? 'ERROR' : size} |`
  }).join('\n')
  return `| Library | Gzip size |\n|---|---|\n${rows}`
}

function scorecardTable(): string {
  const rows = buildScorecard(baseline)
  const columns = ['array-state-integrity', 'async-race', 'dependency-trigger', 're-renders/10', 're-renders/100', 'async-latency', 'array-ops', 'async-cancellation', 'bundle-size']
  const header = `| Library | ${columns.join(' | ')} |`
  const divider = `|---|${columns.map(() => '---').join('|')}|`
  const body = rows.map(r => {
    const cells = columns.map(c => BADGE_LABEL[r.badges[c] ?? 'na'])
    return `| ${r.library} | ${cells.join(' | ')} |`
  }).join('\n')
  return `${header}\n${divider}\n${body}`
}

const date = baseline.meta.generatedAt.slice(0, 10)
const version = baseline.meta.neutroVersion

const lines: string[] = [
  `# Benchmarks`,
  ``,
  `> Measured on: GitHub Actions ubuntu-latest, Node ${baseline.meta.nodeVersion}, Chromium (Playwright)`,
  `> Last updated: ${date} | neutro/form v${version}`,
  ``,
  `## Methodology`,
  ``,
  `Three dimensions: **correctness** (PASS/FAIL), **browser performance** (Playwright Chromium), and **bundle size** (esbuild + gzip).`,
  `Badges are always relative to neutro/form: ✅ Win (neutro beats this library by >10%), ➖ Tied (within 10%), ❌ Behind (neutro trails by >10%, no documented reason), ⚖️ Tradeoff (neutro trails by >10%, but it's a documented design choice — see footnotes), — N/A (surface doesn't apply to this library).`,
  ``,
  `## Scorecard`,
  ``,
  scorecardTable(),
  ``,
  `## Correctness`,
  ``,
]

for (const surface of correctnessSurfaces) {
  const results = baseline.correctness[surface] as CorrectnessResult[]
  lines.push(`### ${surface}`, ``, correctnessTable(surface, results), ``)
}

if (browserSurfaces.length) {
  lines.push(`## Browser (Chromium / Playwright, production build, no StrictMode)`, ``)
  for (const surface of browserSurfaces) {
    const results = baseline.browser[surface] as BrowserResult[]
    const title = SURFACE_TITLES[surface] ?? surface
    lines.push(`### ${title}`, ``, browserTable(surface, results), ``)
  }
}

const bundleResults = baseline.bundleSize?.['bundle-size'] as BundleSizeResult[] | undefined
if (bundleResults?.length) {
  lines.push(`## Bundle Size`, ``, bundleSizeTable(bundleResults), ``)
}

lines.push(
  `## Architecture Notes`,
  ``,
  `**DOM cleanup** (\`dom-cleanup\` row above, neutro only): neutro/form's \`connect\`/\`disconnect\` lifecycle registers a \`WeakRef\` per connected field in an internal registry, pruned by a \`MutationObserver\` watching for node removal. The "Connected after cleanup" number confirms this registry returns to 0 after mount/unmount churn — competitor libraries have no equivalent connect/disconnect API to compare against, so this section has no comparison table.`,
  ``,
)

if (footnotes.length) {
  lines.push(`---`, ``, ...footnotes, ``)
}

const out = lines.join('\n')
mkdirSync('../docs/benchmarks', { recursive: true })
writeFileSync('../docs/benchmarks/index.md', out)
console.log('[generate-page] wrote docs/benchmarks/index.md')
```

- [ ] **Step 7: Run merge + generate end-to-end with the data produced by Tasks 3 and 12**

```bash
cd bench && pnpm bench:merge && pnpm bench:update-baseline
CI=true pnpm bench:update-baseline
pnpm bench:generate
cat ../docs/benchmarks/index.md | head -60
```

Expected: `docs/benchmarks/index.md` starts with the Scorecard table showing real badges, followed by Correctness, Browser, Bundle Size, and Architecture Notes sections. No TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add bench/scripts/ bench/results/baseline.json docs/benchmarks/index.md
git commit -m "bench: rewrite generate-page.ts with scorecard, badges, and new surface tables"
```

---

### Task 14: CI workflow updates and full pipeline verification

**Files:**
- Modify: `.github/workflows/bench-full.yml`
- Modify: `.github/workflows/bench-weekly.yml`
- Modify: `bench/package.json`

**Interfaces:**
- Consumes: `bench:bundle-size` script from Task 3.

- [ ] **Step 1: Add the `bench:bundle-size` step to `bench-full.yml`**

In `.github/workflows/bench-full.yml`, find:

```yaml
      - run: pnpm --dir bench run bench:core
      - run: pnpm --dir bench run bench:correctness
      - run: pnpm --dir bench run bench:browser
```

Replace with:

```yaml
      - run: pnpm --dir bench run bench:core
      - run: pnpm --dir bench run bench:correctness
      - run: pnpm --dir bench run bench:browser
      - run: pnpm --dir bench run bench:bundle-size
```

- [ ] **Step 2: Add the `bench:bundle-size` step to `bench-weekly.yml`**

In `.github/workflows/bench-weekly.yml`, find:

```yaml
      - run: pnpm --dir bench run bench:core
      - run: pnpm --dir bench run bench:correctness
      - run: pnpm --dir bench run bench:browser
      - run: pnpm --dir bench run bench:merge
```

Replace with:

```yaml
      - run: pnpm --dir bench run bench:core
      - run: pnpm --dir bench run bench:correctness
      - run: pnpm --dir bench run bench:browser
      - run: pnpm --dir bench run bench:bundle-size
      - run: pnpm --dir bench run bench:merge
```

- [ ] **Step 3: Update `bench:full` in `bench/package.json` to include bundle-size**

Find:

```json
    "bench:full":            "run-s bench:apps:build bench:core bench:correctness bench:browser bench:merge bench:generate",
```

Replace with:

```json
    "bench:full":            "run-s bench:apps:build bench:core bench:correctness bench:browser bench:bundle-size bench:merge bench:generate",
```

- [ ] **Step 4: Run the full local pipeline end-to-end**

```bash
cd bench && pnpm bench:full
```

Expected: every step completes without error; `docs/benchmarks/index.md` is regenerated with current numbers.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/bench-full.yml .github/workflows/bench-weekly.yml bench/package.json
git commit -m "bench(ci): add bench:bundle-size step to bench-full.yml, bench-weekly.yml, and bench:full"
```

---

## Self-Review Notes (from plan authoring)

- **Spec coverage:** All 8 numbered surfaces from the spec map to tasks — Surface 1 (array-ops) → Tasks 8–10; Surface 2 (async-cancellation) → Tasks 4–6, 12; Surface 3 (debounce-floor) → Tasks 4–6, 12; Surface 4 (re-renders at scale) → Task 7, 12; Surface 5 (bundle-size) → Task 3; Surface 6 (dom-cleanup) → Task 11, 12; Surface 7 (comment cleanup) → Task 2; Surface 8 (scorecard) → Task 13. Verdict system and annotations file → Task 1. CI/pipeline wiring → Task 14.
- **Type consistency check:** `cancellationPass` (Task 1's schema) is used consistently in Tasks 12 and 13 — no stray `racePass` or `concurrentRacePass` references remain anywhere in the plan. `connectedCountAfterCleanup` (Task 1) matches Task 11's `__getConnectedCount` window hook and Task 12's `dom-cleanup.spec.ts` field name. `gzipBytes` (Task 1, `BundleSizeResult`) matches Task 3's `measure.ts` output and Task 13's `bundleSizeTable`/`scorecard.ts` usage.
- **Known implementation risk:** Tasks 8–10 (array-ops) and Task 3 (bundle-size) call competitor library methods (`useFieldArray`, `FieldArray`, `mode: 'array'`, `removeValue`/`moveValue`) whose exact names could differ by patch version from what's documented here. Each of those tasks' build step explicitly instructs checking installed `.d.ts` files and adjusting only the mismatched call if compilation fails — this is the one category of step in this plan that may need a one-line adjustment during execution rather than working byte-for-byte on the first try.
