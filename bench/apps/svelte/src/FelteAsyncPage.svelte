<script lang="ts">
  import { createForm } from 'felte'

  let error = $state('')

  const { form: formAction, data, errors } = createForm({
    initialValues: { email: '' },
    validate: async (values: Record<string, string>) => {
      ;(window as any).__asyncValidationStart = performance.now()
      await new Promise((r) => setTimeout(r, 200))
      const errs: Record<string, string[] | null> = {}
      if (!String(values.email).includes('@')) {
        errs.email = ['Invalid email']
        return errs
      }
      return errs
    },
  })

  errors.subscribe((e: any) => {
    // felte errors per-field are string[] | null
    const msgs: string[] | null = e?.email ?? null
    const msg = msgs?.[0] ?? ''
    if (msg && !error) {
      ;(window as any).__asyncValidationEnd = performance.now()
    }
    error = msg
  })
</script>

<form use:formAction>
  <input data-testid="async-email" name="email" value={$data.email ?? ''} />
  {#if error}
    <span data-testid="async-error">{error}</span>
  {/if}
</form>
