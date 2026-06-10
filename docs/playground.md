---
layout: false
---

<script setup>
import { onMounted, ref } from 'vue'

const redirectFailed = ref(false)

onMounted(() => {
  const GUARD_KEY = '__pg_redirect__'
  if (sessionStorage.getItem(GUARD_KEY)) {
    // Already tried redirecting — SPA loop detected (dev server).
    // Clear the flag and show the manual link instead.
    sessionStorage.removeItem(GUARD_KEY)
    redirectFailed.value = true
    return
  }
  sessionStorage.setItem(GUARD_KEY, '1')
  // Full page navigation — bypasses Vue Router, loads the static file.
  location.replace(location.origin + import.meta.env.BASE_URL + 'playground.html')
})
</script>

<template>
  <div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#8b949e;background:#0d1117;">
    <div style="text-align:center;">
      <template v-if="redirectFailed">
        <div style="font-size:14px;margin-bottom:12px;">Playground must be opened directly:</div>
        <a href="/agw-form/playground.html" style="color:#58a6ff;font-size:13px;display:block;margin-bottom:8px;">
          Open playground →
        </a>
        <div style="font-size:12px;color:#484f58;">
          In dev: run <code style="background:#161b22;padding:2px 6px;border-radius:4px;">pnpm docs:dev</code> and visit
          <code style="background:#161b22;padding:2px 6px;border-radius:4px;">localhost:5173/playground.html</code>
        </div>
      </template>
      <template v-else>
        <div style="font-size:14px;margin-bottom:12px;">Loading playground…</div>
        <a href="/agw-form/playground.html" style="color:#58a6ff;font-size:13px;">Click here if not redirected</a>
      </template>
    </div>
  </div>
</template>
