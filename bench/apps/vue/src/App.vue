<script setup lang="ts">
import { createForm } from '@neutro/form-core'
import { useForm as useVeeForm } from 'vee-validate'
import NeutroField from './NeutroField.vue'
import VeeField from './VeeField.vue'
import NeutroAsyncPage from './NeutroAsyncPage.vue'
import VeeAsyncPage from './VeeAsyncPage.vue'
import NeutroCancelPage from './NeutroCancelPage.vue'
import VeeCancelPage from './VeeCancelPage.vue'

const path = window.location.pathname

// ---- Re-renders page setup ----
const FIELD_COUNT = Number(new URLSearchParams(window.location.search).get('fields')) || 10
const FIELD_NAMES = Array.from({ length: FIELD_COUNT }, (_, i) => `field${i}`)

const neutroForm = createForm({
  initialValues: Object.fromEntries(FIELD_NAMES.map(n => [n, ''])),
})
const neutroRenders: Record<string, number> = {}
;(window as any).__neutroRenders = neutroRenders

const veeRenders: Record<string, number> = {}
;(window as any).__veeRenders = veeRenders

;(window as any).__resetRenders = () => {
  for (const k in neutroRenders) neutroRenders[k] = 0
  for (const k in veeRenders) veeRenders[k] = 0
}

// Vee-Validate requires useForm() to establish the provide/inject form context.
// Must be called unconditionally — composables cannot be conditional in <script setup>.
// On async pages the context goes unused but causes no harm.
useVeeForm()
</script>

<template>
  <!-- Async pages -->
  <NeutroAsyncPage v-if="path === '/async/neutro'" />
  <VeeAsyncPage v-else-if="path === '/async/vee'" />
  <NeutroCancelPage v-else-if="path === '/cancel/neutro'" />
  <VeeCancelPage v-else-if="path === '/cancel/vee'" />

  <!-- Re-renders page -->
  <div v-else>
    <section data-testid="neutro-form">
      <NeutroField
        v-for="name in FIELD_NAMES"
        :key="name"
        :form="neutroForm"
        :name="name"
        :renders="neutroRenders"
      />
    </section>
    <section data-testid="vee-form">
      <VeeField
        v-for="name in FIELD_NAMES"
        :key="name"
        :name="name"
        :renders="veeRenders"
      />
    </section>
  </div>
</template>
