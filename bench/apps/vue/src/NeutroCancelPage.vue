<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { createForm } from '@neutro/form-core'
import { useVueFormPath } from '@neutro/form-vue'

function cancellationDelay(value: string): number {
  return value.includes('slow') ? 600 : 100
}

const cancelForm = createForm({
  initialValues: { email: '' },
  asyncDebounceMs: 0,
  validator: async (values, _scope, signal) => {
    await new Promise(r => setTimeout(r, cancellationDelay(values.email)))
    if (signal?.aborted) return {}
    if (!String(values.email).includes('@')) return { email: 'Invalid email' }
    return {}
  },
  validationMode: 'onChange',
})

const { value: emailValue } = useVueFormPath(cancelForm, 'email')
const error = ref('')
const unsubscribe = cancelForm.subscribe(state => {
  error.value = state.errors['email'] ?? ''
})
onUnmounted(unsubscribe)
</script>

<template>
  <div>
    <input
      data-testid="async-email"
      :value="emailValue as string"
      @input="(e) => cancelForm.set('email', (e.target as HTMLInputElement).value, { validate: true })"
    />
    <span v-if="error" data-testid="async-error">{{ error }}</span>
  </div>
</template>
