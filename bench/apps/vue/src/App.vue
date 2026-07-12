<script setup lang="ts">
import { createForm } from '@neutro/form-core'
import { useForm as useVeeForm } from 'vee-validate'
import NeutroField from './NeutroField.vue'
import VeeField from './VeeField.vue'
import NeutroAsyncPage from './NeutroAsyncPage.vue'
import VeeAsyncPage from './VeeAsyncPage.vue'
import NeutroCancelPage from './NeutroCancelPage.vue'
import VeeCancelPage from './VeeCancelPage.vue'
import NeutroArraySection from './NeutroArraySection.vue'
import VeeArraySection from './VeeArraySection.vue'
import CleanupPage from './CleanupPage.vue'
import SchemaValidateNeutro from './SchemaValidateNeutro.vue'
import SchemaValidateVee from './SchemaValidateVee.vue'
import DependencyChainNeutro from './DependencyChainNeutro.vue'
import DependencyChainVee from './DependencyChainVee.vue'

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
  // The schema-validate routes' own components (SchemaValidateNeutro.vue/SchemaValidateVee.vue)
  // create and own their counter objects, assigning them directly to
  // window.__neutroSchemaRenders/__veeSchemaRenders when mounted -- App.vue must never declare
  // its own local copies here (a prior version did, and __resetRenders zeroed that orphaned local
  // object instead of the live one the fields/spec actually read, silently leaking ~10 mount-time
  // increments across every reset). Read back off window with a guard, since these only exist
  // once the corresponding route has mounted.
  const schemaNeutro = (window as any).__neutroSchemaRenders
  if (schemaNeutro) for (const k in schemaNeutro) schemaNeutro[k] = 0
  const schemaVee = (window as any).__veeSchemaRenders
  if (schemaVee) for (const k in schemaVee) schemaVee[k] = 0
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
  <CleanupPage v-else-if="path === '/cleanup'" />

  <div v-else-if="path === '/array'">
    <NeutroArraySection />
    <VeeArraySection />
  </div>

  <SchemaValidateNeutro v-else-if="path === '/schema-validate/neutro'" />
  <SchemaValidateVee v-else-if="path === '/schema-validate/vee'" />

  <DependencyChainNeutro v-else-if="path === '/dependency-chain/neutro'" />
  <DependencyChainVee v-else-if="path === '/dependency-chain/vee'" />

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
