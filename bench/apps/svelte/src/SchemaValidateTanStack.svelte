<script lang="ts">
  import { createForm as createTsForm } from '@tanstack/svelte-form'
  import TanStackField from './TanStackField.svelte'
  import { zodSmallSchema, FIELDS, initialValues } from './schemaValidateSchema.js'

  const tanstackSchemaRenders: Record<string, number> = {}
  ;(window as any).__tanstackSchemaRenders = tanstackSchemaRenders

  const mode = new URLSearchParams(window.location.search).get('mode') ?? 'onSubmit'
  const form = createTsForm(() => ({
    defaultValues: initialValues,
    validators: mode === 'onChange' ? { onChange: zodSmallSchema } : { onSubmit: zodSmallSchema },
  }))
</script>

<section data-testid="tanstack-schema-form">
  {#each FIELDS as name}
    <form.Field {name}>
      {#snippet children(f)}
        <TanStackField field={f} {name} renders={tanstackSchemaRenders} />
      {/snippet}
    </form.Field>
  {/each}
  <button data-testid="tanstack-submit" onclick={() => form.handleSubmit()}>Submit</button>
  <form.Field name="field0">
    {#snippet children(field0)}
      <div data-testid="tanstack-error" style:display={field0.state.meta.errors.length ? 'block' : 'none'}>
        {field0.state.meta.errors[0]?.message ?? field0.state.meta.errors[0]}
      </div>
    {/snippet}
  </form.Field>
</section>
