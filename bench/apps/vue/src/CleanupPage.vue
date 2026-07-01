<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { createForm } from '@neutro/form-core'

const FIELD_NAMES = Array.from({ length: 50 }, (_, i) => `f${i}`)
const cleanupForm = createForm({
  initialValues: Object.fromEntries(FIELD_NAMES.map(n => [n, ''])),
})
;(window as any).__getConnectedCount = () => cleanupForm.getConnectedCount()

const mounted = ref(true)
let batch = 0
let timer: ReturnType<typeof setTimeout>

const disconnectFns = new Map<string, () => void>()

function connectField(el: HTMLInputElement | null, name: string) {
  if (el) {
    disconnectFns.set(name, cleanupForm.connect(name as any, el))
  }
}

function disconnectAll() {
  for (const fn of disconnectFns.values()) fn()
  disconnectFns.clear()
}

function tick() {
  if (mounted.value) {
    // Unmount and count this cycle. Batch is incremented on unmount (not remount) so
    // that once batch reaches the limit, the fields stay unmounted/disconnected —
    // otherwise the loop would remount one final time and never disconnect it.
    timer = setTimeout(() => {
      disconnectAll()
      mounted.value = false
      batch++
      if (batch >= 10) {
        ;(window as any).__cleanupDone = true
        return
      }
      timer = setTimeout(tick, 20)
    }, 20)
  } else {
    timer = setTimeout(() => {
      mounted.value = true
      timer = setTimeout(tick, 20)
    }, 20)
  }
}

onMounted(tick)
onUnmounted(() => clearTimeout(timer))
</script>

<template>
  <div v-if="mounted">
    <input
      v-for="name in FIELD_NAMES"
      :key="name"
      :data-testid="`cleanup-${name}`"
      :ref="(el) => connectField(el as HTMLInputElement, name)"
    />
  </div>
  <div v-else data-testid="cleanup-unmounted" />
</template>
