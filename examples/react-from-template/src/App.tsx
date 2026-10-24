import { useState } from 'react'
import { alerts, bridge } from '@capsule/core'
import './App.css'

function sayHello() {
  alerts.show({
    title: 'Hello from Capsule!',
    message: 'Native integration is working.',
    style: { accentColor: '#0a84ff', cornerRadius: 20 },
  })
}

export default function App() {
  const [tab, setTab] = useState('home')
  const [rpcResult, setRpcResult] = useState('')
  const [pingResult, setPingResult] = useState('')

  async function callHello() {
    try {
      const res = await bridge.call('hello', { name: 'World' })
      setRpcResult(res.message)
    } catch (e) {
      setRpcResult(e instanceof Error ? e.message : String(e))
    }
  }

  async function callPing() {
    try {
      const res = await fetch('/api/ping')
      const data = await res.json()
      setPingResult(JSON.stringify(data))
    } catch (e) {
      setPingResult(e instanceof Error ? e.message : String(e))
    }
  }

  function clearResults() {
    setRpcResult('')
    setPingResult('')
  }

  return (
    <div className="shell">
      <header className="header">
        <div className="header-icon">⚡</div>
        <span className="header-name">Capsule</span>
      </header>

      <main className="main">
        {tab === 'home' && (
          <div className="card">
            <span className="card-badge">React + TypeScript</span>
            <h1 className="card-title">
              Welcome to
              <br />
              <span>Capsule</span>
            </h1>
            <p className="card-desc">
              Your app is ready to run.
              <br />
              Tap below to test native integration.
            </p>
            <button className="btn" onClick={sayHello}>
              Say Hello
            </button>
          </div>
        )}

        {tab === 'server' && (
          <div className="card">
            <span className="card-badge">Server Routes</span>
            <h2 className="card-title">
              <span>API</span>
            </h2>
            <p className="card-desc">
              Backed by QuickJS on device,
              <br />
              Node.js in dev mode.
            </p>
            <button className="btn" onClick={callHello}>
              Call hello route
            </button>
            <p className="result">{rpcResult}</p>
            <button className="btn" style={{ marginTop: 10 }} onClick={callPing}>
              GET /api/ping
            </button>
            <p className="result">{pingResult}</p>
            {(rpcResult || pingResult) && (
              <button className="btn btn-clear" style={{ marginTop: 10 }} onClick={clearResults}>
                Clear
              </button>
            )}
          </div>
        )}
      </main>

      <nav className="tab-bar">
        <button className={`tab${tab === 'home' ? ' active' : ''}`} onClick={() => setTab('home')}>
          <span className="tab-icon">⌂</span>
          <span className="tab-label">Home</span>
        </button>
        <button
          className={`tab${tab === 'server' ? ' active' : ''}`}
          onClick={() => setTab('server')}
        >
          <span className="tab-icon">⚡</span>
          <span className="tab-label">Server</span>
        </button>
      </nav>
    </div>
  )
}
