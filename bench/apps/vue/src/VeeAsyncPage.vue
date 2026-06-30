<script setup lang="ts">
import { watch } from 'vue'
import { useField, useForm } from 'vee-validate'

useForm()
const { value, errorMessage, handleChange } = useField<string>('email', async (val) => {
  ;(window as any).__asyncValidationStart = performance.now()
  await new Promise(r => setTimeout(r, 200))
  if (!String(val).includes('@')) return 'Invalid email'
  return true
})

watch(errorMessage, (val) => {
  if (val) (window as any).__asyncValidationEnd = performance.now()
})
</script>

<template>
  <div>
    <input
      data-testid="async-email"
      :value="value"
      @input="(e) => handleChange((e.target as HTMLInputElement).value)"
    />
    <span
      v-if="errorMessage"
      data-testid="async-error"
    >
      {{ errorMessage }}
    </span>
  </div>
</template>
