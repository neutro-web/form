# Browser-Level Schema-Validate Competitor Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real, browser-render-context Zod schema-validation comparisons between neutro/form and react-hook-form/tanstack-form/vee-validate/felte (Formik explicitly N/A), across two new metrics — re-render count and submit-validation latency — feeding the existing bench reporting pipeline.

**Architecture:** One new isolated route per included library per app (React/Vue/Svelte bench apps), each a small dedicated component wired to that library's real Zod integration. Two new Playwright spec files drive these routes and report `renderCount`/`submitLatencyMs` through the existing `BrowserResult` → `browser.json` → `generate-page.ts` pipeline, which needs three small, explicit extensions (type widening, a new table-rendering branch, a status-aware N/A branch) — not the zero-change pipeline an earlier spec draft wrongly assumed.

**Tech Stack:** Playwright (`bench/suites/browser/`), React/Vue/Svelte bench apps (`bench/apps/*`), Zod + `@hookform/resolvers`/`@vee-validate/zod`/`@felte/validator-zod`/TanStack's Standard Schema support.

## Global Constraints

- **Zod schema shape** (from `bench/fixtures/schema-zod.ts`'s `zodSmallSchema`): `z.object({ field0: z.string().min(1), ..., field9: z.string().min(1) })` — 10 fields, reused across every library's route.
- **Initial values**: all 10 fields start as `''` (empty string) — the reused Node fixture's `initialValues` (`'x'` per field) must NOT be copied; this spec needs the form invalid from mount.
- **No Formik+Zod real measurement** — Formik gets an explicit `{ library: 'formik', status: 'na' }` `BrowserResult` row in both new spec files, via a distinct code path (no route, no navigation), not a normal `COMBOS`-loop iteration.
- **No TanStack Zod adapter package** — TanStack Form v1 uses Standard Schema: pass the `zodSmallSchema` object directly into `validators: { onChange: schema }` / `{ onSubmit: schema }`, no extra package beyond `zod` itself.
- **Isolated routes only** — each library's schema-validate route mounts exactly one library, never co-mounted with others (unlike the existing `/` re-renders page).
- **No Scorecard summary row for this surface** — appears only in the per-surface Browser detail tables (the dynamic `browserSurfaces` loop in `generate-page.ts`), not in `scorecard.ts`'s hardcoded `BROWSER_NUMERIC_SURFACES` array.
- **Loose sanity-bound assertions, not tight thresholds** — `toBeLessThanOrEqual` limits must be set empirically (run once, observe, set comfortably above), since there is no inheritable derivation methodology from the existing `re-renders.spec.ts` limits.
- Full spec: `docs/superpowers/specs/2026-07-09-browser-schema-validate-comparison-design.md`.

---

## File Structure

| File | Responsibility |
|---|---|
| `bench/apps/react/package.json`, `bench/apps/vue/package.json`, `bench/apps/svelte/package.json` | Add `zod` + each library's real Zod-integration package. |
| `bench/apps/react/src/SchemaValidate*.tsx` (new, one per library: Neutro/Rhf/TanStack) | React schema-validate route components. |
| `bench/apps/vue/src/SchemaValidate*.vue` (new: Neutro/Vee) | Vue schema-validate route components. |
| `bench/apps/svelte/src/SchemaValidate*.svelte` (new: Neutro/TanStack/Felte) | Svelte schema-validate route components. |
| `bench/apps/react/src/App.tsx`, `bench/apps/vue/src/App.vue`, `bench/apps/svelte/src/App.svelte` | Add `/schema-validate/*` routing branches. |
| `bench/types/schema.ts` | Add `submitLatencyMs?: number` to `BrowserResult`. |
| `bench/scripts/generate-page.ts` | Add `submitLatencyMs` table column + a status-aware N/A branch in `browserTable()`; add 2 `SURFACE_TITLES` entries. |
| `bench/annotations.ts` | Add Formik N/A reason for both new surfaces; add resolver-package versions to `COMPETITOR_VERSIONS`. |
| `bench/suites/browser/schema-validate-rerenders.spec.ts` (new) | Re-render-count Playwright spec. |
| `bench/suites/browser/schema-validate-submit.spec.ts` (new) | Submit-latency Playwright spec. |

---

### Task 1: Install dependencies, add the shared Zod schema, pin versions

**Files:**
- Modify: `bench/apps/react/package.json`, `bench/apps/vue/package.json`, `bench/apps/svelte/package.json`
- Create: `bench/apps/react/src/schemaValidateSchema.ts`, `bench/apps/vue/src/schemaValidateSchema.ts`, `bench/apps/svelte/src/schemaValidateSchema.ts` (same content in all three — each app installs independently, no shared workspace import between apps)
- Modify: `bench/annotations.ts`

**Interfaces:**
- Produces: `zodSmallSchema` (a `z.ZodObject`), exported from each app's own `schemaValidateSchema.ts`, consumed by every route component in Tasks 2-4.

- [ ] **Step 1: Add `zod` and each library's real Zod-integration package to the three app `package.json` files**

In `bench/apps/react/package.json`'s `dependencies`, add (pin exact versions found compatible during this step — do not install "latest" blindly):
```json
"zod": "^3.24.0",
"@hookform/resolvers": "^3.9.0"
```
`@hookform/resolvers` version note: verify during this step that the installed major's `zodResolver` export signature works with `zod@^3.24.0` (smoke-test in Step 5) — if `^3.9.0` proves incompatible, this is the one pairing flagged by the spec as needing real verification, not a rubber-stamp.

In `bench/apps/vue/package.json`'s `dependencies`, add:
```json
"zod": "^3.24.0",
"@vee-validate/zod": "^4.13.2"
```

In `bench/apps/svelte/package.json`'s `dependencies`, add:
```json
"zod": "^3.24.0",
"@felte/validator-zod": "^1.3.0"
```
(TanStack Form needs no extra package — `zod` alone is sufficient, per the Standard Schema constraint above.)

- [ ] **Step 2: Install**

```bash
cd /Users/kofi/_/agw-form
pnpm --dir bench/apps/react install --ignore-workspace
pnpm --dir bench/apps/vue install --ignore-workspace
pnpm --dir bench/apps/svelte install --ignore-workspace
```
Expected: all three succeed with no peer-dependency errors. If `@hookform/resolvers@^3.9.0` reports a peer-dependency conflict against the pinned `react-hook-form` version, try the next minor/major and re-pin — do not proceed past this step with an install that only succeeded via `--force`/`--legacy-peer-deps` without noting it as a risk in this task's report.

- [ ] **Step 3: Create the shared schema file (identical content in all three apps)**

```ts
// bench/apps/react/src/schemaValidateSchema.ts
// (same content in bench/apps/vue/src/schemaValidateSchema.ts and
//  bench/apps/svelte/src/schemaValidateSchema.ts — each app installs zod
//  independently, so this is duplicated per app, not shared via import)
import { z } from 'zod'

export const zodSmallSchema = z.object(
  Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`field${i}`, z.string().min(1)]))
)

export const FIELD_COUNT = 10
export const FIELDS = Array.from({ length: FIELD_COUNT }, (_, i) => `field${i}`)
export const initialValues = Object.fromEntries(FIELDS.map((n) => [n, '']))
```
Copy this exact file to all three app `src/` directories, adjusting nothing.

- [ ] **Step 4: Add resolver-package versions to `bench/annotations.ts`'s `COMPETITOR_VERSIONS`**

Read the current `COMPETITOR_VERSIONS` block (near the top of `bench/annotations.ts`) and add, immediately after the existing entries:
```ts
  '@hookform/resolvers': '3.9.0',       // update to match Step 1's actually-installed version
  '@vee-validate/zod': '4.13.2',        // update to match Step 1's actually-installed version
  '@felte/validator-zod': '1.3.0',      // update to match Step 1's actually-installed version
```
(Use whatever exact versions actually resolved in Step 2's lockfiles, not necessarily the pins written in Step 1 if a range moved during install.)

- [ ] **Step 5: Smoke-test the RHF+Zod pairing specifically**

Before building any full component, write a throwaway one-off check (not committed) confirming `zodResolver` from the installed `@hookform/resolvers` works against `zodSmallSchema`:
```ts
// scratch, do not commit — e.g. run via `pnpm --dir bench/apps/react exec tsx -e "..."`
import { zodResolver } from '@hookform/resolvers/zod'
import { zodSmallSchema } from './src/schemaValidateSchema.js'
const resolver = zodResolver(zodSmallSchema)
resolver({ field0: '' }, {}, { fields: {}, shouldUseNativeValidation: false }).then(console.log)
```
Expected: resolves to an object with `values: {}` and `errors.field0` present (a validation error for the empty required field) — confirms the resolver's call signature matches this zod version. If this throws a type or runtime error, the version pin from Step 1 needs adjusting before proceeding to Task 2.

- [ ] **Step 6: Commit**

```bash
git add bench/apps/react/package.json bench/apps/react/pnpm-lock.yaml bench/apps/react/src/schemaValidateSchema.ts \
        bench/apps/vue/package.json bench/apps/vue/pnpm-lock.yaml bench/apps/vue/src/schemaValidateSchema.ts \
        bench/apps/svelte/package.json bench/apps/svelte/pnpm-lock.yaml bench/apps/svelte/src/schemaValidateSchema.ts \
        bench/annotations.ts
git commit -m "bench(schema-validate): install zod + resolver packages, add shared schema fixture"
```

---

### Task 2: React schema-validate routes (neutro, react-hook-form, tanstack-form)

**Files:**
- Create: `bench/apps/react/src/SchemaValidateNeutro.tsx`, `bench/apps/react/src/SchemaValidateRhf.tsx`, `bench/apps/react/src/SchemaValidateTanStack.tsx`
- Modify: `bench/apps/react/src/App.tsx`

**Interfaces:**
- Consumes: `zodSmallSchema`, `FIELDS`, `initialValues` from `./schemaValidateSchema.js` (Task 1).
- Produces: routes `/schema-validate/neutro`, `/schema-validate/rhf`, `/schema-validate/tanstack`; each component renders `data-testid="{prefix}-field{i}"` inputs, a `data-testid="{prefix}-submit"` button, and a `data-testid="{prefix}-error"` region visible exactly when `field0`'s error is present; each increments its own render counter (`window.__neutroSchemaRenders`/`__rhfSchemaRenders`/`__tanstackSchemaRenders`) on every field re-render, reset via an extended `window.__resetRenders`.

- [ ] **Step 1: `SchemaValidateNeutro.tsx`**

```tsx
// bench/apps/react/src/SchemaValidateNeutro.tsx
import { useSyncExternalStore } from 'react'
import { createForm } from '@neutro/form-core'
import { zodAdapter } from '@neutro/form-core'
import { zodSmallSchema, FIELDS, initialValues } from './schemaValidateSchema.js'

const neutroSchemaRenders: Record<string, number> = {}
;(window as any).__neutroSchemaRenders = neutroSchemaRenders

const form = createForm({
  initialValues,
  validator: zodAdapter(zodSmallSchema),
})

function Field({ name }: { name: string }) {
  neutroSchemaRenders[name] = (neutroSchemaRenders[name] ?? 0) + 1
  const value = useSyncExternalStore(
    (cb) => form.subscribeToPath(name as any, cb),
    () => form.get(name as any),
  )
  return (
    <input
      data-testid={`neutro-${name}`}
      value={value as string}
      onChange={(e) => form.set(name as any, e.target.value)}
    />
  )
}

export function SchemaValidateNeutroPage() {
  const state = useSyncExternalStore((cb) => form.subscribe(cb), () => form.getState())
  return (
    <section data-testid="neutro-schema-form">
      {FIELDS.map((name) => <Field key={name} name={name} />)}
      <button
        data-testid="neutro-submit"
        onClick={() => form.validate()}
      >
        Submit
      </button>
      <div data-testid="neutro-error" style={{ display: state.errors.field0 ? 'block' : 'none' }}>
        {state.errors.field0}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: `SchemaValidateRhf.tsx`**

```tsx
// bench/apps/react/src/SchemaValidateRhf.tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { zodSmallSchema, FIELDS, initialValues } from './schemaValidateSchema.js'

const rhfSchemaRenders: Record<string, number> = {}
;(window as any).__rhfSchemaRenders = rhfSchemaRenders

export function SchemaValidateRhfPage() {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: initialValues,
    resolver: zodResolver(zodSmallSchema),
    mode: 'onSubmit', // validate on submit only -- matches the submit-latency spec's intent;
                       // the re-render spec explicitly re-registers with mode: 'onChange' instead,
                       // see Task 6/7's per-spec mode note
  })
  for (const name of FIELDS) rhfSchemaRenders[name] = (rhfSchemaRenders[name] ?? 0) + 1
  return (
    <section data-testid="rhf-schema-form">
      {FIELDS.map((name) => (
        <input key={name} data-testid={`rhf-${name}`} {...register(name as any)} />
      ))}
      <button data-testid="rhf-submit" onClick={handleSubmit(() => {})}>
        Submit
      </button>
      <div data-testid="rhf-error" style={{ display: (errors as any).field0 ? 'block' : 'none' }}>
        {(errors as any).field0?.message}
      </div>
    </section>
  )
}
```
**Note for Task 6/7 (flagging now, resolved there):** RHF's `mode` option is fixed at `useForm()` call time — the re-render spec needs `mode: 'onChange'` to trigger per-keystroke validation, while the submit-latency spec needs `mode: 'onSubmit'` (as written above) to isolate submit-time cost. This means `schema-validate-rerenders.spec.ts` and `schema-validate-submit.spec.ts` cannot share one RHF page instance with a single hardcoded mode — Task 6 must read a query param (e.g. `?mode=onChange`) to pick the mode, rather than hardcoding `onSubmit` as shown above. Revise this component in Task 6's Step 1 to accept the mode via `new URLSearchParams(window.location.search).get('mode') ?? 'onSubmit'`.

- [ ] **Step 3: `SchemaValidateTanStack.tsx`**

```tsx
// bench/apps/react/src/SchemaValidateTanStack.tsx
import { useForm } from '@tanstack/react-form'
import { zodSmallSchema, FIELDS, initialValues } from './schemaValidateSchema.js'

const tanstackSchemaRenders: Record<string, number> = {}
;(window as any).__tanstackSchemaRenders = tanstackSchemaRenders

export function SchemaValidateTanStackPage() {
  const mode = new URLSearchParams(window.location.search).get('mode') ?? 'onSubmit'
  const form = useForm({
    defaultValues: initialValues,
    validators: mode === 'onChange' ? { onChange: zodSmallSchema } : { onSubmit: zodSmallSchema },
  })
  return (
    <form.Field name="field0">
      {(field0) => {
        tanstackSchemaRenders.field0 = (tanstackSchemaRenders.field0 ?? 0) + 1
        return (
          <section data-testid="tanstack-schema-form">
            {FIELDS.map((name) => (
              <form.Field key={name} name={name as any}>
                {(f) => (
                  <input
                    data-testid={`tanstack-${name}`}
                    value={f.state.value as string}
                    onChange={(e) => f.handleChange(e.target.value)}
                  />
                )}
              </form.Field>
            ))}
            <button data-testid="tanstack-submit" onClick={() => form.handleSubmit()}>
              Submit
            </button>
            <div data-testid="tanstack-error" style={{ display: field0.state.meta.errors.length ? 'block' : 'none' }}>
              {field0.state.meta.errors[0]}
            </div>
          </section>
        )
      }}
    </form.Field>
  )
}
```

- [ ] **Step 4: Extend `window.__resetRenders` and wire the routing switch in `App.tsx`**

Read the current `window.__resetRenders` definition (near the top of `App.tsx`, the `for (const k in neutroRenders) neutroRenders[k] = 0` block) and add the three new counter objects to it:
```ts
window.__resetRenders = () => {
  for (const k in neutroRenders) neutroRenders[k] = 0
  for (const k in rhfRenders) rhfRenders[k] = 0
  for (const k in formikRenders) formikRenders[k] = 0
  for (const k in tanstackRenders) tanstackRenders[k] = 0
  for (const k in neutroSchemaRenders) neutroSchemaRenders[k] = 0
  for (const k in rhfSchemaRenders) rhfSchemaRenders[k] = 0
  for (const k in tanstackSchemaRenders) tanstackSchemaRenders[k] = 0
}
```
(This requires importing the three new module-level counter objects at the top of `App.tsx`, or re-exporting `resetSchemaRenders`-style helper functions from each new component file and calling them here — either works; pick whichever keeps `App.tsx`'s existing counter-declaration style consistent.)

Add a new branch to the `path`-switch in `App()`, following the existing `/async/`/`/cancel/` pattern:
```tsx
if (path.startsWith('/schema-validate/')) {
  const lib = path.slice('/schema-validate/'.length)
  const pages: Record<string, () => React.ReactElement> = {
    neutro: () => <SchemaValidateNeutroPage />,
    rhf: () => <SchemaValidateRhfPage />,
    tanstack: () => <SchemaValidateTanStackPage />,
  }
  return pages[lib]?.() ?? <div data-testid="not-found">Unknown: {lib}</div>
}
```
Add the corresponding imports at the top of `App.tsx`:
```ts
import { SchemaValidateNeutroPage } from './SchemaValidateNeutro.js'
import { SchemaValidateRhfPage } from './SchemaValidateRhf.js'
import { SchemaValidateTanStackPage } from './SchemaValidateTanStack.js'
```

- [ ] **Step 5: Manual verification**

```bash
cd /Users/kofi/_/agw-form
pnpm --dir bench/apps/react run build
pnpm --dir bench/apps/react run preview &
```
Visit `http://localhost:4173/schema-validate/neutro`, `/schema-validate/rhf`, `/schema-validate/tanstack` in a browser (or via `curl`/Playwright's own trace tools if no display is available) — confirm each renders 10 inputs and a submit button, and clicking submit with empty fields shows the error region. Kill the preview server after checking.

- [ ] **Step 6: Commit**

```bash
git add bench/apps/react/src/SchemaValidate*.tsx bench/apps/react/src/App.tsx
git commit -m "bench(schema-validate): add React routes for neutro/rhf/tanstack"
```

---

### Task 3: Vue schema-validate routes (neutro, vee-validate)

**Files:**
- Create: `bench/apps/vue/src/SchemaValidateNeutro.vue`, `bench/apps/vue/src/SchemaValidateVee.vue`
- Modify: `bench/apps/vue/src/App.vue`

**Interfaces:**
- Consumes: `zodSmallSchema`, `FIELDS`, `initialValues` from `./schemaValidateSchema.js` (Task 1).
- Produces: routes `/schema-validate/neutro`, `/schema-validate/vee`; same testid/counter conventions as Task 2 (`neutro-schema-form`/`vee-schema-form`, `{prefix}-field{i}`, `{prefix}-submit`, `{prefix}-error`, `window.__neutroSchemaRenders`/`__veeSchemaRenders`).

- [ ] **Step 1: `SchemaValidateNeutro.vue`**

```vue
<!-- bench/apps/vue/src/SchemaValidateNeutro.vue -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { createForm, zodAdapter } from '@neutro/form-core'
import { zodSmallSchema, FIELDS, initialValues } from './schemaValidateSchema.js'

const neutroSchemaRenders: Record<string, number> = {}
;(window as any).__neutroSchemaRenders = neutroSchemaRenders

const form = createForm({ initialValues, validator: zodAdapter(zodSmallSchema) })
const state = ref(form.getState())
const unsubscribe = form.subscribe((s) => { state.value = s })
onUnmounted(unsubscribe)

function onInput(name: string, value: string) {
  neutroSchemaRenders[name] = (neutroSchemaRenders[name] ?? 0) + 1
  form.set(name as any, value)
}
</script>

<template>
  <section data-testid="neutro-schema-form">
    <input
      v-for="name in FIELDS"
      :key="name"
      :data-testid="`neutro-${name}`"
      :value="state.values[name]"
      @input="onInput(name, ($event.target as HTMLInputElement).value)"
    />
    <button data-testid="neutro-submit" @click="form.validate()">Submit</button>
    <div data-testid="neutro-error" v-show="state.errors.field0">{{ state.errors.field0 }}</div>
  </section>
</template>
```

- [ ] **Step 2: `SchemaValidateVee.vue`**

```vue
<!-- bench/apps/vue/src/SchemaValidateVee.vue -->
<script setup lang="ts">
import { useForm, useField } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { zodSmallSchema, FIELDS } from './schemaValidateSchema.js'

const veeSchemaRenders: Record<string, number> = {}
;(window as any).__veeSchemaRenders = veeSchemaRenders

const mode = new URLSearchParams(window.location.search).get('mode') ?? 'onSubmit'
const { handleSubmit, errors } = useForm({
  validationSchema: toTypedSchema(zodSmallSchema),
  validateOnMount: false,
})
</script>

<template>
  <section data-testid="vee-schema-form">
    <VeeField v-for="name in FIELDS" :key="name" :name="name" v-slot="{ field }">
      <input :data-testid="`vee-${name}`" v-bind="field" />
    </VeeField>
    <button data-testid="vee-submit" @click="handleSubmit(() => {})">Submit</button>
    <div data-testid="vee-error" v-show="errors.field0">{{ errors.field0 }}</div>
  </section>
</template>
```
**Note for Task 6/7:** vee-validate's per-field validate-trigger mode (`validateOnValueUpdate`, passed to `useField`/`VeeField`) controls change-vs-submit-only validation, separately from the `useForm`-level `validateOnMount`. Task 6 (re-render spec) needs each field's `validateOnValueUpdate` explicitly set (`true` for the onChange-mode variant of this page, `false` for the onSubmit-mode variant) — read vee-validate's actual current docs for the exact prop name/location during Task 6's implementation and adjust this component's `VeeField` usage accordingly; the render-counter increment itself should happen inside a `v-slot` callback or a small wrapper component, not inline in the template as sketched above (Vue's reactivity means the render count must be incremented where Vue actually re-evaluates the render function, which needs verifying against Vue's real re-render triggering behavior for `v-slot` scoped slots specifically).

- [ ] **Step 3: Wire the routing switch and render-counter reset in `App.vue`**

Read the current `<script setup>` block's `window.__resetRenders` assignment and extend it:
```ts
const neutroSchemaRenders: Record<string, number> = {}
;(window as any).__neutroSchemaRenders = neutroSchemaRenders
const veeSchemaRenders: Record<string, number> = {}
;(window as any).__veeSchemaRenders = veeSchemaRenders

;(window as any).__resetRenders = () => {
  for (const k in neutroRenders) neutroRenders[k] = 0
  for (const k in veeRenders) veeRenders[k] = 0
  for (const k in neutroSchemaRenders) neutroSchemaRenders[k] = 0
  for (const k in veeSchemaRenders) veeSchemaRenders[k] = 0
}
```
(These two new counter objects can be declared directly in `App.vue`'s script block and passed down as props if the components need to write into the same object `App.vue` exposes on `window` — or, simpler, keep the declaration inside each `.vue` component file as shown in Steps 1-2 above, which is self-contained and doesn't require prop-threading; prefer the self-contained version since `App.vue`'s existing pattern for the plain re-renders page threads renders as props into `NeutroField`/`VeeField`, but the new isolated-route pages don't need that indirection since each route only ever hosts one library.)

Add new template branches:
```html
<SchemaValidateNeutro v-else-if="path === '/schema-validate/neutro'" />
<SchemaValidateVee v-else-if="path === '/schema-validate/vee'" />
```
placed among the existing `v-else-if` chain (before the final `v-else` re-renders page), and import both components at the top of the `<script setup>` block.

- [ ] **Step 4: Manual verification**

```bash
cd /Users/kofi/_/agw-form
pnpm --dir bench/apps/vue run build
pnpm --dir bench/apps/vue run preview &
```
Visit `http://localhost:4174/schema-validate/neutro` and `/schema-validate/vee` — confirm 10 inputs render and submit shows the error region. Kill the preview server after checking.

- [ ] **Step 5: Commit**

```bash
git add bench/apps/vue/src/SchemaValidate*.vue bench/apps/vue/src/App.vue
git commit -m "bench(schema-validate): add Vue routes for neutro/vee-validate"
```

---

### Task 4: Svelte schema-validate routes (neutro, tanstack-form, felte)

**Files:**
- Create: `bench/apps/svelte/src/SchemaValidateNeutro.svelte`, `bench/apps/svelte/src/SchemaValidateTanStack.svelte`, `bench/apps/svelte/src/SchemaValidateFelte.svelte`
- Modify: `bench/apps/svelte/src/App.svelte`

**Interfaces:**
- Consumes: `zodSmallSchema`, `FIELDS`, `initialValues` from `./schemaValidateSchema.js` (Task 1).
- Produces: routes `/schema-validate/neutro`, `/schema-validate/tanstack`, `/schema-validate/felte`; same conventions as Tasks 2-3.

- [ ] **Step 1: `SchemaValidateNeutro.svelte`**

```svelte
<!-- bench/apps/svelte/src/SchemaValidateNeutro.svelte -->
<script lang="ts">
  import { createForm, zodAdapter } from '@neutro/form-core'
  import { zodSmallSchema, FIELDS, initialValues } from './schemaValidateSchema.js'

  const neutroSchemaRenders: Record<string, number> = {}
  ;(window as any).__neutroSchemaRenders = neutroSchemaRenders

  const form = createForm({ initialValues, validator: zodAdapter(zodSmallSchema) })
  let state = form.getState()
  form.subscribe((s) => { state = s })

  function onInput(name: string, value: string) {
    neutroSchemaRenders[name] = (neutroSchemaRenders[name] ?? 0) + 1
    form.set(name as any, value)
  }
</script>

<section data-testid="neutro-schema-form">
  {#each FIELDS as name}
    <input
      data-testid={`neutro-${name}`}
      value={state.values[name]}
      oninput={(e: Event) => onInput(name, (e.target as HTMLInputElement).value)}
    />
  {/each}
  <button data-testid="neutro-submit" onclick={() => form.validate()}>Submit</button>
  <div data-testid="neutro-error" style:display={state.errors.field0 ? 'block' : 'none'}>
    {state.errors.field0}
  </div>
</section>
```

- [ ] **Step 2: `SchemaValidateTanStack.svelte`**

```svelte
<!-- bench/apps/svelte/src/SchemaValidateTanStack.svelte -->
<script lang="ts">
  import { createForm as createTsForm } from '@tanstack/svelte-form'
  import { zodSmallSchema, FIELDS, initialValues } from './schemaValidateSchema.js'

  const tanstackSchemaRenders: Record<string, number> = {}
  ;(window as any).__tanstackSchemaRenders = tanstackSchemaRenders

  const mode = new URLSearchParams(window.location.search).get('mode') ?? 'onSubmit'
  const form = createTsForm(() => ({
    defaultValues: initialValues,
    validators: mode === 'onChange' ? { onChange: zodSmallSchema } : { onSubmit: zodSmallSchema },
  }))
</script>

<form.Field name="field0">
  {#snippet children(field0)}
    <section data-testid="tanstack-schema-form">
      {#each FIELDS as name}
        <form.Field {name}>
          {#snippet children(f)}
            <input
              data-testid={`tanstack-${name}`}
              value={f.state.value}
              oninput={(e: Event) => {
                tanstackSchemaRenders[name] = (tanstackSchemaRenders[name] ?? 0) + 1
                f.handleChange((e.target as HTMLInputElement).value)
              }}
            />
          {/snippet}
        </form.Field>
      {/each}
      <button data-testid="tanstack-submit" onclick={() => form.handleSubmit()}>Submit</button>
      <div data-testid="tanstack-error" style:display={field0.state.meta.errors.length ? 'block' : 'none'}>
        {field0.state.meta.errors[0]}
      </div>
    </section>
  {/snippet}
</form.Field>
```

- [ ] **Step 3: `SchemaValidateFelte.svelte`**

```svelte
<!-- bench/apps/svelte/src/SchemaValidateFelte.svelte -->
<script lang="ts">
  import { createForm as createFelteForm } from 'felte'
  import { validator } from '@felte/validator-zod'
  import { zodSmallSchema, FIELDS, initialValues } from './schemaValidateSchema.js'

  const felteSchemaRenders: Record<string, number> = {}
  ;(window as any).__felteSchemaRenders = felteSchemaRenders

  const { form: felteAction, data, errors } = createFelteForm({
    initialValues,
    extend: validator({ schema: zodSmallSchema }),
  })
</script>

<form use:felteAction>
  <section data-testid="felte-schema-form">
    {#each FIELDS as name}
      <input
        data-testid={`felte-${name}`}
        name={name}
        value={$data[name]}
        oninput={() => { felteSchemaRenders[name] = (felteSchemaRenders[name] ?? 0) + 1 }}
      />
    {/each}
    <button data-testid="felte-submit" type="submit">Submit</button>
    <div data-testid="felte-error" style:display={$errors.field0 ? 'block' : 'none'}>
      {$errors.field0}
    </div>
  </section>
</form>
```
**Note for Task 6/7:** felte's validate-trigger timing (validate on every input vs validate on submit only) is controlled by its `validate`/`onSubmit` config interaction with the `@felte/validator-zod` extend — read felte's actual current docs during Task 6's implementation for the exact option to force onChange-vs-onSubmit-only behavior; the sketch above validates via the extend's default behavior, which needs confirming against whichever mode a given spec run needs.

- [ ] **Step 4: Wire the routing and render-counter reset in `App.svelte`**

Extend the existing `window.__resetRenders` block with the three new counter objects (same pattern as Tasks 2-3), and add new `{:else if}` branches to the existing chain:
```svelte
{:else if path === '/schema-validate/neutro'}
  <SchemaValidateNeutro />
{:else if path === '/schema-validate/tanstack'}
  <SchemaValidateTanStack />
{:else if path === '/schema-validate/felte'}
  <SchemaValidateFelte />
```
placed before the final `{:else}` re-renders block, with corresponding imports added to the `<script>` block at the top of `App.svelte`.

- [ ] **Step 5: Manual verification**

```bash
cd /Users/kofi/_/agw-form
pnpm --dir bench/apps/svelte run build
pnpm --dir bench/apps/svelte run preview &
```
Visit `http://localhost:4175/schema-validate/neutro`, `/schema-validate/tanstack`, `/schema-validate/felte` — confirm rendering and submit-error behavior. Kill the preview server after checking.

- [ ] **Step 6: Commit**

```bash
git add bench/apps/svelte/src/SchemaValidate*.svelte bench/apps/svelte/src/App.svelte
git commit -m "bench(schema-validate): add Svelte routes for neutro/tanstack/felte"
```

---

### Task 5: Reporting pipeline — widen `BrowserResult`, extend `browserTable()`, add `SURFACE_TITLES` + Formik annotations

**Files:**
- Modify: `bench/types/schema.ts:33-43` (`BrowserResult`)
- Modify: `bench/scripts/generate-page.ts:13-23` (`SURFACE_TITLES`), `:66-99` (`browserTable`)
- Modify: `bench/annotations.ts` (`ANNOTATIONS`)

**Interfaces:**
- Produces: `BrowserResult.submitLatencyMs?: number`; `browserTable()` renders a `Submit latency` column when any result has `submitLatencyMs != null`, and renders `— N/A${reasonMarker(...)}` for any row with `status === 'na'` regardless of which columns that surface uses.

- [ ] **Step 1: Widen `BrowserResult`**

In `bench/types/schema.ts`, add one field to the existing interface:
```ts
export interface BrowserResult {
  library: string
  status: 'ok' | 'error' | 'na'
  renderCount?: number
  p50Ms?: number
  p99Ms?: number
  cancellationPass?: boolean
  connectedCountAfterCleanup?: number
  mountMs?: number
  heapDeltaBytes?: number
  submitLatencyMs?: number              // schema-validate-submit surface: ms from submit click to error-visible
  error?: string
}
```

- [ ] **Step 2: Add `SURFACE_TITLES` entries**

In `bench/scripts/generate-page.ts`, add to the existing `SURFACE_TITLES` object (matching the exact `describe` titles Tasks 6-7 will use):
```ts
  'schema-validate-rerenders': 'Schema Validation — Re-renders per 20-keystroke sequence (Zod, 10-field form)',
  'schema-validate-submit': 'Schema Validation — Submit Latency (Zod, click-to-error-visible)',
```

- [ ] **Step 3: Add the status-aware N/A branch and the `submitLatencyMs` column to `browserTable()`**

Replace the current `browserTable` function body with:
```ts
function browserTable(surface: string, results: BrowserResult[]): string {
  const hasRender = results.some(r => r.renderCount != null)
  const hasLatency = results.some(r => r.p50Ms != null)
  const hasCancellation = results.some(r => r.cancellationPass != null)
  const hasCleanup = results.some(r => r.connectedCountAfterCleanup != null)
  const hasMount = results.some(r => r.mountMs != null)
  const hasHeap = results.some(r => r.heapDeltaBytes != null)
  const hasSubmitLatency = results.some(r => r.submitLatencyMs != null)

  const headers: string[] = ['Library']
  if (hasRender) headers.push('Renders')
  if (hasLatency) headers.push('p50', 'p99')
  if (hasCancellation) headers.push('Cancellation')
  if (hasCleanup) headers.push('Connected after cleanup')
  if (hasMount) headers.push('Time to interactive')
  if (hasHeap) headers.push('Heap delta (post-GC)')
  if (hasSubmitLatency) headers.push('Submit latency')

  const rows = results.map(r => {
    if (r.status === 'na') {
      const naCell = `— N/A${reasonMarker(surface, r.library)}`
      return `| ${r.library} | ${headers.slice(1).map(() => naCell).join(' | ')} |`
    }
    const cells: string[] = [r.library]
    if (hasRender) cells.push(r.renderCount != null ? `${r.renderCount}${reasonMarker(surface, r.library)}` : '—')
    if (hasLatency) cells.push(
      r.p50Ms != null ? `${r.p50Ms}ms${reasonMarker(surface, r.library)}` : '—',
      r.p99Ms != null ? `${r.p99Ms}ms` : '—',
    )
    if (hasCancellation) cells.push(
      r.cancellationPass == null ? '—' : r.cancellationPass ? '✅' : `❌${reasonMarker(surface, r.library)}`,
    )
    if (hasCleanup) cells.push(r.connectedCountAfterCleanup != null ? String(r.connectedCountAfterCleanup) : '—')
    if (hasMount) cells.push(r.mountMs != null ? `${r.mountMs.toFixed(1)}ms` : '—')
    if (hasHeap) cells.push(r.heapDeltaBytes != null ? `${(r.heapDeltaBytes / 1024).toFixed(1)} KB` : '—')
    if (hasSubmitLatency) cells.push(r.submitLatencyMs != null ? `${r.submitLatencyMs.toFixed(1)}ms${reasonMarker(surface, r.library)}` : '—')
    return `| ${cells.join(' | ')} |`
  }).join('\n')

  return `| ${headers.join(' | ')} |\n|${headers.map(() => '---').join('|')}|\n${rows}`
}
```
(The `r.status === 'na'` branch fills every non-Library column with the same `— N/A` + footnote cell, regardless of which metric columns this particular surface has — this is what makes Formik's reason actually render, per the round-2 review finding that a metric-gated `reasonMarker` call alone silently drops N/A reasons.)

- [ ] **Step 4: Add Formik's N/A annotations**

In `bench/annotations.ts`'s `ANNOTATIONS` object, add:
```ts
  'schema-validate-rerenders': {
    formik: {
      brief: 'no official Zod resolver',
      detail: 'Formik has no first-party Zod integration (only an unofficial zod-formik-adapter package) — excluded from this Zod-specific comparison. Formik participates fully in every other browser surface.',
    },
  },
  'schema-validate-submit': {
    formik: {
      brief: 'no official Zod resolver',
      detail: 'Formik has no first-party Zod integration (only an unofficial zod-formik-adapter package) — excluded from this Zod-specific comparison. Formik participates fully in every other browser surface.',
    },
  },
```

- [ ] **Step 5: Type-check**

```bash
cd /Users/kofi/_/agw-form/bench
pnpm exec tsc --noEmit
```
Expected: clean (no errors from the widened `BrowserResult` or the modified `browserTable`).

- [ ] **Step 6: Commit**

```bash
git add bench/types/schema.ts bench/scripts/generate-page.ts bench/annotations.ts
git commit -m "bench(schema-validate): widen BrowserResult, add N/A-aware browserTable branch, Formik annotations"
```

---

### Task 6: `schema-validate-rerenders.spec.ts`

**Files:**
- Create: `bench/suites/browser/schema-validate-rerenders.spec.ts`
- Modify: `bench/apps/react/src/SchemaValidateRhf.tsx`, `bench/apps/svelte/src/SchemaValidateTanStack.svelte` (apply the `?mode=` query-param fix flagged in Task 2/4's notes, since this spec needs `onChange` mode)
- Modify: `bench/apps/vue/src/SchemaValidateVee.vue` (apply the `validateOnValueUpdate` fix flagged in Task 3's note)

**Interfaces:**
- Consumes: routes from Tasks 2-4, each visited with `?mode=onChange` where the component reads that param (RHF, TanStack, vee-validate all need this — re-read each component's Task 2-4 "Note for Task 6/7" before writing this spec, since those components were deliberately left with a TODO-style forward reference to this exact task).

- [ ] **Step 1: Apply the deferred `mode=onChange` wiring to the 3 flagged components**

In `SchemaValidateRhf.tsx`, change the hardcoded `mode: 'onSubmit'` to:
```tsx
const mode = new URLSearchParams(window.location.search).get('mode') ?? 'onSubmit'
// ...
const { register, handleSubmit, formState: { errors } } = useForm({
  defaultValues: initialValues,
  resolver: zodResolver(zodSmallSchema),
  mode: mode as 'onSubmit' | 'onChange',
})
```
In `SchemaValidateTanStack.svelte` (Svelte version) — already reads `mode` from the query string per Task 4's Step 2, no change needed there; confirm the React version (Task 2 Step 3) also already reads it — it does, per that step's code. No change needed for TanStack in either app.
In `SchemaValidateVee.vue`, wire each `VeeField`'s `validateOnValueUpdate` prop to `mode === 'onChange'` (read vee-validate's actual current prop name/location by checking the installed `vee-validate` version's type definitions or documentation at implementation time — the exact API surface for this wasn't confirmed during spec review, only that some mechanism for it exists).

- [ ] **Step 2: Write the spec file**

```ts
// bench/suites/browser/schema-validate-rerenders.spec.ts
import { test, expect, type Page, type TestInfo } from '@playwright/test'
import type { BrowserResult } from '../../types/schema.js'

async function measureReRenders(page: Page, fieldPrefix: string, rendersKey: string): Promise<number> {
  await page.evaluate(() => (window as any).__resetRenders?.())
  const input = page.getByTestId(`${fieldPrefix}-field0`)
  for (let i = 0; i < 20; i++) {
    await input.pressSequentially('x', { delay: 10 })
  }
  await page.waitForTimeout(100)
  const counts: Record<string, number> = await page.evaluate((key) => (window as any)[key] ?? {}, rendersKey)
  return Object.values(counts).reduce((sum, n) => sum + n, 0)
}

async function attach(testInfo: TestInfo, library: string, renderCount: number) {
  const result: BrowserResult = { library, status: 'ok', renderCount }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
}

async function attachNA(testInfo: TestInfo, library: string) {
  const result: BrowserResult = { library, status: 'na' }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
}

const COMBOS: Array<{ name: string; port: number; prefix: string; key: string; library: string; limit: number }> = [
  { name: 'neutro/form (React)',    port: 4173, prefix: 'neutro',   key: '__neutroSchemaRenders',   library: 'neutro/form (React)',   limit: 30 },
  { name: 'react-hook-form',        port: 4173, prefix: 'rhf',      key: '__rhfSchemaRenders',      library: 'react-hook-form',       limit: 600 },
  { name: 'tanstack-form (React)',  port: 4173, prefix: 'tanstack', key: '__tanstackSchemaRenders', library: 'tanstack-form (React)', limit: 600 },
  { name: 'neutro/form (Vue)',      port: 4174, prefix: 'neutro',   key: '__neutroSchemaRenders',   library: 'neutro/form (Vue)',     limit: 30 },
  { name: 'vee-validate',           port: 4174, prefix: 'vee',      key: '__veeSchemaRenders',      library: 'vee-validate',          limit: 600 },
  { name: 'neutro/form (Svelte)',   port: 4175, prefix: 'neutro',   key: '__neutroSchemaRenders',   library: 'neutro/form (Svelte)',  limit: 30 },
  { name: 'tanstack-form (Svelte)', port: 4175, prefix: 'tanstack', key: '__tanstackSchemaRenders', library: 'tanstack-form (Svelte)', limit: 600 },
  { name: 'felte',                  port: 4175, prefix: 'felte',    key: '__felteSchemaRenders',    library: 'felte',                 limit: 3000 },
]

test.describe('schema-validate-rerenders', () => {
  for (const c of COMBOS) {
    test(c.name, async ({ page }, testInfo) => {
      await page.goto(`http://localhost:${c.port}/schema-validate/${c.prefix}?mode=onChange`)
      const total = await measureReRenders(page, c.prefix, c.key)
      await attach(testInfo, c.library, total)
      expect(total).toBeGreaterThanOrEqual(0)
      expect(total).toBeLessThanOrEqual(c.limit)
    })
  }

  test('formik', async ({}, testInfo) => {
    await attachNA(testInfo, 'formik')
  })
})
```
**Note on `limit` values**: the numbers above (30/600/3000) are placeholder starting points, not empirically derived — per the spec's Testing section, this is expected. Step 3 below replaces them with real observed numbers.

- [ ] **Step 3: Run once, observe real numbers, recalibrate limits**

```bash
cd /Users/kofi/_/agw-form/bench
pnpm exec playwright test suites/browser/schema-validate-rerenders.spec.ts --reporter=list
```
Read the actual `renderCount` each test produces (via the test output or by temporarily logging `total` before the assertion). Update each `limit` in the `COMBOS` array to a value comfortably above (e.g. 1.5-2x) what was actually observed, then re-run to confirm all pass.

- [ ] **Step 4: Commit**

```bash
git add bench/suites/browser/schema-validate-rerenders.spec.ts \
        bench/apps/react/src/SchemaValidateRhf.tsx bench/apps/vue/src/SchemaValidateVee.vue
git commit -m "bench(schema-validate): add re-render-count Playwright spec"
```

---

### Task 7: `schema-validate-submit.spec.ts`

**Files:**
- Create: `bench/suites/browser/schema-validate-submit.spec.ts`

**Interfaces:**
- Consumes: the same routes, visited with `?mode=onSubmit` (or no query param, since `onSubmit` is each component's default per Tasks 2-4).

- [ ] **Step 1: Write the spec file**

```ts
// bench/suites/browser/schema-validate-submit.spec.ts
import { test, expect, type Page, type TestInfo } from '@playwright/test'
import type { BrowserResult } from '../../types/schema.js'

async function measureSubmitLatency(page: Page, prefix: string): Promise<number> {
  await page.evaluate(() => performance.mark('schema-validate-submit-start'))
  await page.getByTestId(`${prefix}-submit`).click()
  await page.getByTestId(`${prefix}-error`).waitFor({ state: 'visible' })
  return page.evaluate(() => {
    performance.mark('schema-validate-submit-end')
    performance.measure('schema-validate-submit', 'schema-validate-submit-start', 'schema-validate-submit-end')
    const [entry] = performance.getEntriesByName('schema-validate-submit')
    return entry.duration
  })
}

async function attach(testInfo: TestInfo, library: string, submitLatencyMs: number) {
  const result: BrowserResult = { library, status: 'ok', submitLatencyMs }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
}

async function attachNA(testInfo: TestInfo, library: string) {
  const result: BrowserResult = { library, status: 'na' }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
}

const COMBOS: Array<{ name: string; port: number; prefix: string; library: string }> = [
  { name: 'neutro/form (React)',    port: 4173, prefix: 'neutro',   library: 'neutro/form (React)' },
  { name: 'react-hook-form',        port: 4173, prefix: 'rhf',      library: 'react-hook-form' },
  { name: 'tanstack-form (React)',  port: 4173, prefix: 'tanstack', library: 'tanstack-form (React)' },
  { name: 'neutro/form (Vue)',      port: 4174, prefix: 'neutro',   library: 'neutro/form (Vue)' },
  { name: 'vee-validate',           port: 4174, prefix: 'vee',      library: 'vee-validate' },
  { name: 'neutro/form (Svelte)',   port: 4175, prefix: 'neutro',   library: 'neutro/form (Svelte)' },
  { name: 'tanstack-form (Svelte)', port: 4175, prefix: 'tanstack', library: 'tanstack-form (Svelte)' },
  { name: 'felte',                  port: 4175, prefix: 'felte',    library: 'felte' },
]

test.describe('schema-validate-submit', () => {
  for (const c of COMBOS) {
    test(c.name, async ({ page }, testInfo) => {
      await page.goto(`http://localhost:${c.port}/schema-validate/${c.prefix}`)
      const submitLatencyMs = await measureSubmitLatency(page, c.prefix)
      await attach(testInfo, c.library, submitLatencyMs)
      expect(submitLatencyMs).toBeGreaterThanOrEqual(0)
    })
  }

  test('formik', async ({}, testInfo) => {
    await attachNA(testInfo, 'formik')
  })
})
```

- [ ] **Step 2: Run and verify**

```bash
cd /Users/kofi/_/agw-form/bench
pnpm exec playwright test suites/browser/schema-validate-submit.spec.ts --reporter=list
```
Expected: all 9 tests (8 real libraries + Formik N/A) pass. If the error region never becomes visible for a given library (test times out on `waitFor({ state: 'visible' })`), that library's component from Tasks 2-4 has a bug in its submit-triggered validation wiring — fix the component, not the test.

- [ ] **Step 3: Commit**

```bash
git add bench/suites/browser/schema-validate-submit.spec.ts
git commit -m "bench(schema-validate): add submit-latency Playwright spec"
```

---

### Task 8: Full pipeline run, page regeneration, and release-gate memory update

**Files:** none (verification + memory update only, unless the full run surfaces a bug).

- [ ] **Step 1: Run the full bench pipeline**

```bash
cd /Users/kofi/_/agw-form
pnpm --dir bench run bench:full
```
This builds all apps, runs core/correctness/browser/bundle-size, merges results, and regenerates `docs/benchmarks/index.md`. Per this project's established convention, copy `results/latest.json` over `results/baseline.json` before the final `bench:generate` step if the full `bench:full` script doesn't already do this (check `bench/package.json`'s `bench:full` script composition — it may already handle this; don't skip the copy if it doesn't).

- [ ] **Step 2: Inspect the regenerated page**

```bash
grep -A 20 "Schema Validation" docs/benchmarks/index.md
```
Confirm both new surfaces appear with real per-library numbers, Formik shows `— N/A` with a footnote reason visible (not just present in source — actually rendered), and neither surface appears in the Scorecard summary table at the top of the page (per this plan's Global Constraint).

- [ ] **Step 3: Fix any issues found, re-run Step 1**

If Step 2 finds a gap (e.g., Formik's reason still not rendering, a library's numbers missing, a Scorecard row appearing unexpectedly), fix it and re-run the full pipeline until Step 2's checks all pass.

- [ ] **Step 4: Full monorepo pipeline sweep**

```bash
pnpm lint && pnpm exec tsc --noEmit && pnpm build && pnpm test
```
Expected: all green (this work is bench-only, so the core monorepo pipeline should be entirely unaffected, but confirm rather than assume).

- [ ] **Step 5: Update release-gate memory**

Update the project memory `project_v050_release_gate`, marking item 3 (browser-level schema-validate comparison) as RESOLVED, following the same format used for items 1, 2, and 7: summary of what was added, the two new metrics, Formik's N/A treatment, any real findings about neutro's relative performance, and confirmation of local-main-unpushed status unless the user has since said otherwise.
