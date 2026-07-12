<script lang="ts">
  import { onDestroy } from 'svelte'
  import { createForm } from '@neutro/form-core'
  import { useSvelteFormPath } from '@neutro/form-svelte'

  const debounce = new URLSearchParams(window.location.search).get('debounce') === '0'

  const asyncForm = createForm({
    initialValues: { email: '' },
    asyncDebounceMs: debounce ? 0 : 300,
    validator: async (values: any, _scope: any, signal: any): Promise<Record<string, string>> => {
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
