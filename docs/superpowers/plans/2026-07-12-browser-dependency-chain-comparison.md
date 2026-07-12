# Browser Dependency-Chain Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real, browser-render-context comparison between neutro/form's declarative dependency graph and react-hook-form/vee-validate/tanstack-form's realistic manual-wiring equivalent, for a 200-field validation-only cascade, feeding the existing bench reporting pipeline.

**Architecture:** One new isolated route per included library per app (React/Vue/Svelte bench apps), each rendering 200 fields via a single reused field component (matching the existing `Field`-component-in-a-loop convention already used throughout these apps, e.g. `NeutroField.svelte`, `TanStackField.svelte`). One new Playwright spec drives these routes, typing into `f0` and measuring `performance.mark`-bracketed latency until `f199`'s own validator has run one more time. Formik and Felte get `status: 'na'` rows — neither exposes a per-field watch/subscribe primitive that can drive a cascade of this shape.

**Tech Stack:** Playwright (`bench/suites/browser/`), React/Vue/Svelte bench apps (`bench/apps/*`), neutro/form's `dependencies` config, react-hook-form's `trigger()`, vee-validate's `useField().validate()`, TanStack Form's `validateField()`.

## Corrected mechanism (found while writing this plan — read before Task 2)

The approved spec (`docs/superpowers/specs/2026-07-11-browser-dependency-chain-comparison-design.md`) describes each competitor's manual wiring as "field `i` watches field `i-1`'s value and re-validates itself when it changes." **This cannot work as literally described.** Per the spec's own Chain-semantics section (validation-only cascade, no value propagation), only `f0`'s displayed value ever changes — `f1..f199` never do. A wiring that watches "the previous field's value" has nothing to observe past the first hop (`f0 → f1`); `f2..f199` would never re-validate, because `f1`'s value never changes for `f2` to watch.

neutro's own side of the comparison is unaffected — `compileDependencyScopes` cascades on *validation being run*, not on a value changing, so `dependencies: { f0: ['f1'], f1: ['f2'], ... }` already cascades correctly via one `form.set('f0', v, { validate: true })` call.

**Fix, applied uniformly to RHF/vee-validate/TanStack below:** replace "watch the previous field's value" with a **forward-push trigger chain** — each field `i`'s own validate function, after computing its own result, explicitly triggers field `i+1`'s validation (`trigger('f{i+1}')` for RHF, calling a stored `validate` closure for vee-validate, `form.validateField('f{i+1}', 'change')` for TanStack). This preserves everything the spec's comparison cares about — 199 independently-wired per-hop trigger points, same forward physical direction (`f0 → f199`), same per-hop overhead the hypothesis is measuring (a real function call + validation run per hop) — while actually cascading. `f0` itself needs no validate rule (per the spec, "nothing precedes it"); its `onChange` handler directly increments its own counter and kicks off the chain by triggering `f1`.

Every wiring snippet below already reflects this correction — no further changes needed at implementation time, just be aware this deviates from the spec document's literal wording (the spec itself is not being edited; this plan is the record of the correction, and Task 7 flags it back to the user as a disclosed deviation, same as the pre-existing core-fixture bug).

**Orchestrator hand-off note (found in plan review):** Task 1's Step 1 confirms the real installed TanStack Form API shape used by Task 2 Step 3 and Task 4 Step 2. Since each task is executed by a fresh implementer subagent with zero shared context, whoever is running this plan (subagent-driven-development's controller) **must paste Task 1's Step 1 findings verbatim into Task 2's and Task 4's task briefs** before dispatching those implementers — do not assume this hands off automatically.

## Global Constraints

- **Chain length**: 200 fields, `f0..f199`, matching `bench/fixtures/dependency-chain.ts`'s existing core fixture size.
- **Chain semantics**: validation-only cascade. No field's *value* changes as a result of the cascade — only `f0`'s value ever changes (typed by the test). Every field `i > 0` has a "must differ from field `i-1`'s current value" validator; `f0` has no validator of its own. **"No validator" means no differs-check assertion** — every implementation (neutro/RHF/vee-validate/TanStack) still needs some hook point on `f0` to count its own validation-run and kick off the forward cascade; that hook always short-circuits before the differs-check itself (`if (i === 0) return ...`/`continue` in every wiring below), consistent across all four. This is not a bug to remove.
- **Initial values**: `f{i} = String(i)` for all `i` — guarantees no two adjacent fields start equal (so no spurious initial validation errors), all distinct strings.
- **Direction**: `f0 → f1 → f2 → ... → f199` (forward). neutro's `dependencies` config: `{ f0: ['f1'], f1: ['f2'], ..., f198: ['f199'] }` — key is the *trigger* field, array is what also gets validated. Do **not** copy `bench/fixtures/dependency-chain.ts`'s `{ f{i+1}: [f{i}] }` shape — that fixture is backward relative to its own `set('f0', ...)` call (a real, pre-existing bug — see Task 1, flag only, do not fix).
- **Neutro's validate-trigger mechanism**: `form.set('f0', value, { validate: true })` on `f0`'s `onChange` — not `validationMode`, which only gates `form.connect()`-wired fields and is irrelevant to the plain `onChange={e => form.set(...)}` pattern used here.
- **Field locator convention**: `data-testid="${prefix}-field-f${i}"` (e.g. `neutro-field-f0`, `rhf-field-f199`).
- **Counter convention**: `window.__<lib>ChainValidations` (e.g. `window.__neutroChainValidations`), a `Record<string, number>` keyed by field name, incremented once per validator *run* (not per result change) for that field.
- **Surface key / describe title**: `bench/suites/browser/dependency-chain-settle.spec.ts` with `test.describe('dependency-chain-settle', ...)` — this exact string is what `SURFACE_TITLES`/`ANNOTATIONS` must key off.
- **Metric**: `settleLatencyMs` on `BrowserResult`, measuring `performance.mark('chain-start')` (before the `f0` change) to `performance.mark('chain-end')` (the instant `f199`'s counter increments).
- **Measurement-bias caveat**: this technique's floor is Playwright's `waitForFunction` polling granularity, not real work, for very fast libraries — must be disclosed as an annotation on the new surface, not presented as an exact figure.
- **No routes for Formik/Felte** — both are N/A (`status: 'na'`), asserted directly with no `page.goto`, same pattern as `schema-validate-rerenders.spec.ts`'s Formik case.
- **Timeout**: bump this Playwright spec's per-test timeout above the suite default (mandatory per the spec's feasibility-risk section) — 200-field cascades are a heavier workload than any existing browser surface.
- Full spec: `docs/superpowers/specs/2026-07-11-browser-dependency-chain-comparison-design.md`.

---

## File Structure

| File | Responsibility |
|---|---|
| `bench/apps/react/src/DependencyChainNeutro.tsx`, `DependencyChainRhf.tsx`, `DependencyChainTanStack.tsx` (new) | React chain routes. |
| `bench/apps/vue/src/DependencyChainNeutro.vue`, `ChainFieldVee.vue`, `DependencyChainVee.vue` (new) | Vue chain routes. |
| `bench/apps/svelte/src/DependencyChainNeutro.svelte`, `DependencyChainTanStack.svelte` (new) | Svelte chain routes. |
| `bench/apps/react/src/App.tsx`, `bench/apps/vue/src/App.vue`, `bench/apps/svelte/src/App.svelte` | Add `/dependency-chain/*` routing branches. |
| `bench/types/schema.ts` | Add `settleLatencyMs?: number` to `BrowserResult`. |
| `bench/scripts/generate-page.ts` | Add `settleLatencyMs` table column; add `SURFACE_TITLES` entry. |
| `bench/annotations.ts` | Add Formik/Felte N/A reasons + measurement-bias caveat annotation. |
| `bench/suites/browser/dependency-chain-settle.spec.ts` (new) | Settle-latency Playwright spec. |

---

### Task 1: Verify TanStack's real API, flag the pre-existing core-fixture bug

**Files:** none (verification + a documented finding only — no code changes in this task).

**Interfaces:**
- Produces: a confirmed, real method signature for TanStack Form's field-level validator callback and `form.validateField()`, which Task 2/4 depend on.

- [ ] **Step 1: Verify TanStack Form's validator callback signature against the installed package**

```bash
cd /Users/kofi/_/agw-form
cat bench/apps/react/node_modules/@tanstack/form-core/package.json | grep '"version"'
grep -n "validateField" bench/apps/react/node_modules/@tanstack/form-core/dist/*.d.ts
grep -n "onChange" bench/apps/react/node_modules/@tanstack/form-core/dist/*.d.ts | head -20
```
Confirm: (a) `FormApi` (or equivalent) exposes a `validateField(field: string, cause: 'change' | 'blur' | 'submit' | 'mount')` method callable imperatively from outside a field's own validator; (b) a field-level `validators: { onChange: (ctx) => ... }` callback receives an object containing at minimum `value` and a way to reach the owning form instance (commonly `fieldApi.form` on the callback's second argument, or `fieldApi` itself if the callback signature is `(value, fieldApi) => ...` rather than a single destructured object — check the real `.d.ts`, do not assume); (c) **`FieldApi` also exposes a separate `listeners?: { onChange?: (ctx) => void, ... }` option, distinct from `validators`**, meant for side effects rather than validation results — confirm its callback shape too (also expected to receive `fieldApi` with a `.form.validateField(...)` reachable from it). Write down the exact shapes found for both (b) and (c); Task 2 and Task 4's code below deliberately splits pure validation (`validators.onChange`, no side effects) from the forward-push cascade trigger (`listeners.onChange`, calls `fieldApi.form.validateField(...)`) — calling `validateField` from inside `validators.onChange` itself would re-enter synchronously up to 199 levels deep in one keystroke's call stack, which `listeners` avoids. **If the installed version's real shape differs from either assumption, adjust Task 2/4's `DependencyChainTanStack.tsx`/`.svelte` accordingly during those tasks**, using whatever the real, verified signatures are instead of guessing.

- [ ] **Step 2: Flag the pre-existing `bench/fixtures/dependency-chain.ts` direction bug (do not fix — out of this plan's scope)**

Read `bench/fixtures/dependency-chain.ts`:
```ts
export const dependencyChainFixture: FormFixture = {
  initialValues: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`f${i}`, 0])),
  dependencies: Object.fromEntries(
    Array.from({ length: 199 }, (_, i) => [`f${i + 1}`, [`f${i}`]])
  ),
}
```
This maps `f{i+1}: [f{i}]` — keyed backward relative to `bench/suites/core/dependency-chain.bench.ts`'s own `a.set('f0', ...)` call. Given `compileDependencyScopes`'s real key/array semantics (key = trigger field, array = also-validate-these, confirmed in `packages/core/src/index.ts` and `docs/guides/dependency-graph.md`), this means the existing `dependency-graph/deep-chain` **core benchmark currently validates only `{f0}` on `set('f0', ...)`, not a 199-field cascade** — its own hypothesis ("neutro's O(1) precomputed-scope lookup means set(f0) triggers exactly the validation work for the chain") is unverified/false as currently implemented. This is a real, pre-existing bug in a sibling benchmark, confirmed independently across two rounds of adversarial spec review.

**Do not fix it in this plan** — it's out of this plan's stated scope (a separate core-suite file, not touched by this comparison). Write a one-paragraph note into this task's report calling it out explicitly, so it reaches the user via Task 7's final summary and can be triaged as its own follow-up (likely a one-line fix: reverse the fixture's map to `f{i}: [f{i+1}]`, plus re-running `bench:core` to get the fixture's real, previously-unmeasured number).

- [ ] **Step 3: Report**

Write a short report (no file, just the task's return value/summary) covering: the confirmed TanStack API shape from Step 1 (with the exact `.d.ts` lines found), and the flagged core-fixture bug from Step 2. No commit needed — no files changed.

---

### Task 2: React routes (neutro, react-hook-form, tanstack-form)

**Files:**
- Create: `bench/apps/react/src/DependencyChainNeutro.tsx`, `bench/apps/react/src/DependencyChainRhf.tsx`, `bench/apps/react/src/DependencyChainTanStack.tsx`
- Modify: `bench/apps/react/src/App.tsx`

**Interfaces:**
- Produces: routes `/dependency-chain/neutro`, `/dependency-chain/rhf`, `/dependency-chain/tanstack`; each renders 200 `data-testid="${prefix}-field-f${i}"` inputs; each maintains `window.__<lib>ChainValidations` (`Record<string, number>`, keyed `f0`..`f199`).

- [ ] **Step 1: `DependencyChainNeutro.tsx`**

```tsx
// bench/apps/react/src/DependencyChainNeutro.tsx
import { createForm } from '@neutro/form-core'
import { useFormPath } from '@neutro/form-react'

const FIELD_COUNT = 200
const FIELDS = Array.from({ length: FIELD_COUNT }, (_, i) => `f${i}`)

const neutroChainValidations: Record<string, number> = {}
;(window as any).__neutroChainValidations = neutroChainValidations

const dependencies = Object.fromEntries(
  Array.from({ length: FIELD_COUNT - 1 }, (_, i) => [`f${i}`, [`f${i + 1}`]]),
)

// Form-level validator: given the current values and the scope of paths that need
// (re-)validating this pass, increments each validated field's counter and checks
// "must differ from previous field" for every field except f0. The `dependencies`
// config above is what turns ONE form.set('f0', v, { validate: true }) call into a
// scope containing all 200 fields -- this validator just executes each member.
function chainValidator(values: Record<string, string>, scope: string[]) {
  const errors: Record<string, string> = {}
  for (const path of scope) {
    neutroChainValidations[path] = (neutroChainValidations[path] ?? 0) + 1
    const i = Number(path.slice(1))
    if (i === 0) continue
    if (values[path] === values[`f${i - 1}`]) {
      errors[path] = 'must differ from previous field'
    }
  }
  return errors
}

const form = createForm({
  initialValues: Object.fromEntries(FIELDS.map((name, i) => [name, String(i)])),
  dependencies,
  validator: chainValidator,
})

function ChainField({ name }: { name: string }) {
  // Reuses the same @neutro/form-react hook the rest of this app's NeutroField
  // already uses (see App.tsx) -- no need to hand-roll useSyncExternalStore here.
  const value = useFormPath(form, name as any)
  return (
    <input
      data-testid={`neutro-field-${name}`}
      value={value as string}
      onChange={(e) => {
        if (name === 'f0') {
          form.set(name as any, e.target.value, { validate: true })
        } else {
          form.set(name as any, e.target.value)
        }
      }}
    />
  )
}

export function DependencyChainNeutroPage() {
  return (
    <section data-testid="neutro-chain-form">
      {FIELDS.map((name) => <ChainField key={name} name={name} />)}
    </section>
  )
}
```

- [ ] **Step 2: `DependencyChainRhf.tsx`**

```tsx
// bench/apps/react/src/DependencyChainRhf.tsx
import { useEffect } from 'react'
import { useForm, type UseFormReturn } from 'react-hook-form'

const FIELD_COUNT = 200
const FIELDS = Array.from({ length: FIELD_COUNT }, (_, i) => i)

const rhfChainValidations: Record<string, number> = {}
;(window as any).__rhfChainValidations = rhfChainValidations

function ChainField({ i, form }: { i: number; form: UseFormReturn<Record<string, string>> }) {
  const { register, trigger, getValues } = form
  const name = `f${i}`

  useEffect(() => {
    // Registers this field's validate rule to also cascade to the next field --
    // this is the forward-push trigger chain described in this plan's "Corrected
    // mechanism" section: watching the previous field's VALUE cannot work here,
    // since only f0's value ever changes. Instead, each field's own validate run
    // explicitly triggers the next field's validation.
  }, [])

  return (
    <input
      data-testid={`rhf-field-${name}`}
      {...register(name as any, {
        validate: (value: string) => {
          rhfChainValidations[name] = (rhfChainValidations[name] ?? 0) + 1
          if (i < FIELD_COUNT - 1) {
            void trigger(`f${i + 1}` as any)
          }
          if (i === 0) return true
          const prevValue = getValues(`f${i - 1}` as any)
          return value !== prevValue || 'must differ from previous field'
        },
      })}
    />
  )
}

export function DependencyChainRhfPage() {
  const form = useForm<Record<string, string>>({
    defaultValues: Object.fromEntries(FIELDS.map((i) => [`f${i}`, String(i)])),
    mode: 'onChange',
  })
  return (
    <section data-testid="rhf-chain-form">
      {FIELDS.map((i) => <ChainField key={i} i={i} form={form} />)}
    </section>
  )
}
```
**Note:** the `useEffect` in `ChainField` above is intentionally empty — it exists only so a future reader doesn't mistake the absence of a `watch()`-based effect for an oversight; delete it if `pnpm lint` flags it as a no-op (Biome may warn on an empty effect body — if so, remove the `useEffect` import and call entirely, since the actual cascade wiring lives inside `register`'s `validate` option, not in an effect). Verify during Step 5's manual check whether Biome complains; if it does, delete the empty effect rather than suppressing the lint rule.

- [ ] **Step 3: `DependencyChainTanStack.tsx`**

Before writing this file, confirm Task 1's Step 1 findings for the exact validator-callback and `validateField`/`getFieldValue` signatures. The code below assumes the shape found in the installed `@tanstack/react-form@1.33.0`/`@tanstack/form-core@1.33.0` — adjust field names if Task 1 found a different real shape.

```tsx
// bench/apps/react/src/DependencyChainTanStack.tsx
import { useForm } from '@tanstack/react-form'

const FIELD_COUNT = 200
const FIELDS = Array.from({ length: FIELD_COUNT }, (_, i) => i)

const tanstackChainValidations: Record<string, number> = {}
;(window as any).__tanstackChainValidations = tanstackChainValidations

export function DependencyChainTanStackPage() {
  const form = useForm({
    defaultValues: Object.fromEntries(FIELDS.map((i) => [`f${i}`, String(i)])),
  })
  return (
    <section data-testid="tanstack-chain-form">
      {FIELDS.map((i) => {
        const name = `f${i}`
        return (
          <form.Field
            key={i}
            name={name as any}
            validators={{
              // Pure -- returns only the differs-check result, no side effects.
              onChange: ({ value, fieldApi }: any) => {
                tanstackChainValidations[name] = (tanstackChainValidations[name] ?? 0) + 1
                if (i === 0) return undefined
                const prevValue = fieldApi.form.getFieldValue(`f${i - 1}`)
                return value !== prevValue ? undefined : 'must differ from previous field'
              },
            }}
            listeners={{
              // Found in plan review: firing the forward-push trigger from inside
              // validators.onChange would call validateField() synchronously and
              // re-entrantly, up to 199 levels deep, inside one keystroke's call
              // stack. TanStack Form's own `listeners` option exists specifically
              // for side effects like this, decoupled from the validation pipeline
              // -- confirmed against the installed @tanstack/form-core's FieldApi
              // type (Task 1's Step 1 should double check this against whatever
              // version is actually installed).
              onChange: ({ fieldApi }: any) => {
                if (i < FIELD_COUNT - 1) {
                  fieldApi.form.validateField(`f${i + 1}`, 'change')
                }
              },
            }}
          >
            {(field: any) => (
              <input
                data-testid={`tanstack-field-${name}`}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            )}
          </form.Field>
        )
      })}
    </section>
  )
}
```

- [ ] **Step 4: Wire the routing switch in `App.tsx`**

Add imports near the top of `App.tsx` (alongside the existing `SchemaValidate*` imports):
```ts
import { DependencyChainNeutroPage } from './DependencyChainNeutro.js'
import { DependencyChainRhfPage } from './DependencyChainRhf.js'
import { DependencyChainTanStackPage } from './DependencyChainTanStack.js'
```
Add a new branch to the `path`-switch inside `App()`, before the final fallback:
```tsx
if (path.startsWith('/dependency-chain/')) {
  const lib = path.slice('/dependency-chain/'.length)
  const pages: Record<string, () => React.ReactElement> = {
    neutro: () => <DependencyChainNeutroPage />,
    rhf: () => <DependencyChainRhfPage />,
    tanstack: () => <DependencyChainTanStackPage />,
  }
  return pages[lib]?.() ?? <div data-testid="not-found">Unknown: {lib}</div>
}
```
No `window.__resetRenders` extension is needed for these three counter objects — unlike the schema-validate surfaces (which support re-measuring within one page load), this surface's Playwright spec (Task 6) does one fresh `page.goto` per test, so each counter object starts empty from module re-init on every test. Document this as a deliberate simplification, not an oversight, in this task's commit message or report.

- [ ] **Step 5: Manual verification**

```bash
cd /Users/kofi/_/agw-form
pnpm --dir bench/apps/react run build
pnpm --dir bench/apps/react run preview &
```
Visit `http://localhost:4173/dependency-chain/neutro`, `/dependency-chain/rhf`, `/dependency-chain/tanstack`. Confirm each renders 200 inputs. Open the browser console and run:
```js
document.querySelector('[data-testid="neutro-field-f0"]').value = 'changed'
document.querySelector('[data-testid="neutro-field-f0"]').dispatchEvent(new Event('input', { bubbles: true }))
await new Promise(r => setTimeout(r, 200))
console.log(window.__neutroChainValidations.f199)
```
Expected: a number greater than 0 (confirms the cascade reached the last field) for all three routes (adjust the testid prefix per route: `rhf-field-f0`/`tanstack-field-f0`, and check `window.__rhfChainValidations.f199`/`window.__tanstackChainValidations.f199`). If any route shows `f199` still at `0`/`undefined` after this check, the forward-push chain isn't wiring correctly for that library — debug before proceeding to Task 6, since Task 6's spec will otherwise time out waiting for a cascade that never completes. Kill the preview server after checking.

- [ ] **Step 6: Commit**

```bash
git add bench/apps/react/src/DependencyChain*.tsx bench/apps/react/src/App.tsx
git commit -m "bench(dependency-chain): add React routes for neutro/rhf/tanstack"
```

---

### Task 3: Vue routes (neutro, vee-validate)

**Files:**
- Create: `bench/apps/vue/src/DependencyChainNeutro.vue`, `bench/apps/vue/src/ChainFieldVee.vue`, `bench/apps/vue/src/DependencyChainVee.vue`
- Modify: `bench/apps/vue/src/App.vue`

**Interfaces:**
- Produces: routes `/dependency-chain/neutro`, `/dependency-chain/vee`; same testid/counter conventions as Task 2.

- [ ] **Step 1: `DependencyChainNeutro.vue`**

```vue
<!-- bench/apps/vue/src/DependencyChainNeutro.vue -->
<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { createForm } from '@neutro/form-core'

const FIELD_COUNT = 200
const FIELDS = Array.from({ length: FIELD_COUNT }, (_, i) => `f${i}`)

const neutroChainValidations: Record<string, number> = {}
;(window as any).__neutroChainValidations = neutroChainValidations

const dependencies = Object.fromEntries(
  Array.from({ length: FIELD_COUNT - 1 }, (_, i) => [`f${i}`, [`f${i + 1}`]]),
)

function chainValidator(values: Record<string, string>, scope: string[]) {
  const errors: Record<string, string> = {}
  for (const path of scope) {
    neutroChainValidations[path] = (neutroChainValidations[path] ?? 0) + 1
    const i = Number(path.slice(1))
    if (i === 0) continue
    if (values[path] === values[`f${i - 1}`]) {
      errors[path] = 'must differ from previous field'
    }
  }
  return errors
}

const form = createForm({
  initialValues: Object.fromEntries(FIELDS.map((name, i) => [name, String(i)])),
  dependencies,
  validator: chainValidator,
})
const state = ref(form.getState())
const unsubscribe = form.subscribe((s) => { state.value = s })
onUnmounted(unsubscribe)

function onFieldInput(name: string, value: string) {
  if (name === 'f0') {
    form.set(name as any, value, { validate: true })
  } else {
    form.set(name as any, value)
  }
}
</script>

<template>
  <section data-testid="neutro-chain-form">
    <input
      v-for="name in FIELDS"
      :key="name"
      :data-testid="`neutro-field-${name}`"
      :value="state.values[name]"
      @input="onFieldInput(name, ($event.target as HTMLInputElement).value)"
    />
  </section>
</template>
```

- [ ] **Step 2: `ChainFieldVee.vue`**

This is a new, dedicated field component for the chain surface (distinct from the existing `VeeField.vue`, which is built for the plain re-renders/schema-validate demos and has no forward-push-trigger concept). Each field registers its own `validate` closure into a shared, page-level array so the previous field can call it directly — this is the concrete form of the forward-push chain for vee-validate, using `useField`'s own `validate()` return value as the "trigger the next field" primitive.

```vue
<!-- bench/apps/vue/src/ChainFieldVee.vue -->
<script setup lang="ts">
import { useField } from 'vee-validate'
import { onMounted } from 'vue'

const props = defineProps<{
  i: number
  name: string
  prevName: string | null
  chainTriggers: Array<(() => void) | undefined>
}>()

const rule = props.i === 0 ? undefined : (value: string) => {
  const counters = (window as any).__veeChainValidations
  counters[props.name] = (counters[props.name] ?? 0) + 1
  if (props.i < 199) {
    props.chainTriggers[props.i + 1]?.()
  }
  const prevValue = (window as any).__veeChainValues?.[props.prevName as string]
  return value !== prevValue || 'must differ from previous field'
}

const { value, validate } = useField<string>(props.name, rule, { validateOnValueUpdate: false })

onMounted(() => {
  props.chainTriggers[props.i] = () => { void validate() }
  const values = ((window as any).__veeChainValues ??= {})
  values[props.name] = value.value
})

// Deliberately NOT using v-model here (found in plan review): v-model attaches its
// own internal input-event listener via the vModelText directive, separate from a
// template @input handler on the same element -- whether the directive's listener
// (which updates `value`) or an explicit @input handler runs first on a given
// keystroke is unspecified ordering, not a documented Vue guarantee. Driving both
// `value` and the window map from ONE explicit handler removes that race entirely.
function onInput(e: Event) {
  const v = (e.target as HTMLInputElement).value
  value.value = v
  const values = ((window as any).__veeChainValues ??= {})
  values[props.name] = v
  if (props.i === 0) props.chainTriggers[1]?.()
}
</script>

<template>
  <input :data-testid="`vee-field-${name}`" :value="value" @input="onInput" />
</template>
```

- [ ] **Step 3: `DependencyChainVee.vue`**

```vue
<!-- bench/apps/vue/src/DependencyChainVee.vue -->
<script setup lang="ts">
import { useForm } from 'vee-validate'
import ChainFieldVee from './ChainFieldVee.vue'

const FIELD_COUNT = 200
const FIELDS = Array.from({ length: FIELD_COUNT }, (_, i) => i)

const veeChainValidations: Record<string, number> = {}
;(window as any).__veeChainValidations = veeChainValidations
;(window as any).__veeChainValues = Object.fromEntries(FIELDS.map((i) => [`f${i}`, String(i)]))

useForm({
  initialValues: Object.fromEntries(FIELDS.map((i) => [`f${i}`, String(i)])),
})

const chainTriggers: Array<(() => void) | undefined> = []
</script>

<template>
  <section data-testid="vee-chain-form">
    <ChainFieldVee
      v-for="i in FIELDS"
      :key="i"
      :i="i"
      :name="`f${i}`"
      :prev-name="i > 0 ? `f${i - 1}` : null"
      :chain-triggers="chainTriggers"
    />
  </section>
</template>
```
`f0`'s own `ChainFieldVee` instance (`i === 0`) has no `rule` (per the Global Constraints, `f0` has no validator) — its input is driven by the `onInput` handler defined in Step 2 above, which already checks `if (props.i === 0) props.chainTriggers[1]?.()` to kick off the cascade. No further template changes needed here.

- [ ] **Step 4: Wire the routing switch in `App.vue`**

Add imports and a new `v-else-if` branch, following the existing `/schema-validate/*` pattern:
```html
<DependencyChainNeutro v-else-if="path === '/dependency-chain/neutro'" />
<DependencyChainVee v-else-if="path === '/dependency-chain/vee'" />
```
placed among the existing `v-else-if` chain, before the final `v-else` re-renders page.

- [ ] **Step 5: Manual verification**

```bash
cd /Users/kofi/_/agw-form
pnpm --dir bench/apps/vue run build
pnpm --dir bench/apps/vue run preview &
```
Visit `http://localhost:4174/dependency-chain/neutro` and `/dependency-chain/vee`. Confirm 200 inputs render for each. In the browser console:
```js
document.querySelector('[data-testid="neutro-field-f0"]').value = 'changed'
document.querySelector('[data-testid="neutro-field-f0"]').dispatchEvent(new Event('input', { bubbles: true }))
await new Promise(r => setTimeout(r, 200))
console.log(window.__neutroChainValidations.f199)
```
Repeat for `/dependency-chain/vee` with `window.__veeChainValidations.f199`. Both should be greater than 0. If `vee`'s cascade doesn't reach `f199`, check that `chainTriggers[i+1]` is actually populated by the time field `i`'s rule runs — since `onMounted` runs in child-mount order matching the `v-for` order, all 200 `chainTriggers` entries should exist before any user interaction happens. Kill the preview server after checking.

- [ ] **Step 6: Commit**

```bash
git add bench/apps/vue/src/DependencyChain*.vue bench/apps/vue/src/ChainFieldVee.vue bench/apps/vue/src/App.vue
git commit -m "bench(dependency-chain): add Vue routes for neutro/vee-validate"
```

---

### Task 4: Svelte routes (neutro, tanstack-form)

**Files:**
- Create: `bench/apps/svelte/src/DependencyChainNeutro.svelte`, `bench/apps/svelte/src/DependencyChainTanStack.svelte`
- Modify: `bench/apps/svelte/src/App.svelte`

**Interfaces:**
- Produces: routes `/dependency-chain/neutro`, `/dependency-chain/tanstack`; same conventions as Tasks 2-3. No Felte route (per Global Constraints — N/A).

- [ ] **Step 1: `DependencyChainNeutro.svelte`**

```svelte
<!-- bench/apps/svelte/src/DependencyChainNeutro.svelte -->
<script lang="ts">
  import { createForm } from '@neutro/form-core'

  const FIELD_COUNT = 200
  const FIELDS = Array.from({ length: FIELD_COUNT }, (_, i) => `f${i}`)

  const neutroChainValidations: Record<string, number> = {}
  ;(window as any).__neutroChainValidations = neutroChainValidations

  const dependencies = Object.fromEntries(
    Array.from({ length: FIELD_COUNT - 1 }, (_, i) => [`f${i}`, [`f${i + 1}`]]),
  )

  function chainValidator(values: Record<string, string>, scope: string[]) {
    const errors: Record<string, string> = {}
    for (const path of scope) {
      neutroChainValidations[path] = (neutroChainValidations[path] ?? 0) + 1
      const i = Number(path.slice(1))
      if (i === 0) continue
      if (values[path] === values[`f${i - 1}`]) {
        errors[path] = 'must differ from previous field'
      }
    }
    return errors
  }

  const form = createForm({
    initialValues: Object.fromEntries(FIELDS.map((name, i) => [name, String(i)])),
    dependencies,
    validator: chainValidator,
  })
  let state = $state(form.getState())
  form.subscribe((s) => { state = s })

  function onFieldInput(name: string, value: string) {
    if (name === 'f0') {
      form.set(name as any, value, { validate: true })
    } else {
      form.set(name as any, value)
    }
  }
</script>

<section data-testid="neutro-chain-form">
  {#each FIELDS as name}
    <input
      data-testid={`neutro-field-${name}`}
      value={state.values[name]}
      oninput={(e) => onFieldInput(name, (e.target as HTMLInputElement).value)}
    />
  {/each}
</section>
```

- [ ] **Step 2: `DependencyChainTanStack.svelte`**

Same forward-push mechanism as Task 2 Step 3 (React TanStack), adapted to `@tanstack/svelte-form`'s snippet-based field API. Confirm Task 1's Step 1 findings apply identically to `@tanstack/svelte-form` (it shares `@tanstack/form-core` with the React adapter, so the validator/`validateField`/`getFieldValue` shapes should match) before writing this file.

```svelte
<!-- bench/apps/svelte/src/DependencyChainTanStack.svelte -->
<script lang="ts">
  import { createForm as createTsForm } from '@tanstack/svelte-form'

  const FIELD_COUNT = 200
  const FIELDS = Array.from({ length: FIELD_COUNT }, (_, i) => i)

  const tanstackChainValidations: Record<string, number> = {}
  ;(window as any).__tanstackChainValidations = tanstackChainValidations

  const form = createTsForm(() => ({
    defaultValues: Object.fromEntries(FIELDS.map((i) => [`f${i}`, String(i)])),
  }))
</script>

<section data-testid="tanstack-chain-form">
  {#each FIELDS as i}
    {@const name = `f${i}`}
    <form.Field
      {name}
      validators={{
        onChange: ({ value, fieldApi }) => {
          tanstackChainValidations[name] = (tanstackChainValidations[name] ?? 0) + 1
          if (i === 0) return undefined
          const prevValue = fieldApi.form.getFieldValue(`f${i - 1}`)
          return value !== prevValue ? undefined : 'must differ from previous field'
        },
      }}
      listeners={{
        // Same re-entrancy fix as the React DependencyChainTanStack.tsx above --
        // the forward-push trigger lives in listeners, not validators, so it
        // never nests inside another field's own synchronous validate call.
        onChange: ({ fieldApi }) => {
          if (i < FIELD_COUNT - 1) {
            fieldApi.form.validateField(`f${i + 1}`, 'change')
          }
        },
      }}
    >
      {#snippet children(field)}
        <input
          data-testid={`tanstack-field-${name}`}
          value={field.state.value}
          oninput={(e) => field.handleChange((e.target as HTMLInputElement).value)}
        />
      {/snippet}
    </form.Field>
  {/each}
</section>
```
**Note:** this `{@const name = ...}` binding is safe here (unlike the earlier-discovered bug in `SchemaValidateNeutro.svelte`'s history) because it's used only to compute a plain string for `data-testid`/counter-key purposes, not to drive re-render-triggering reactivity — the actual per-render counting for this surface lives in the `chainValidator`/`onChange` validator functions above, which run on real validation events, not on Svelte's own render cycle.

- [ ] **Step 3: Wire the routing in `App.svelte`**

Add imports at the top of `App.svelte`'s `<script>` block and new `{:else if}` branches:
```svelte
{:else if path === '/dependency-chain/neutro'}
  <DependencyChainNeutro />
{:else if path === '/dependency-chain/tanstack'}
  <DependencyChainTanStack />
```
placed before the final `{:else}` re-renders block, with `import DependencyChainNeutro from './DependencyChainNeutro.svelte'` and `import DependencyChainTanStack from './DependencyChainTanStack.svelte'` added alongside the existing imports.

- [ ] **Step 4: Manual verification**

```bash
cd /Users/kofi/_/agw-form
pnpm --dir bench/apps/svelte run build
pnpm --dir bench/apps/svelte run preview &
```
Visit `http://localhost:4175/dependency-chain/neutro` and `/dependency-chain/tanstack`. Same browser-console check as Tasks 2-3 (`window.__neutroChainValidations.f199` / `window.__tanstackChainValidations.f199` both `> 0` after typing into `f0`). Kill the preview server after checking.

- [ ] **Step 5: Commit**

```bash
git add bench/apps/svelte/src/DependencyChain*.svelte bench/apps/svelte/src/App.svelte
git commit -m "bench(dependency-chain): add Svelte routes for neutro/tanstack"
```

---

### Task 5: Reporting pipeline — widen `BrowserResult`, extend `browserTable()`, add `SURFACE_TITLES` + annotations

**Files:**
- Modify: `bench/types/schema.ts` (`BrowserResult`)
- Modify: `bench/scripts/generate-page.ts` (`SURFACE_TITLES`, `browserTable`)
- Modify: `bench/annotations.ts` (`ANNOTATIONS`)

**Interfaces:**
- Produces: `BrowserResult.settleLatencyMs?: number`; `browserTable()` renders a `Settle latency` column when any result has `settleLatencyMs != null`.

- [ ] **Step 1: Widen `BrowserResult`**

In `bench/types/schema.ts`'s `BrowserResult` interface, `submitLatencyMs?: number` already exists (added by the prior schema-validate-comparison plan) — **do not re-add it**. Add exactly one new line directly after it:
```ts
settleLatencyMs?: number              // dependency-chain-settle surface: ms from f0 change to f199's validator re-running
```

- [ ] **Step 2: Add the `SURFACE_TITLES` entry**

In `bench/scripts/generate-page.ts`, add to the existing `SURFACE_TITLES` object:
```ts
  'dependency-chain-settle': 'Dependency Chain — Settle Latency (200-field validation cascade)',
```

- [ ] **Step 3: Add the `settleLatencyMs` column to `browserTable()`**

In `bench/scripts/generate-page.ts`'s `browserTable()` function, add a new `hasSettleLatency` flag and column, following the exact pattern already used for `hasSubmitLatency`/`submitLatencyMs`:
```ts
  const hasSettleLatency = results.some(r => r.settleLatencyMs != null)
  // ... alongside the existing `if (hasSubmitLatency) headers.push('Submit latency')`:
  if (hasSettleLatency) headers.push('Settle latency')
  // ... alongside the existing submitLatencyMs cell push, inside the per-row map:
  if (hasSettleLatency) cells.push(r.settleLatencyMs != null ? `${r.settleLatencyMs.toFixed(1)}ms${reasonMarker(surface, r.library)}` : '—')
```
The existing `r.status === 'na'` early-return branch (added in the schema-validate-comparison plan) already fills every non-Library column generically for N/A rows — no further change needed there.

- [ ] **Step 4: Add Formik/Felte N/A annotations and the measurement-bias caveat**

In `bench/annotations.ts`'s `ANNOTATIONS` object, add:
```ts
  'dependency-chain-settle': {
    formik: {
      brief: 'no per-field watch/subscribe primitive',
      detail: 'Formik has no live field-to-field subscription API to drive a manual validation cascade of this shape — excluded from this comparison. Formik participates fully in every other browser surface.',
    },
    felte: {
      brief: 'no per-field watch/subscribe primitive',
      detail: 'Felte has no field-level watch API to drive a manual validation cascade of this shape — excluded from this comparison. Felte participates fully in every other browser surface.',
    },
    'neutro/form (React)': {
      brief: 'measurement floor, not an exact figure',
      detail: 'This surface’s settle-latency measurement is bounded below by Playwright’s waitForFunction polling granularity, not by real cascade cost — for very fast libraries the reported number reflects polling overhead more than actual work. Treat the gap between neutro and the manual-wiring competitors as a floor on the true gap, not an exact figure.',
    },
    'neutro/form (Vue)': {
      brief: 'measurement floor, not an exact figure',
      detail: 'This surface’s settle-latency measurement is bounded below by Playwright’s waitForFunction polling granularity, not by real cascade cost — for very fast libraries the reported number reflects polling overhead more than actual work. Treat the gap between neutro and the manual-wiring competitors as a floor on the true gap, not an exact figure.',
    },
    'neutro/form (Svelte)': {
      brief: 'measurement floor, not an exact figure',
      detail: 'This surface’s settle-latency measurement is bounded below by Playwright’s waitForFunction polling granularity, not by real cascade cost — for very fast libraries the reported number reflects polling overhead more than actual work. Treat the gap between neutro and the manual-wiring competitors as a floor on the true gap, not an exact figure.',
    },
  },
```
Check `reasonMarker`'s/`ANNOTATIONS`' actual TypeScript shape in `bench/annotations.ts` before pasting this — the existing entries use a `brief`/`detail` pair keyed by library name; the three `neutro/form (...)` entries above are annotating an `status: 'ok'` row (not an N/A row), so confirm `reasonMarker(surface, library)` actually renders a footnote marker for `ok`-status rows too (check its call sites in `browserTable()` — the `settleLatencyMs` cell push above already calls `reasonMarker` unconditionally, so this should Just Work, but verify by reading `reasonMarker`'s implementation, not assuming).

- [ ] **Step 5: Type-check `bench/`'s own scripts/suites (does NOT cover the new app components — see note)**

```bash
cd /Users/kofi/_/agw-form/bench
pnpm exec tsc --noEmit
```
Expected: clean, matching the pre-existing noise pattern already documented in the item-3 plan's Task 5 (missing `@types/node` errors in unrelated files) — confirm via `git stash` + re-run that no *new* errors appear, same technique used previously.

**Disclosed gap (found in plan review): this command provides zero type-checking for Tasks 2-4's new files.** `bench/tsconfig.json`'s `exclude` list includes `"apps"`, so this `tsc --noEmit` run never includes anything under `bench/apps/*/src/`. None of the three bench apps wire a type-check script either (`vue-tsc`/`svelte-check` are installed as devDependencies in the Vue/Svelte apps but never invoked by any package.json script; the React app has no type-check tooling at all). This is a known, pre-existing gap in this repo's bench tooling, not something this plan is responsible for fixing — the only real safety net for Tasks 2-4's code is `vite build` succeeding (which only proves esbuild could strip the types, not that they're correct) plus each task's manual browser-console verification step actually exercising the cascade. Do not read a green `tsc --noEmit` here as having validated the new `.tsx`/`.vue`/`.svelte` files' types — it hasn't. Flag this to the user in Task 7's final summary as a known gap, same as the other disclosed deviations in this plan.

- [ ] **Step 6: Commit**

```bash
git add bench/types/schema.ts bench/scripts/generate-page.ts bench/annotations.ts
git commit -m "bench(dependency-chain): widen BrowserResult, add settle-latency column and annotations"
```

---

### Task 6: `dependency-chain-settle.spec.ts`

**Files:**
- Create: `bench/suites/browser/dependency-chain-settle.spec.ts`

**Interfaces:**
- Consumes: routes from Tasks 2-4, each visited once per test via `page.goto` (no reset needed — see Task 2 Step 4's note).

- [ ] **Step 1: Write the spec file**

```ts
// bench/suites/browser/dependency-chain-settle.spec.ts
import { test, expect, type Page, type TestInfo } from '@playwright/test'
import type { BrowserResult } from '../../types/schema.js'

async function measureSettleLatency(page: Page, prefix: string, chainKey: string): Promise<number> {
  await page.evaluate(() => performance.mark('chain-start'))
  await page.getByTestId(`${prefix}-field-f0`).fill('changed')
  await page.waitForFunction(
    ([key]) => {
      const counters = (window as any)[key]
      if (!counters || !((counters.f199 ?? 0) > 0)) return false
      performance.mark('chain-end')
      performance.measure('chain-settle', 'chain-start', 'chain-end')
      return true
    },
    [chainKey],
    { timeout: 25000 },
  )
  return page.evaluate(() => {
    const [entry] = performance.getEntriesByName('chain-settle')
    return entry.duration
  })
}

async function attach(testInfo: TestInfo, library: string, settleLatencyMs: number) {
  const result: BrowserResult = { library, status: 'ok', settleLatencyMs }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
}

async function attachNA(testInfo: TestInfo, library: string) {
  const result: BrowserResult = { library, status: 'na' }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
}

const COMBOS: Array<{ name: string; port: number; prefix: string; key: string; library: string }> = [
  { name: 'neutro/form (React)',   port: 4173, prefix: 'neutro', key: '__neutroChainValidations',   library: 'neutro/form (React)' },
  { name: 'react-hook-form',       port: 4173, prefix: 'rhf',    key: '__rhfChainValidations',      library: 'react-hook-form' },
  { name: 'tanstack-form (React)', port: 4173, prefix: 'tanstack', key: '__tanstackChainValidations', library: 'tanstack-form (React)' },
  { name: 'neutro/form (Vue)',     port: 4174, prefix: 'neutro', key: '__neutroChainValidations',   library: 'neutro/form (Vue)' },
  { name: 'vee-validate',          port: 4174, prefix: 'vee',    key: '__veeChainValidations',      library: 'vee-validate' },
  { name: 'neutro/form (Svelte)',  port: 4175, prefix: 'neutro', key: '__neutroChainValidations',   library: 'neutro/form (Svelte)' },
  { name: 'tanstack-form (Svelte)', port: 4175, prefix: 'tanstack', key: '__tanstackChainValidations', library: 'tanstack-form (Svelte)' },
]

test.describe('dependency-chain-settle', () => {
  test.slow() // 200-field cascades are a heavier workload than any existing browser surface -- see this plan's Global Constraints

  for (const c of COMBOS) {
    test(c.name, async ({ page }, testInfo) => {
      await page.goto(`http://localhost:${c.port}/dependency-chain/${c.prefix}`)
      const settleLatencyMs = await measureSettleLatency(page, c.prefix, c.key)
      await attach(testInfo, c.library, settleLatencyMs)
      expect(settleLatencyMs).toBeGreaterThanOrEqual(0)
    })
  }

  test('formik', async ({}, testInfo) => {
    await attachNA(testInfo, 'formik')
  })

  test('felte', async ({}, testInfo) => {
    await attachNA(testInfo, 'felte')
  })
})
```
`test.slow()` triples Playwright's default per-test timeout (per Playwright's own documented behavior) — this satisfies the spec's mandatory timeout-bump requirement without hardcoding a specific millisecond value; `measureSettleLatency`'s own `waitForFunction` additionally takes an explicit `{ timeout: 25000 }` so a genuinely-hung cascade fails with a clear "waitForFunction timeout" error rather than being masked by the outer test timeout firing first.

- [ ] **Step 2: Run once, observe real numbers**

```bash
cd /Users/kofi/_/agw-form/bench
pnpm exec playwright test suites/browser/dependency-chain-settle.spec.ts --reporter=list
```
Expected: all 9 tests (7 real libraries + Formik + Felte N/A) pass. Read the actual `settleLatencyMs` each test produces (via `page.evaluate` logging added temporarily, or by reading the test's attached result). Per the spec's measurement-bias caveat, do not be surprised if neutro's numbers across all 3 frameworks cluster close together and close to Playwright's polling floor (a handful of milliseconds) — that is the expected, disclosed behavior, not a bug. If any test times out waiting for `f199`'s counter to increment, that library's forward-push chain from Tasks 2-4 isn't wiring correctly — go back and debug via the browser-console check described in those tasks' Step 5/manual-verification steps, rather than loosening the assertion or the timeout further.

- [ ] **Step 3: Commit**

```bash
git add bench/suites/browser/dependency-chain-settle.spec.ts
git commit -m "bench(dependency-chain): add settle-latency Playwright spec"
```

---

### Task 7: Full pipeline run, page regeneration, and release-gate memory update

**Files:** none (verification + memory update only, unless the full run surfaces a bug).

- [ ] **Step 1: Run the full bench pipeline**

```bash
cd /Users/kofi/_/agw-form
pnpm --dir bench run bench:apps:build bench:core bench:correctness bench:browser bench:bundle-size bench:merge
cp bench/results/latest.json bench/results/baseline.json
pnpm --dir bench run bench:generate
```

- [ ] **Step 2: Inspect the regenerated page**

```bash
grep -A 12 "Dependency Chain" docs/benchmarks/index.md
```
Confirm the new surface appears with real per-library numbers, Formik and Felte both show `— N/A` with their footnote reasons actually rendered (not just present in source), and the surface does not appear in the Scorecard summary table. Sanity-check the numbers: neutro's three rows should be low and close together (near the polling floor, per the disclosed measurement-bias caveat); RHF/vee-validate/TanStack should be meaningfully higher (real per-hop trigger/validation cost across 199 hops) — if a competitor's number comes back suspiciously close to neutro's or suspiciously at `0`, treat it as a probable wiring bug (the forward-push chain not actually reaching `f199`, or reaching it in one jump instead of cascading) rather than a surprising-but-real result, and go back to the relevant Task 2-4 route to debug via the browser-console check before trusting the number.

- [ ] **Step 3: Fix any issues found, re-run Step 1**

If Step 2 finds a gap, fix it and re-run the full pipeline until Step 2's checks all pass.

- [ ] **Step 4: Full monorepo pipeline sweep**

```bash
pnpm lint && pnpm exec tsc --noEmit && pnpm build && pnpm test
```
Expected: all green (this work is bench-only, so the core monorepo pipeline should be entirely unaffected, but confirm rather than assume).

- [ ] **Step 5: Update release-gate memory, including both disclosed deviations**

Update the project memory `project_v050_release_gate`, marking item 4 (browser dependency-chain comparison) as RESOLVED, following the same format used for items 1, 2, 3, and 7: summary of what was added, the settle-latency metric and its measurement-bias caveat, Formik/Felte's N/A treatment, any real findings about neutro's relative performance, **the forward-push-trigger-chain correction discovered while writing this plan** (documented at the top of this plan file — why "watch the previous field's value" couldn't work under this spec's validation-only semantics, and what was used instead), **the pre-existing `bench/fixtures/dependency-chain.ts` direction bug flagged in Task 1** (a real, unfixed bug in a sibling core benchmark, out of this plan's scope — worth a follow-up), **the disclosed `tsc --noEmit` coverage gap from Task 5** (bench's tsconfig excludes `apps/`, so the new route components have no compile-time type-checking safety net, only `vite build` + manual verification), and confirmation of local-main-unpushed status unless the user has since said otherwise.
