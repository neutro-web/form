<!-- bench/apps/svelte/src/DependencyChainNeutro.svelte -->
<script lang="ts">
  import { createForm } from '@neutro/form-core'

  const FIELD_COUNT = 200
  const FIELDS = Array.from({ length: FIELD_COUNT }, (_, i) => `f${i}`)

  const neutroChainValidations: Record<string, number> = {}
  ;(window as any).__neutroChainValidations = neutroChainValidations

  const dependencies = Object.fromEntries(
    Array.from({ length: FIELD_COUNT - 1 }, (_, i) => [`f${i}`, [`f${i + 1}`]]),
  )

  function chainValidator(values: Record<string, string>, scope: string[] = []) {
    const errors: Record<string, string> = {}
    for (const path of scope) {
      neutroChainValidations[path] = (neutroChainValidations[path] ?? 0) + 1
      const i = Number(path.slice(1))
      if (i === 0) continue
      if (values[path] === values[`f${i - 1}`]) {
        errors[path] = 'must differ from previous field'
      }
    }
    return errors
  }

  const form = createForm({
    initialValues: Object.fromEntries(FIELDS.map((name, i) => [name, String(i)])),
    dependencies,
    validator: chainValidator,
  })
  let state = $state(form.getState())
  form.subscribe((s) => { state = s })

  function onFieldInput(name: string, value: string) {
    if (name === 'f0') {
      form.set(name as any, value, { validate: true })
    } else {
      form.set(name as any, value)
    }
  }
</script>

<section data-testid="neutro-chain-form">
  {#each FIELDS as name}
    <input
      data-testid={`neutro-field-${name}`}
      value={state.values[name]}
      oninput={(e) => onFieldInput(name, (e.target as HTMLInputElement).value)}
    />
  {/each}
</section>
