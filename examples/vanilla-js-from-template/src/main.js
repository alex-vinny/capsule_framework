import './capsule-ui.css'
import { alerts, bridge } from '@capsule/core'

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'))
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'))
  document.getElementById('tab-' + name).classList.add('active')
  document.getElementById('panel-' + name).classList.add('active')
}

document.getElementById('tab-home').addEventListener('click', () => switchTab('home'))
document.getElementById('tab-server').addEventListener('click', () => switchTab('server'))

document.getElementById('btn-hello').addEventListener('click', () => {
  alerts.show({
    title: 'Hello from Capsule!',
    message: 'Native integration is working.',
    style: { accentColor: '#0a84ff', cornerRadius: 20 },
  })
})

document.getElementById('btn-rpc').addEventListener('click', async () => {
  const el = document.getElementById('rpc-result')
  try {
    const res = await bridge.call('hello', { name: 'World' })
    el.textContent = res.message
  } catch (e) {
    el.textContent = e instanceof Error ? e.message : String(e)
  }
  document.getElementById('btn-clear').hidden = false
})

document.getElementById('btn-ping').addEventListener('click', async () => {
  const el = document.getElementById('ping-result')
  try {
    const res = await fetch('/api/ping')
    const data = await res.json()
    el.textContent = JSON.stringify(data)
  } catch (e) {
    el.textContent = e instanceof Error ? e.message : String(e)
  }
  document.getElementById('btn-clear').hidden = false
})

document.getElementById('btn-clear').addEventListener('click', () => {
  document.getElementById('rpc-result').textContent = ''
  document.getElementById('ping-result').textContent = ''
  document.getElementById('btn-clear').hidden = true
})
