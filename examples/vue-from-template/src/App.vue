<script setup lang="ts">
import { ref } from 'vue'
import { alerts, bridge } from '@capsule/core'

const tab = ref('home')
const rpcResult = ref('')
const pingResult = ref('')

function sayHello() {
  alerts.show({
    title: 'Hello from Capsule!',
    message: 'Native integration is working.',
    style: { accentColor: '#0a84ff', cornerRadius: 20 },
  })
}

async function callHello() {
  try {
    const res = await bridge.call('hello', { name: 'World' })
    rpcResult.value = res.message
  } catch (e) {
    rpcResult.value = e instanceof Error ? e.message : String(e)
  }
}

async function callPing() {
  try {
    const res = await fetch('/api/ping')
    const data = await res.json()
    pingResult.value = JSON.stringify(data)
  } catch (e) {
    pingResult.value = e instanceof Error ? e.message : String(e)
  }
}

function clearResults() {
  rpcResult.value = ''
  pingResult.value = ''
}
</script>

<template>
  <div class="shell">
    <header class="header">
      <div class="header-icon">⚡</div>
      <span class="header-name">Capsule</span>
    </header>

    <main class="main">
      <div v-if="tab === 'home'" class="card">
        <span class="card-badge">Vue + TypeScript</span>
        <h1 class="card-title">Welcome to<br /><span>Capsule</span></h1>
        <p class="card-desc">Your app is ready.<br />Tap below to test native integration.</p>
        <button class="btn" @click="sayHello">Say Hello</button>
      </div>

      <div v-else class="card">
        <span class="card-badge">Server Routes</span>
        <h2 class="card-title"><span>API</span></h2>
        <p class="card-desc">Backed by QuickJS on device,<br />Node.js in dev mode.</p>
        <button class="btn" @click="callHello">Call hello route</button>
        <p class="result">{{ rpcResult }}</p>
        <button class="btn" style="margin-top: 10px" @click="callPing">GET /api/ping</button>
        <p class="result">{{ pingResult }}</p>
        <button v-if="rpcResult || pingResult" class="btn btn-clear" @click="clearResults">
          Clear
        </button>
      </div>
    </main>

    <nav class="tab-bar">
      <button :class="['tab', tab === 'home' ? 'active' : '']" @click="tab = 'home'">
        <span class="tab-icon">⌂</span>
        <span class="tab-label">Home</span>
      </button>
      <button :class="['tab', tab === 'server' ? 'active' : '']" @click="tab = 'server'">
        <span class="tab-icon">⚡</span>
        <span class="tab-label">Server</span>
      </button>
    </nav>
  </div>
</template>
