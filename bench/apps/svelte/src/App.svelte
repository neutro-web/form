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
  import NeutroCancelPage from './NeutroCancelPage.svelte'
  import TanStackCancelPage from './TanStackCancelPage.svelte'
  import FelteCancelPage from './FelteCancelPage.svelte'

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
    initialValues: Object.fromEntries(FIELDS.map((n) => [n, ''])),
  })

  const tsForm = createTsForm(() => ({
    defaultValues: Object.fromEntries(FIELDS.map((n) => [n, ''])),
  }))

  const { form: felteAction, data: felteData, setFields } = createFelteForm({
    initialValues: Object.fromEntries(FIELDS.map((n) => [n, ''])),
  })
</script>

{#if path === '/async/neutro'}
  <NeutroAsyncPage />
{:else if path === '/async/tanstack'}
  <TanStackAsyncPage />
{:else if path === '/async/felte'}
  <FelteAsyncPage />
{:else if path === '/cancel/neutro'}
  <NeutroCancelPage />
{:else if path === '/cancel/tanstack'}
  <TanStackCancelPage />
{:else if path === '/cancel/felte'}
  <FelteCancelPage />
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
        <FelteField {name} data={felteData} renders={felteRenders} {setFields} />
      {/each}
    </section>
  </form>
{/if}
