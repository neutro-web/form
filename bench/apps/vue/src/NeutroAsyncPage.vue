<script setup lang="ts">
import { ref, onUnmounted, computed } from 'vue'
import { createForm } from '@neutro/form-core'
import { useVueFormPath } from '@neutro/form-vue'

const debounce = computed(() => new URLSearchParams(window.location.search).get('debounce') === '0')

const asyncForm = createForm({
  initialValues: { email: '' },
  asyncDebounceMs: debounce.value ? 0 : 300,
  validator: async (values, _scope, signal) => {
    ;(window as any).__asyncValidationStart = performance.now()
    await new Promise(r => setTimeout(r, 200))
    if (signal?.aborted) return {}
    if (!String(values.email).includes('@')) return { email: 'Invalid email' }
    return {}
  },
  validationMode: 'onChange',
})

const { value: emailValue } = useVueFormPath(asyncForm, 'email')
const error = ref('')
const unsubscribe = asyncForm.subscribe(state => {
  const e = state.errors['email']
  if (e && !error.value) {
    ;(window as any).__asyncValidationEnd = performance.now()
  }
  error.value = e ?? ''
})
onUnmounted(unsubscribe)
</script>

<template>
  <div>
    <input
      data-testid="async-email"
      :value="emailValue as string"
      @input="(e) => asyncForm.set('email', (e.target as HTMLInputElement).value, { validate: true })"
    />
    <span v-if="error" data-testid="async-error">{{ error }}</span>
  </div>
</template>
