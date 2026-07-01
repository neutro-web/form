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
