# Browser-First Real Competitor Benchmarks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace misleading Node.js shim adapters with real competitor libraries running in browser Playwright tests; add a Svelte 5 app with TanStack/Svelte and Felte; produce a credible Surface A comparison across re-renders and async validation latency.

**Architecture:** Node.js bench becomes neutro-only (internal regression gate, no competitors). Three framework apps run in Playwright: React (port 4173) — neutro, RHF, Formik, TanStack; Vue (port 4174) — neutro, Vee-Validate; Svelte (port 4175, new) — neutro, TanStack/Svelte, Felte. Each app exposes `/` for re-render tests (all libraries on one page, namespaced `window.__*Renders` counters) and `/async/<lib>` for async latency tests (one library per URL, unambiguous timing globals).

**Tech Stack:** React 18, Vue 3, Svelte 5, Playwright, `formik`, `@tanstack/react-form`, `@tanstack/svelte-form`, `vee-validate`, `felte`, existing vitest + tinybench for neutro-only regression bench.

---

### Task 1: Strip Node.js bench competitors

**Files:**
- Modify: `bench/suites/core/set-get.bench.ts`
- Modify: `bench/suites/core/subscriptions.bench.ts`
- Modify: `bench/suites/core/dependency-scopes.bench.ts`
- Modify: `bench/suites/core/computed-fields.bench.ts`
- Modify: `bench/suites/core/array-ops.bench.ts`
- Delete: `bench/adapters/tanstack.ts`, `bench/adapters/rhf.ts`, `bench/adapters/formik.ts`, `bench/adapters/vee-validate.ts`
- Modify: `bench/package.json`
- Modify: `.github/workflows/bench-full.yml`

- [ ] **Step 1: Read all five core suite files**

```bash
cat bench/suites/core/subscriptions.bench.ts bench/suites/core/dependency-scopes.bench.ts bench/suites/core/computed-fields.bench.ts bench/suites/core/array-ops.bench.ts
```

- [ ] **Step 2: Rewrite each suite as neutro-only**

Remove the `makeAdapters` helper and all competitor imports. Each suite keeps only the neutro adapter and runs its bench directly.

`bench/suites/core/set-get.bench.ts`:
```ts
import { bench, describe } from 'vitest'
import { createAdapter as neutroAdapter } from '../../adapters/neutro.js'
import { smallFixture } from '../../fixtures/small.js'
import { largeFixture } from '../../fixtures/large.js'

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
```

Apply the same neutro-only pattern to the other four suite files, keeping the exact bench body for each suite (use the content you read in Step 1 — only strip the competitor imports and `makeAdapters` wrapper; leave the bench logic identical).

- [ ] **Step 3: Delete competitor adapter files**

```bash
rm bench/adapters/tanstack.ts bench/adapters/rhf.ts bench/adapters/formik.ts bench/adapters/vee-validate.ts
```

- [ ] **Step 4: Update bench/package.json**

Remove from `devDependencies`: `@tanstack/form-core`, `formik`, `react-hook-form`, `vee-validate`, `react`, `react-dom`, `@types/react`, `@types/react-dom`, `vue`.

Remove from `scripts`: `bench:core:all`.

Change `bench:full` to use `bench:core` instead of `bench:core:all`.

- [ ] **Step 5: Update bench-full.yml**

Remove any `BENCH_ALL: true` env var and change `bench:core:all` → `bench:core` wherever it appears.

- [ ] **Step 6: Verify the suite runs**

```bash
cd bench && pnpm bench:core
```

Expected: all surfaces complete, writes `results/core.json` with neutro-only entries. No import errors.

- [ ] **Step 7: Commit**

```bash
git add bench/suites/core/ bench/adapters/ bench/package.json .github/workflows/bench-full.yml
git commit -m "bench: strip Node.js competitor shims; core suites are now neutro-only"
```

---

### Task 2: React app — Formik + TanStack sections + async routing

**Files:**
- Modify: `bench/apps/react/package.json`
- Modify: `bench/apps/react/src/App.tsx`

The existing `App.tsx` already has a `NeutroSection` and `RhfSection` for re-renders, and a single neutro-only `AsyncField`. This task extends the re-renders page with Formik and TanStack, and adds `/async/<lib>` routing for all four libraries.

- [ ] **Step 1: Add Formik and TanStack to the React app**

In `bench/apps/react/package.json`, add to `dependencies`:
```json
"formik": "^2.4.6",
"@tanstack/react-form": "^0.29.0"
```

Run: `pnpm --dir bench/apps/react install`

- [ ] **Step 2: Replace App.tsx with the full re-renders + async-routing version**

```tsx
import React, { useCallback } from 'react'
import { useSyncExternalStore } from 'react'
import { createForm } from '@neutro/form-core'
import { useFormPath } from '@neutro/form-react'
import { useForm as useRhfForm, Controller } from 'react-hook-form'
import { Formik, useFormikContext } from 'formik'
// NOTE: Do NOT import Field from formik — it is not used in this file.
import { useForm as useTsForm } from '@tanstack/react-form'

// --- Module-level render counters (survive re-renders; exposed on window) ---
const neutroRenders: Record<string, number> = {}
const rhfRenders: Record<string, number> = {}
const formikRenders: Record<string, number> = {}
const tanstackRenders: Record<string, number> = {}

declare global {
  interface Window {
    __neutroRenders: typeof neutroRenders
    __rhfRenders: typeof rhfRenders
    __formikRenders: typeof formikRenders
    __tanstackRenders: typeof tanstackRenders
    __resetRenders: () => void
    __asyncValidationStart: number
    __asyncValidationEnd: number
  }
}
window.__neutroRenders = neutroRenders
window.__rhfRenders = rhfRenders
window.__formikRenders = formikRenders
window.__tanstackRenders = tanstackRenders
window.__resetRenders = () => {
  for (const k in neutroRenders) neutroRenders[k] = 0
  for (const k in rhfRenders) rhfRenders[k] = 0
  for (const k in formikRenders) formikRenders[k] = 0
  for (const k in tanstackRenders) tanstackRenders[k] = 0
}

const FIELDS = Array.from({ length: 10 }, (_, i) => `field${i}`)

// ==================== NEUTRO ====================
const neutroForm = createForm({ initialValues: Object.fromEntries(FIELDS.map(n => [n, ''])) })

function NeutroField({ name }: { name: string }) {
  const value = useFormPath(neutroForm, name as any)
  neutroRenders[name] = (neutroRenders[name] ?? 0) + 1
  return (
    <input
      data-testid={`neutro-${name}`}
      value={value as string}
      onChange={e => neutroForm.set(name as any, e.target.value)}
    />
  )
}
function NeutroSection() {
  return <section data-testid="neutro-form">{FIELDS.map(n => <NeutroField key={n} name={n} />)}</section>
}

// ==================== RHF ====================
function RhfSection() {
  const { control } = useRhfForm({ defaultValues: Object.fromEntries(FIELDS.map(n => [n, ''])) })
  return (
    <section data-testid="rhf-form">
      {FIELDS.map(n => (
        <Controller
          key={n} control={control} name={n}
          render={({ field }) => {
            rhfRenders[n] = (rhfRenders[n] ?? 0) + 1
            return <input data-testid={`rhf-${n}`} value={field.value} onChange={field.onChange} />
          }}
        />
      ))}
    </section>
  )
}

// ==================== FORMIK ====================
function FormikField({ name }: { name: string }) {
  const { values, handleChange } = useFormikContext<Record<string, string>>()
  formikRenders[name] = (formikRenders[name] ?? 0) + 1
  return (
    <input
      data-testid={`formik-${name}`}
      name={name}
      value={values[name]}
      onChange={handleChange}
    />
  )
}
function FormikSection() {
  return (
    <Formik initialValues={Object.fromEntries(FIELDS.map(n => [n, '']))} onSubmit={() => {}}>
      <section data-testid="formik-form">{FIELDS.map(n => <FormikField key={n} name={n} />)}</section>
    </Formik>
  )
}

// ==================== TANSTACK ====================
function TanStackField({ field, name }: { field: any; name: string }) {
  tanstackRenders[name] = (tanstackRenders[name] ?? 0) + 1
  return (
    <input
      data-testid={`tanstack-${name}`}
      value={field.state.value}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => field.handleChange(e.target.value)}
    />
  )
}
function TanStackSection() {
  const form = useTsForm({ defaultValues: Object.fromEntries(FIELDS.map(n => [n, ''])) })
  return (
    <section data-testid="tanstack-form">
      {FIELDS.map(n => (
        <form.Field key={n} name={n}>
          {(field: any) => <TanStackField field={field} name={n} />}
        </form.Field>
      ))}
    </section>
  )
}

// ==================== ASYNC PAGES ====================
const neutroAsyncForm = createForm({
  initialValues: { email: '' },
  validator: async (values, _scope, signal) => {
    window.__asyncValidationStart = performance.now()
    await new Promise(r => setTimeout(r, 200))
    if (signal?.aborted) return {}
    if (!String(values.email).includes('@')) return { email: 'Invalid email' }
    return {}
  },
  validationMode: 'onChange',
})
function NeutroAsyncPage() {
  const email = useFormPath(neutroAsyncForm, 'email')
  const sub = useCallback((cb: () => void) => neutroAsyncForm.subscribeToPath('email', cb), [])
  const getErr = useCallback(() => neutroAsyncForm.getState().errors['email'] ?? '', [])
  const error = useSyncExternalStore(sub, getErr, getErr)
  if (error) window.__asyncValidationEnd = performance.now()
  return (
    <div>
      <input
        data-testid="async-email"
        value={email as string}
        onChange={e => neutroAsyncForm.set('email', e.target.value, { validate: true })}
      />
      {error && <span data-testid="async-error">{error}</span>}
    </div>
  )
}

function RhfAsyncPage() {
  const { register, formState: { errors } } = useRhfForm({ mode: 'onChange' })
  const emailProps = register('email', {
    validate: async (value) => {
      window.__asyncValidationStart = performance.now()
      await new Promise(r => setTimeout(r, 200))
      if (!String(value).includes('@')) return 'Invalid email'
      return undefined
    },
  })
  if (errors.email?.message) window.__asyncValidationEnd = performance.now()
  return (
    <div>
      <input data-testid="async-email" {...emailProps} />
      {errors.email && <span data-testid="async-error">{errors.email.message}</span>}
    </div>
  )
}

function FormikAsyncPage() {
  return (
    <Formik
      initialValues={{ email: '' }}
      validateOnChange
      validate={async (values) => {
        window.__asyncValidationStart = performance.now()
        await new Promise(r => setTimeout(r, 200))
        if (!String(values.email).includes('@')) return { email: 'Invalid email' }
        return {}
      }}
    >
      {({ handleChange, errors }) => (
        <div>
          <input
            data-testid="async-email"
            name="email"
            onChange={handleChange}
          />
          {errors.email && (
            <span data-testid="async-error">
              {(() => { window.__asyncValidationEnd = performance.now(); return errors.email })()}
            </span>
          )}
        </div>
      )}
    </Formik>
  )
}

function TanStackAsyncPage() {
  const form = useTsForm({ defaultValues: { email: '' } })
  return (
    <div>
      <form.Field
        name="email"
        validators={{
          onChangeAsync: async ({ value }: { value: string }) => {
            window.__asyncValidationStart = performance.now()
            await new Promise(r => setTimeout(r, 200))
            if (!String(value).includes('@')) return 'Invalid email'
            return undefined
          },
        }}
      >
        {(field: any) => {
          const err = field.state.meta.errors[0]
          if (err) window.__asyncValidationEnd = performance.now()
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

// ==================== ROUTER ====================
const ASYNC_PAGES: Record<string, React.ReactElement> = {
  neutro: <NeutroAsyncPage />,
  rhf: <RhfAsyncPage />,
  formik: <FormikAsyncPage />,
  tanstack: <TanStackAsyncPage />,
}

export default function App() {
  const path = window.location.pathname
  if (path.startsWith('/async/')) {
    const lib = path.slice('/async/'.length)
    return ASYNC_PAGES[lib] ?? <div data-testid="not-found">Unknown: {lib}</div>
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

**Note on TanStack's `useForm`:** `useTsForm` is a React hook; it must be called inside `TanStackSection`, not at module level. The code above correctly calls it inside the component.

**Note on the `@tanstack/react-form` API:** Verify the exact type signatures by reading `node_modules/@tanstack/react-form/dist` or the library's TypeScript types after installing. The `validators.onChangeAsync` signature may differ slightly from `{ value: string }` — adjust accordingly.

- [ ] **Step 3: Build the React app to confirm no TypeScript errors**

```bash
pnpm --dir bench/apps/react build
```

Expected: builds to `dist/` with no errors.

- [ ] **Step 4: Commit**

```bash
git add bench/apps/react/
git commit -m "bench(react): add Formik + TanStack sections and async routing"
```

---

### Task 3: Vue app — Vee-Validate section + async routing

**Files:**
- Create: `bench/apps/vue/src/VeeField.vue`
- Create: `bench/apps/vue/src/NeutroAsyncPage.vue`
- Create: `bench/apps/vue/src/VeeAsyncPage.vue`
- Modify: `bench/apps/vue/src/App.vue`

`vee-validate` is already installed in the Vue app's `package.json`. No new packages needed.

- [ ] **Step 1: Create VeeField.vue**

Mirror the `NeutroField.vue` pattern but using `vee-validate`'s `useField`:

```vue
<script setup lang="ts">
import { onBeforeUpdate } from 'vue'
import { useField } from 'vee-validate'

const props = defineProps<{ name: string; renders: Record<string, number> }>()
// Count initial render
props.renders[props.name] = (props.renders[props.name] ?? 0) + 1
// Count reactive re-renders
onBeforeUpdate(() => {
  props.renders[props.name] = (props.renders[props.name] ?? 0) + 1
})

const { value, handleChange } = useField<string>(props.name)
</script>

<template>
  <input
    :data-testid="`vee-${name}`"
    :value="value"
    @input="(e) => handleChange((e.target as HTMLInputElement).value)"
  />
</template>
```

- [ ] **Step 2: Create NeutroAsyncPage.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { createForm } from '@neutro/form-core'
import { useVueFormPath } from '@neutro/form-vue'

const asyncForm = createForm({
  initialValues: { email: '' },
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
asyncForm.subscribe(state => {
  const e = state.errors['email']
  if (e && !error.value) {
    ;(window as any).__asyncValidationEnd = performance.now()
  }
  error.value = e ?? ''
})
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

- [ ] **Step 3: Create VeeAsyncPage.vue**

```vue
<script setup lang="ts">
import { useField, useForm } from 'vee-validate'

useForm()
const { value, errorMessage, handleChange } = useField<string>('email', async (val) => {
  ;(window as any).__asyncValidationStart = performance.now()
  await new Promise(r => setTimeout(r, 200))
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
    <span
      v-if="errorMessage"
      data-testid="async-error"
      :ref="() => { ;(window as any).__asyncValidationEnd = performance.now() }"
    >
      {{ errorMessage }}
    </span>
  </div>
</template>
```

**Note on `__asyncValidationEnd` timing:** The `:ref` callback fires when the error `<span>` is mounted into the DOM. This captures the same moment as neutro's render-phase timestamp. If the `:ref` callback approach causes issues (it fires on every mount/update), use a `watch` on `errorMessage` instead:
```ts
import { watch } from 'vue'
watch(errorMessage, (val) => {
  if (val) (window as any).__asyncValidationEnd = performance.now()
})
```
Use whichever works reliably in practice; the key is that the timestamp is set as close to DOM visibility as possible.

- [ ] **Step 4: Rewrite App.vue with Vee section + async routing**

```vue
<script setup lang="ts">
import { createForm } from '@neutro/form-core'
import { useForm as useVeeForm } from 'vee-validate'
import NeutroField from './NeutroField.vue'
import VeeField from './VeeField.vue'
import NeutroAsyncPage from './NeutroAsyncPage.vue'
import VeeAsyncPage from './VeeAsyncPage.vue'

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

// Vee-Validate requires useForm() to establish the provide/inject form context.
// Must be called unconditionally — composables cannot be conditional in <script setup>.
// On async pages the context goes unused but causes no harm.
useVeeForm()
</script>

<template>
  <!-- Async pages -->
  <NeutroAsyncPage v-if="path === '/async/neutro'" />
  <VeeAsyncPage v-else-if="path === '/async/vee'" />

  <!-- Re-renders page -->
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

- [ ] **Step 5: Build the Vue app**

```bash
pnpm --dir bench/apps/vue build
```

Expected: builds cleanly, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add bench/apps/vue/
git commit -m "bench(vue): add Vee-Validate section and async routing"
```

---

### Task 4: Scaffold Svelte bench app

**Files:**
- Create: `bench/apps/svelte/package.json`
- Create: `bench/apps/svelte/vite.config.ts`
- Create: `bench/apps/svelte/tsconfig.json`
- Create: `bench/apps/svelte/index.html`
- Create: `bench/apps/svelte/src/main.ts`
- Create: `bench/apps/svelte/src/App.svelte` (placeholder)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@neutro/bench-app-svelte",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "preview": "vite preview --port 4175"
  },
  "dependencies": {
    "@neutro/form-core": "link:../../../packages/core",
    "@neutro/form-svelte": "link:../../../packages/adapters/svelte",
    "@tanstack/svelte-form": "^0.29.0",
    "felte": "^2.0.0",
    "svelte": "^5.0.0"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^5.0.0",
    "svelte-check": "^4.0.0",
    "typescript": "^5.5.4",
    "vite": "^5.3.4"
  }
}
```

**Note:** Run `pnpm --dir bench/apps/svelte install` after creating this file. Verify the installed versions of `@tanstack/svelte-form` and `felte` against their latest releases — bump the version constraints if needed.

- [ ] **Step 2: Create vite.config.ts**

```ts
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
})
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "src/**/*.svelte"]
}
```

Do not add an `"extends"` pointing to `@tsconfig/svelte` — that package is not in the dependencies and the build will fail if the extend is present.

- [ ] **Step 4: Create index.html**

```html
<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><title>Neutro Bench — Svelte</title></head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Create src/main.ts**

```ts
import { mount } from 'svelte'
import App from './App.svelte'

mount(App, { target: document.getElementById('app')! })
```

- [ ] **Step 6: Create placeholder src/App.svelte**

```svelte
<p>Svelte bench app — content coming in next task</p>
```

- [ ] **Step 7: Install and do a build smoke test**

```bash
pnpm --dir bench/apps/svelte install
pnpm --dir bench/apps/svelte build
```

Expected: a `dist/` directory is created with no errors.

- [ ] **Step 8: Commit**

```bash
git add bench/apps/svelte/
git commit -m "bench(svelte): scaffold Vite + Svelte 5 bench app"
```

---

### Task 5: Svelte app — neutro, TanStack, Felte pages

**Files:**
- Create: `bench/apps/svelte/src/NeutroField.svelte`
- Create: `bench/apps/svelte/src/TanStackField.svelte`
- Create: `bench/apps/svelte/src/FelteField.svelte`
- Create: `bench/apps/svelte/src/NeutroAsyncPage.svelte`
- Create: `bench/apps/svelte/src/TanStackAsyncPage.svelte`
- Create: `bench/apps/svelte/src/FelteAsyncPage.svelte`
- Modify: `bench/apps/svelte/src/App.svelte`

**Important before coding:** Read `packages/adapters/svelte/src/index.ts` to understand the exact `useSvelteFormPath` API (it returns a `Readable<{value, fieldState}>` store). Read `node_modules/@tanstack/svelte-form` types for `createForm` and `form.Field` API — especially whether `field.state.value` is a plain `$state` rune or needs store access. Read `node_modules/felte` types for `createForm` — verify the v2 API (stores vs runes).

**Render counting in Svelte 5:** The Svelte 5 adapter uses `svelte/store` `readable` stores. In Svelte 5 runes mode, store values accessed with the `$` prefix are reactive. `$effect.pre` (runs before DOM updates) creates a reactive dependency on any store or `$state` it reads. This is the Svelte 5 analog of Vue's `onBeforeUpdate`.

- [ ] **Step 1: Create NeutroField.svelte**

```svelte
<script lang="ts">
  import { createForm } from '@neutro/form-core'
  import { useSvelteFormPath } from '@neutro/form-svelte'

  const {
    form,
    name,
    renders,
  }: {
    form: ReturnType<typeof createForm>
    name: string
    renders: Record<string, number>
  } = $props()

  const field = useSvelteFormPath(form, name)

  $effect.pre(() => {
    // Reading $field.value creates a reactive dependency on this field's store.
    // $effect.pre fires before DOM update — analogous to Vue onBeforeUpdate.
    void $field.value
    renders[name] = (renders[name] ?? 0) + 1
  })
</script>

<input
  data-testid={`neutro-${name}`}
  value={$field.value as string}
  oninput={(e) => form.set(name as any, (e.target as HTMLInputElement).value)}
/>
```

- [ ] **Step 2: Create TanStackField.svelte**

The TanStack Svelte form uses `createForm` from `@tanstack/svelte-form`. The `form.Field` component accepts a `{#snippet children(field)}` block in Svelte 5. `field.state.value` is reactive via TanStack's internal signal system.

```svelte
<script lang="ts">
  const {
    field,
    name,
    renders,
  }: {
    field: any
    name: string
    renders: Record<string, number>
  } = $props()

  $effect.pre(() => {
    // field.state.value triggers a reactive re-run when TanStack updates this field.
    // If TanStack uses svelte/store internally, prefix with $ instead.
    void field.state.value
    renders[name] = (renders[name] ?? 0) + 1
  })
</script>

<input
  data-testid={`tanstack-${name}`}
  value={field.state.value}
  oninput={(e) => field.handleChange((e.target as HTMLInputElement).value)}
/>
```

**Note:** If `field.state.value` is not reactive as a plain property (TanStack may expose it as a store), adjust: check if `@tanstack/svelte-form` exports store-based or rune-based state and use the appropriate access pattern.

- [ ] **Step 3: Create FelteField.svelte**

```svelte
<script lang="ts">
  import type { Readable, Writable } from 'svelte/store'

  const {
    name,
    data,
    renders,
    setField,
  }: {
    name: string
    data: Readable<Record<string, string>>
    renders: Record<string, number>
    setField: (name: string, value: string) => void
  } = $props()

  $effect.pre(() => {
    void $data[name]
    renders[name] = (renders[name] ?? 0) + 1
  })
</script>

<input
  data-testid={`felte-${name}`}
  value={$data[name] ?? ''}
  oninput={(e) => setField(name, (e.target as HTMLInputElement).value)}
/>
```

**Note:** Felte v2's `createForm` returns `{ form, data, errors, setField, ... }`. Verify the exact return shape from `node_modules/felte` types — `data` should be a `Readable<Record<string, unknown>>`. If `setField` is not a top-level return (some versions use `helpers.setField`), adjust accordingly.

- [ ] **Step 4: Create NeutroAsyncPage.svelte**

```svelte
<script lang="ts">
  import { onDestroy } from 'svelte'
  import { createForm } from '@neutro/form-core'
  import { useSvelteFormPath } from '@neutro/form-svelte'

  const asyncForm = createForm({
    initialValues: { email: '' },
    validator: async (values: any, _scope: any, signal: any) => {
      ;(window as any).__asyncValidationStart = performance.now()
      await new Promise(r => setTimeout(r, 200))
      if (signal?.aborted) return {}
      if (!String(values.email).includes('@')) return { email: 'Invalid email' }
      return {}
    },
    validationMode: 'onChange',
  })

  const field = useSvelteFormPath(asyncForm, 'email')

  // $state() is Svelte 5 runes syntax for reactive local state.
  // All imports must be at the top — never mid-file.
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
    oninput={(e) => asyncForm.set('email', (e.target as HTMLInputElement).value, { validate: true })}
  />
  {#if error}
    <span data-testid="async-error">{error}</span>
  {/if}
</div>
```

- [ ] **Step 5: Create TanStackAsyncPage.svelte**

```svelte
<script lang="ts">
  import { createForm } from '@tanstack/svelte-form'

  const form = createForm(() => ({
    defaultValues: { email: '' },
  }))
</script>

<div>
  <form.Field
    name="email"
    validators={{
      onChangeAsync: async ({ value }: { value: string }) => {
        ;(window as any).__asyncValidationStart = performance.now()
        await new Promise(r => setTimeout(r, 200))
        if (!String(value).includes('@')) {
          // Set end marker before returning so it is stamped at validation-completion
          // time. Svelte's fine-grained reactivity makes render-phase stamping harder
          // to wire up than in React; validation-completion is ~1–3ms earlier than
          // DOM visibility, which is acceptable noise against a 200ms validator.
          ;(window as any).__asyncValidationEnd = performance.now()
          return 'Invalid email'
        }
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

- [ ] **Step 6: Create FelteAsyncPage.svelte**

```svelte
<script lang="ts">
  import { createForm } from 'felte'

  let error = $state('')

  const { form: formAction, data, errors } = createForm({
    initialValues: { email: '' },
    validate: async (values: Record<string, string>) => {
      ;(window as any).__asyncValidationStart = performance.now()
      await new Promise(r => setTimeout(r, 200))
      const errs: Record<string, string> = {}
      if (!String(values.email).includes('@')) errs.email = 'Invalid email'
      return errs
    },
  })

  // Subscribe to errors store for timing marker
  errors.subscribe((e: any) => {
    const msg = e?.email
    if (msg && !error) {
      ;(window as any).__asyncValidationEnd = performance.now()
    }
    error = msg ?? ''
  })
</script>

<form use:formAction>
  <input data-testid="async-email" name="email" value={$data.email ?? ''} />
  {#if error}
    <span data-testid="async-error">{error}</span>
  {/if}
</form>
```

**Note:** Felte v2 may use different store shapes for `errors`. Check the installed package types. If `errors` is not a plain store, adjust the subscribe call accordingly.

- [ ] **Step 7: Replace App.svelte with full re-renders + routing**

```svelte
<script lang="ts">
  import { createForm } from '@neutro/form-core'
  import { createForm as createTsForm } from '@tanstack/svelte-form'
  import { createForm as createFelteForm } from 'felte'
  import NeutroField from './NeutroField.svelte'
  import TanStackField from './TanStackField.svelte'
  import FelteField from './FelteField.svelte'
  import NeutroAsyncPage from './NeutroAsyncPage.svelte'
  import TanStackAsyncPage from './TanStackAsyncPage.svelte'
  import FelteAsyncPage from './FelteAsyncPage.svelte'

  const path = window.location.pathname

  const FIELDS = Array.from({ length: 10 }, (_, i) => `field${i}`)

  // --- Render counters ---
  const neutroRenders: Record<string, number> = {}
  const tanstackRenders: Record<string, number> = {}
  const felteRenders: Record<string, number> = {}
  ;(window as any).__neutroRenders = neutroRenders
  ;(window as any).__tanstackRenders = tanstackRenders
  ;(window as any).__felteRenders = felteRenders
  ;(window as any).__resetRenders = () => {
    for (const k in neutroRenders) neutroRenders[k] = 0
    for (const k in tanstackRenders) tanstackRenders[k] = 0
    for (const k in felteRenders) felteRenders[k] = 0
  }

  const neutroForm = createForm({
    initialValues: Object.fromEntries(FIELDS.map(n => [n, ''])),
  })

  const tsForm = createTsForm(() => ({
    defaultValues: Object.fromEntries(FIELDS.map(n => [n, ''])),
  }))

  const { form: felteAction, data: felteData, setField } = createFelteForm({
    initialValues: Object.fromEntries(FIELDS.map(n => [n, ''])),
  })
</script>

{#if path === '/async/neutro'}
  <NeutroAsyncPage />
{:else if path === '/async/tanstack'}
  <TanStackAsyncPage />
{:else if path === '/async/felte'}
  <FelteAsyncPage />
{:else}
  <!-- Re-renders page -->
  <section data-testid="neutro-form">
    {#each FIELDS as name}
      <NeutroField form={neutroForm} {name} renders={neutroRenders} />
    {/each}
  </section>

  <section data-testid="tanstack-form">
    {#each FIELDS as name}
      <tsForm.Field {name}>
        {#snippet children(field)}
          <TanStackField {field} {name} renders={tanstackRenders} />
        {/snippet}
      </tsForm.Field>
    {/each}
  </section>

  <form use:felteAction>
    <section data-testid="felte-form">
      {#each FIELDS as name}
        <FelteField {name} data={felteData} renders={felteRenders} setField={setField} />
      {/each}
    </section>
  </form>
{/if}
```

- [ ] **Step 8: Build the Svelte app**

```bash
pnpm --dir bench/apps/svelte build
```

Fix any TypeScript or Svelte compilation errors before committing. Common issues: TanStack's `form.Field` syntax in Svelte 5 (use `{#snippet children(field)}` not `let:field`), Felte store type mismatches.

- [ ] **Step 9: Commit**

```bash
git add bench/apps/svelte/
git commit -m "bench(svelte): add neutro + TanStack + Felte re-render and async pages"
```

---

### Task 6: Playwright config + re-renders spec

**Files:**
- Modify: `bench/playwright.config.ts`
- Modify: `bench/suites/browser/re-renders.spec.ts`
- Modify: `bench/package.json` (add svelte to `bench:apps:build`)

- [ ] **Step 1: Update playwright.config.ts to add the Svelte server**

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  retries: 2,
  reporter: [['./reporters/json-playwright.ts']],
  webServer: [
    {
      command: 'pnpm --dir apps/react preview',
      port: 4173,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm --dir apps/vue preview',
      port: 4174,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm --dir apps/svelte preview',
      port: 4175,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
```

- [ ] **Step 2: Update bench/package.json — add svelte to build script**

Change `bench:apps:build` to include the Svelte app:

```json
"bench:apps:build": "run-p \"pnpm --dir apps/react install && pnpm --dir apps/react build\" \"pnpm --dir apps/vue install && pnpm --dir apps/vue build\" \"pnpm --dir apps/svelte install && pnpm --dir apps/svelte build\""
```

- [ ] **Step 3: Rewrite re-renders.spec.ts with all competitors**

The `measureReRenders` helper must accept a `rendersKey` so it reads the right `window.__*Renders` object, and a `fieldPrefix` for `data-testid` lookup.

```ts
import { test, expect, type Page } from '@playwright/test'
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

async function attach(testInfo: any, library: string, renderCount: number) {
  const result: BrowserResult = { library, status: 'ok', renderCount }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
}

test.describe('re-renders', () => {
  // ---- React (port 4173) ----
  test('neutro/form (React)', async ({ page }, testInfo) => {
    await page.goto('http://localhost:4173')
    const total = await measureReRenders(page, 'neutro', '__neutroRenders')
    await attach(testInfo, 'neutro/form (React)', total)
    expect(total).toBeLessThanOrEqual(25)
  })

  test('react-hook-form', async ({ page }, testInfo) => {
    await page.goto('http://localhost:4173')
    const total = await measureReRenders(page, 'rhf', '__rhfRenders')
    await attach(testInfo, 'react-hook-form', total)
    expect(total).toBeLessThanOrEqual(500) // RHF Controller re-renders only the subscribed field
  })

  test('formik', async ({ page }, testInfo) => {
    await page.goto('http://localhost:4173')
    const total = await measureReRenders(page, 'formik', '__formikRenders')
    await attach(testInfo, 'formik', total)
    // Formik re-renders ALL fields on every change via context; 200 renders (20 keystrokes × 10 fields) is expected
    expect(total).toBeLessThanOrEqual(500)
  })

  test('tanstack-form (React)', async ({ page }, testInfo) => {
    await page.goto('http://localhost:4173')
    const total = await measureReRenders(page, 'tanstack', '__tanstackRenders')
    await attach(testInfo, 'tanstack-form (React)', total)
    expect(total).toBeLessThanOrEqual(500)
  })

  // ---- Vue (port 4174) ----
  test('neutro/form (Vue)', async ({ page }, testInfo) => {
    await page.goto('http://localhost:4174')
    const total = await measureReRenders(page, 'neutro', '__neutroRenders')
    await attach(testInfo, 'neutro/form (Vue)', total)
    expect(total).toBeLessThanOrEqual(25)
  })

  test('vee-validate', async ({ page }, testInfo) => {
    await page.goto('http://localhost:4174')
    const total = await measureReRenders(page, 'vee', '__veeRenders')
    await attach(testInfo, 'vee-validate', total)
    expect(total).toBeLessThanOrEqual(500)
  })

  // ---- Svelte (port 4175) ----
  test('neutro/form (Svelte)', async ({ page }, testInfo) => {
    await page.goto('http://localhost:4175')
    const total = await measureReRenders(page, 'neutro', '__neutroRenders')
    await attach(testInfo, 'neutro/form (Svelte)', total)
    expect(total).toBeLessThanOrEqual(25)
  })

  test('tanstack-form (Svelte)', async ({ page }, testInfo) => {
    await page.goto('http://localhost:4175')
    const total = await measureReRenders(page, 'tanstack', '__tanstackRenders')
    await attach(testInfo, 'tanstack-form (Svelte)', total)
    expect(total).toBeLessThanOrEqual(500)
  })

  test('felte', async ({ page }, testInfo) => {
    await page.goto('http://localhost:4175')
    const total = await measureReRenders(page, 'felte', '__felteRenders')
    await attach(testInfo, 'felte', total)
    expect(total).toBeLessThanOrEqual(500)
  })
})
```

**Note on `expect` thresholds:** The thresholds are intentionally loose (500) for libraries we haven't profiled yet. After a real run, tighten them to `observed + 20%`.

- [ ] **Step 4: Build all three apps and do a full browser run**

```bash
cd bench && pnpm bench:apps:build && pnpm bench:browser
```

Expected: all 9 tests pass (may need threshold adjustments). Writes `results/browser.json`.

- [ ] **Step 5: Commit**

```bash
git add bench/playwright.config.ts bench/suites/browser/re-renders.spec.ts bench/package.json
git commit -m "bench: update Playwright config and re-renders spec for all 9 competitors"
```

---

### Task 7: Async-latency spec for all competitors

**Files:**
- Modify: `bench/suites/browser/async-latency.spec.ts`

The existing spec only tests `neutro/form (React)` at `http://localhost:4173`. This task expands it to all 9 library+framework combinations using the `/async/<lib>` routes added in Tasks 2–5.

- [ ] **Step 1: Rewrite async-latency.spec.ts**

```ts
import { test, expect, type Page } from '@playwright/test'
import type { BrowserResult } from '../../types/schema.js'

async function measureLatency(page: Page): Promise<number[]> {
  const latencies: number[] = []
  for (let i = 0; i < 50; i++) {
    await page.evaluate(() => {
      ;(window as any).__asyncValidationStart = 0
      ;(window as any).__asyncValidationEnd = 0
    })
    const input = page.getByTestId('async-email')
    await input.fill('')
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
  testInfo: any,
  url: string,
  library: string,
) {
  await page.goto(url)
  const latencies = await measureLatency(page)
  const p50 = percentile(latencies, 50)
  const p99 = percentile(latencies, 99)
  const result: BrowserResult = {
    library,
    status: 'ok',
    p50Ms: Math.round(p50),
    p99Ms: Math.round(p99),
    concurrentRacePass: library.startsWith('neutro'), // only neutro has verified epoch cancellation
  }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
  expect(p50).toBeLessThan(600) // 200ms validator + 300ms debounce headroom + React scheduling
  expect(latencies.length).toBeGreaterThanOrEqual(10) // enough valid samples
}

test.describe('async-latency', () => {
  test('neutro/form (React)',       async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4173/async/neutro',   'neutro/form (React)'))
  test('react-hook-form',           async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4173/async/rhf',       'react-hook-form'))
  test('formik',                    async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4173/async/formik',    'formik'))
  test('tanstack-form (React)',     async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4173/async/tanstack',  'tanstack-form (React)'))
  test('neutro/form (Vue)',         async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4174/async/neutro',    'neutro/form (Vue)'))
  test('vee-validate',              async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4174/async/vee',       'vee-validate'))
  test('neutro/form (Svelte)',      async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4175/async/neutro',    'neutro/form (Svelte)'))
  test('tanstack-form (Svelte)',    async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4175/async/tanstack',  'tanstack-form (Svelte)'))
  test('felte',                     async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4175/async/felte',     'felte'))
})
```

- [ ] **Step 2: Run the spec standalone to verify**

```bash
cd bench && pnpm bench:browser
```

All 9 latency tests should pass. If a specific library's async validation doesn't trigger the error (wrong validator wiring), fix the async page component for that library before committing.

- [ ] **Step 3: Commit**

```bash
git add bench/suites/browser/async-latency.spec.ts
git commit -m "bench: expand async-latency spec to all 9 library+framework combinations"
```

---

### Task 8: Schema, merge-results, generate-page

**Files:**
- Modify: `bench/types/schema.ts`
- Modify: `bench/scripts/merge-results.ts`
- Modify: `bench/scripts/generate-page.ts`
- Modify: `bench/results/baseline.json`

- [ ] **Step 1: Read all four files**

```bash
cat bench/types/schema.ts bench/scripts/merge-results.ts bench/scripts/generate-page.ts bench/results/baseline.json
```

- [ ] **Step 2: Update schema.ts**

Ensure `BrowserResult` covers both surface types. The existing type should already have `renderCount`, `p50Ms`, `p99Ms`, `concurrentRacePass`. If `concurrentRacePass` is optional (`?`), it stays optional so re-render-only results can omit it. No changes needed if the type already supports this; only add fields that are genuinely missing.

- [ ] **Step 3: Update merge-results.ts**

Remove `KNOWN_SHIMS` and all shim annotation logic — there are no shims anymore. Remove the `.shim` property assignment on `LibraryBenchResult`. Keep the rest of the merge logic intact.

Also update `normalizeCorrectnessJson` if it currently maps shim library names to `'na'` — after this change, all `test.skip` entries are already mapped to `'na'` correctly via the `'skipped'` status.

- [ ] **Step 4: Update generate-page.ts**

The generated page should:
1. **Remove the "Core Performance" comparison table** — Node.js bench results are internal-only now. (The core bench still runs for regression detection, but is not published as a comparison.)
2. **Rename the browser section to the top-level comparison**: show all 9 library+framework combinations in two tables:
   - **Re-renders per field update** (libraries that have `renderCount`)
   - **Async validation latency** (libraries that have `p50Ms`)
3. Keep the correctness section unchanged.
4. Keep footnotes for `concurrentRacePass: false` (async race not verified for non-neutro libraries).

The generate-page script reads from `results/baseline.json`. After this change, baseline only contains browser results. Update the script to iterate `baseline.browser` instead of `baseline.core` for the main comparison tables.

Full rewrite of the relevant section in `generate-page.ts` is required — read the file first, then rewrite the `generatePage` function to implement the new layout.

- [ ] **Step 5: Update baseline.json to clear the now-irrelevant core entries**

Reset to a clean state that reflects the new schema:

```json
{
  "meta": {
    "generatedAt": "2026-06-30T00:00:00.000Z",
    "neutroVersion": "0.0.0",
    "nodeVersion": "v22.0.0",
    "platform": "linux",
    "runner": "github-actions"
  },
  "core": {},
  "correctness": {},
  "browser": {}
}
```

**Note:** The `core` key stays in the schema (the regression workflow still uses it), but it starts empty in the public baseline since we no longer publish core-bench comparison data.

- [ ] **Step 6: Run merge + generate end-to-end**

First produce some browser results:
```bash
cd bench && pnpm bench:browser
```

Then merge and generate:
```bash
cd bench && pnpm bench:merge && pnpm bench:generate
```

Expected: `docs/benchmarks/index.md` is written with a re-renders table and an async-latency table. No TypeScript errors from `tsx`.

- [ ] **Step 7: Commit**

```bash
git add bench/types/schema.ts bench/scripts/merge-results.ts bench/scripts/generate-page.ts bench/results/baseline.json docs/benchmarks/index.md
git commit -m "bench: remove shim logic from schema/merge/generate; browser-only comparison page"
```

---

### Task 9: CI workflows + bench scripts

**Files:**
- Modify: `.github/workflows/bench-full.yml`
- Modify: `.github/workflows/bench-weekly.yml`
- Modify: `bench/package.json` (if anything remains from earlier tasks)

- [ ] **Step 1: Read both workflow files**

```bash
cat .github/workflows/bench-full.yml .github/workflows/bench-weekly.yml
```

- [ ] **Step 2: Update bench-full.yml**

Ensure the workflow:
1. Builds all three apps (React, Vue, Svelte) before running Playwright — use `bench:apps:build` which was updated in Task 6.
2. Runs `bench:core` (not `bench:core:all`) for the Node.js regression data.
3. Runs `bench:correctness`, `bench:browser`, `bench:merge`, `bench:generate`.
4. Commits `bench/results/baseline.json` and `docs/benchmarks/index.md` with `[skip ci]` (the docs.yml `workflow_run` trigger picks this up).

No structural change should be needed if Task 1 already changed `bench:core:all` → `bench:core`. Only verify the Svelte app is covered by `bench:apps:build`.

- [ ] **Step 3: Rewrite `bench/scripts/post-drift-issue.ts`**

The weekly drift check currently iterates `latest.core` comparing `opsPerSec`. After Task 1 there are no competitor Node.js results, so core drift detection is moot. Rewrite the script to iterate `latest.browser` instead.

**Critical directionality note:** For browser metrics, higher = worse (more re-renders is bad; higher latency is bad). So we only flag _positive_ pct (regression), unlike the old `opsPerSec` check which used `Math.abs`. If a competitor renders fewer times after a library update, that's good news — no alert needed.

Rewrite `bench/scripts/post-drift-issue.ts` to:

```ts
import { readFileSync } from 'node:fs'
import type { BenchResults, BrowserResult } from '../types/schema.js'

const DRIFT_THRESHOLD = 0.20 // 20%

function readJson(path: string): unknown {
  try { return JSON.parse(readFileSync(path, 'utf8')) }
  catch (e) { console.error(`[post-drift] cannot read ${path}:`, e); process.exit(1) }
}

const latest   = readJson('results/latest.json') as BenchResults
const baseline = readJson('results/baseline.json') as BenchResults
const token    = process.env.GH_TOKEN
const repo     = process.env.GITHUB_REPOSITORY

interface DriftEntry {
  library: string
  surface: string
  metric:  'renderCount' | 'p50Ms'
  baselineVal: number
  latestVal:   number
  pct:         number
}

const drifts: DriftEntry[] = []

for (const [surface, latestResults] of Object.entries(latest.browser ?? {})) {
  const baselineSurface = baseline.browser?.[surface]
  if (!baselineSurface) continue

  for (const lr of latestResults as BrowserResult[]) {
    if (lr.library === 'neutro/form' || lr.library.startsWith('neutro/form')) continue
    if (lr.status !== 'ok') continue

    const br = (baselineSurface as BrowserResult[]).find(r => r.library === lr.library)
    if (!br || br.status !== 'ok') continue

    for (const metric of ['renderCount', 'p50Ms'] as const) {
      const lv = lr[metric]
      const bv = br[metric]
      if (lv == null || bv == null || bv === 0) continue
      // Positive pct = got worse (more renders / slower). Negative = got better; not an alert.
      const pct = (lv - bv) / bv
      if (pct > DRIFT_THRESHOLD) {
        drifts.push({ library: lr.library, surface, metric, baselineVal: bv, latestVal: lv, pct })
      }
    }
  }
}

if (!drifts.length) {
  console.log('[post-drift] no competitor drift detected')
  process.exit(0)
}

console.log(`[post-drift] ${drifts.length} drift(s) detected`)

if (!token || !repo) {
  console.warn('[post-drift] GH_TOKEN or GITHUB_REPOSITORY not set; skipping issue post')
  process.exit(0)
}

const rows = drifts.map(d => {
  const unit = d.metric === 'renderCount' ? 'renders' : 'ms'
  return `| ${d.library} | ${d.surface} | ${d.metric} | ${d.baselineVal.toFixed(1)} ${unit} | ${d.latestVal.toFixed(1)} ${unit} | ⬆️ ${(d.pct * 100).toFixed(1)}% |`
}).join('\n')

const body = [
  '## Competitor Benchmark Drift Detected',
  '',
  'Weekly run detected a competitor regression >20% vs. committed baseline.',
  'This may indicate a competitor released a new version with perf changes.',
  '',
  '| Library | Surface | Metric | Baseline | Weekly | Change |',
  '|---|---|---|---|---|---|',
  rows,
  '',
  `Baseline: ${baseline.meta.neutroVersion} (${baseline.meta.generatedAt.slice(0, 10)})`,
  `Weekly: ${latest.meta.generatedAt.slice(0, 10)}`,
].join('\n')

const searchRes = await fetch(
  `https://api.github.com/repos/${repo}/issues?labels=benchmark-drift&state=open`,
  { headers: { Authorization: `Bearer ${token}` } }
)
if (!searchRes.ok) {
  console.error(`[post-drift] GitHub API error ${searchRes.status}: ${await searchRes.text()}`)
  process.exit(1)
}
const openIssues = await searchRes.json() as any[]

if (openIssues.length > 0) {
  await fetch(`https://api.github.com/repos/${repo}/issues/${openIssues[0].number}/comments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  console.log(`[post-drift] updated issue #${openIssues[0].number}`)
} else {
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Competitor benchmark drift detected', body, labels: ['benchmark-drift'] }),
  })
  const issue = await res.json() as any
  console.log(`[post-drift] opened issue #${issue.number}`)
}
```

- [ ] **Step 4: Final full run**

```bash
cd bench && pnpm bench:full
```

Expected: all steps complete, `docs/benchmarks/index.md` is updated with real browser results for all 9 library+framework combinations.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ bench/scripts/post-drift-issue.ts
git commit -m "bench: update CI workflows for browser-first Surface A benchmark"
```
