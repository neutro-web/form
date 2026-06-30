<script lang="ts">
  import type { FormInstance } from '@neutro/form-core'
  import { useSvelteFormPath } from '@neutro/form-svelte'

  const {
    form,
    name,
    renders,
  }: {
    form: FormInstance<Record<string, string>>
    name: string
    renders: Record<string, number>
  } = $props()

  const field = useSvelteFormPath(form, name)

  $effect.pre(() => {
    void $field.value
    renders[name] = (renders[name] ?? 0) + 1
  })
</script>

<input
  data-testid={`neutro-${name}`}
  value={$field.value as string}
  oninput={(e) => form.set(name as any, (e.target as HTMLInputElement).value)}
/>
