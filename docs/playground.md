---
layout: false
---

<script setup>
import { onMounted } from 'vue'
onMounted(() => {
  location.replace(location.origin + '/agw-form/playground.html')
})
</script>

<template>
  <div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#8b949e;background:#0d1117;">
    <div style="text-align:center;">
      <div style="font-size:14px;margin-bottom:12px;">Loading playground…</div>
      <a href="/agw-form/playground.html" style="color:#58a6ff;font-size:13px;">Click here if not redirected</a>
    </div>
  </div>
</template>
