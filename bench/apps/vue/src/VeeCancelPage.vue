<script setup lang="ts">
import { useField, useForm } from 'vee-validate'

function cancellationDelay(value: string): number {
  return value.includes('slow') ? 600 : 100
}

useForm()
const { value, errorMessage, handleChange } = useField<string>('email', async (val) => {
  await new Promise(r => setTimeout(r, cancellationDelay(val)))
  if (!String(val).includes('@')) return 'Invalid email'
  return true
})
</script>

<template>
  <div>
    <input
      data-testid="async-email"
      :value="value"
      @input="(e) => handleChange((e.target as HTMLInputElement).value)"
    />
    <span v-if="errorMessage" data-testid="async-error">{{ errorMessage }}</span>
  </div>
</template>
