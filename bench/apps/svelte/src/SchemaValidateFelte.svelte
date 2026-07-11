<script lang="ts">
  import { createForm as createFelteForm } from 'felte'
  import { validator } from '@felte/validator-zod'
  import FelteField from './FelteField.svelte'
  import { zodSmallSchema, FIELDS, initialValues } from './schemaValidateSchema.js'

  const felteSchemaRenders: Record<string, number> = {}
  ;(window as any).__felteSchemaRenders = felteSchemaRenders

  const { form: felteAction, data, errors, setFields } = createFelteForm({
    initialValues,
    extend: validator({ schema: zodSmallSchema }),
  })
</script>

<form use:felteAction>
  <section data-testid="felte-schema-form">
    {#each FIELDS as name}
      <FelteField {name} {data} renders={felteSchemaRenders} {setFields} />
    {/each}
    <button data-testid="felte-submit" type="submit">Submit</button>
    <div data-testid="felte-error" style:display={$errors.field0 ? 'block' : 'none'}>
      {$errors.field0}
    </div>
  </section>
</form>
