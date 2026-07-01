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
    if (mounted) {
      // Unmount and count this cycle. Batch is incremented on unmount (not remount) so
      // that once batch reaches the limit, the fields stay unmounted/disconnected —
      // otherwise the loop would remount one final time and never disconnect it.
      timer = setTimeout(() => {
        mounted = false
        batch++
        if (batch >= 10) {
          ;(window as any).__cleanupDone = true
          return
        }
        timer = setTimeout(tick, 20)
      }, 20)
    } else {
      timer = setTimeout(() => {
        mounted = true
        timer = setTimeout(tick, 20)
      }, 20)
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
