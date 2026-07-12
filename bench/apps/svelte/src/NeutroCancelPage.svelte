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
    validator: async (values: any, _scope: any, signal: any): Promise<Record<string, string>> => {
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
