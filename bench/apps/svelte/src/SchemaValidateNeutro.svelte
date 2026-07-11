<script lang="ts">
  import { createForm, zodAdapter } from '@neutro/form-core'
  import NeutroField from './NeutroField.svelte'
  import { zodSmallSchema, FIELDS, initialValues } from './schemaValidateSchema.js'

  const neutroSchemaRenders: Record<string, number> = {}
  ;(window as any).__neutroSchemaRenders = neutroSchemaRenders

  const mode = new URLSearchParams(window.location.search).get('mode') ?? 'onSubmit'
  const form = createForm({
    initialValues,
    validator: zodAdapter(zodSmallSchema),
    validationMode: mode === 'onChange' ? 'onChange' : 'onSubmitOnly',
  })
  let state = $state(form.getState())
  form.subscribe((s) => { state = s })
</script>

<section data-testid="neutro-schema-form">
  {#each FIELDS as name}
    <NeutroField {form} {name} renders={neutroSchemaRenders} />
  {/each}
  <button data-testid="neutro-submit" onclick={() => form.validate()}>Submit</button>
  <div data-testid="neutro-error" style:display={state.errors.field0 ? 'block' : 'none'}>
    {state.errors.field0}
  </div>
</section>
