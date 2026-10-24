<script lang="ts">
  import { alerts, bridge } from '@capsule/core'

  let tab = 'home'
  let rpcResult = ''
  let pingResult = ''

  function clearResults() {
    rpcResult = ''
    pingResult = ''
  }

  function sayHello() {
    alerts.show({ title: 'Hello from Capsule!', message: 'Native integration is working.', style: { accentColor: '#0a84ff', cornerRadius: 20 } })
  }

  async function callHello() {
    try {
      const res = await bridge.call('hello', { name: 'World' })
      rpcResult = res.message
    } catch (e) {
      rpcResult = e instanceof Error ? e.message : String(e)
    }
  }

  async function callPing() {
    try {
      const res = await fetch('/api/ping')
      const data = await res.json()
      pingResult = JSON.stringify(data)
    } catch (e) {
      pingResult = e instanceof Error ? e.message : String(e)
    }
  }
</script>

<div class="shell">
  <header class="header">
    <div class="header-icon">⚡</div>
    <span class="header-name">Capsule</span>
  </header>

  <main class="main">
    {#if tab === 'home'}
      <div class="card">
        <span class="card-badge">Svelte + TypeScript</span>
        <h1 class="card-title">Welcome to<br /><span>Capsule</span></h1>
        <p class="card-desc">Your app is ready.<br />Tap below to test native integration.</p>
        <button class="btn" onclick={sayHello}>Say Hello</button>
      </div>
    {:else}
      <div class="card">
        <span class="card-badge">Server Routes</span>
        <h2 class="card-title"><span>API</span></h2>
        <p class="card-desc">Backed by QuickJS on device,<br />Node.js in dev mode.</p>
        <button class="btn" onclick={callHello}>Call hello route</button>
        <p class="result">{rpcResult}</p>
        <button class="btn" style="margin-top:10px" onclick={callPing}>GET /api/ping</button>
        <p class="result">{pingResult}</p>
        {#if rpcResult || pingResult}
          <button class="btn btn-clear" onclick={clearResults}>Clear</button>
        {/if}
      </div>
    {/if}
  </main>

  <nav class="tab-bar">
    <button class="tab {tab === 'home' ? 'active' : ''}" onclick={() => tab = 'home'}>
      <span class="tab-icon">⌂</span>
      <span class="tab-label">Home</span>
    </button>
    <button class="tab {tab === 'server' ? 'active' : ''}" onclick={() => tab = 'server'}>
      <span class="tab-icon">⚡</span>
      <span class="tab-label">Server</span>
    </button>
  </nav>
</div>

