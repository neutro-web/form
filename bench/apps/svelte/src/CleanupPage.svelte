<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { createForm } from '@neutro/form-core'

  const FIELD_NAMES = Array.from({ length: 50 }, (_, i) => `f${i}`)
  const cleanupForm = createForm({
    initialValues: Object.fromEntries(FIELD_NAMES.map((n) => [n, ''])),
  })
  ;(window as any).__getConnectedCount = () => cleanupForm.getConnectedCount()

  let mounted = $state(true)
  let batch = 0
  let timer: ReturnType<typeof setTimeout>

  function tick() {
    if (batch >= 10) {
      ;(window as any).__cleanupDone = true
      return
    }
    if (mounted) {
      timer = setTimeout(() => { mounted = false; timer = setTimeout(tick, 20) }, 20)
    } else {
      batch++
      mounted = true
      timer = setTimeout(tick, 20)
    }
  }

  onMount(tick)
  onDestroy(() => clearTimeout(timer))

  function connectAction(node: HTMLInputElement, name: string) {
    const disconnect = cleanupForm.connect(name as any, node)
    return { destroy: disconnect }
  }
</script>

{#if mounted}
  <div>
    {#each FIELD_NAMES as name}
      <input data-testid={`cleanup-${name}`} use:connectAction={name} />
    {/each}
  </div>
{:else}
  <div data-testid="cleanup-unmounted"></div>
{/if}
