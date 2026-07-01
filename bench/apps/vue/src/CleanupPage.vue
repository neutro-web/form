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

function tick() {
  if (batch >= 10) {
    ;(window as any).__cleanupDone = true
    return
  }
  if (mounted.value) {
    timer = setTimeout(() => { mounted.value = false; timer = setTimeout(tick, 20) }, 20)
  } else {
    batch++
    mounted.value = true
    timer = setTimeout(tick, 20)
  }
}

onMounted(tick)
onUnmounted(() => clearTimeout(timer))

function connectField(el: HTMLInputElement | null, name: string) {
  if (el) cleanupForm.connect(name as any, el)
}
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
