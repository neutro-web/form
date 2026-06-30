<script lang="ts">
  import type { Writable } from 'svelte/store'

  const {
    name,
    data,
    renders,
    setFields,
  }: {
    name: string
    data: Writable<Record<string, string>>
    renders: Record<string, number>
    setFields: (path: string, value: string) => void
  } = $props()

  $effect.pre(() => {
    void $data[name]
    renders[name] = (renders[name] ?? 0) + 1
  })
</script>

<input
  data-testid={`felte-${name}`}
  value={$data[name] ?? ''}
  oninput={(e) => setFields(name, (e.target as HTMLInputElement).value)}
/>
