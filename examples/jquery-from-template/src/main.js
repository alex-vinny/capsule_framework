import $ from 'jquery'
import 'bootstrap/dist/css/bootstrap.min.css'
import { alerts, bridge } from '@capsule/core'

function switchTab(name) {
  $('.tab').removeClass('active')
  $('.tab-panel').removeClass('active')
  $('#tab-' + name).addClass('active')
  $('#panel-' + name).addClass('active')
}

$('#tab-home').on('click', () => switchTab('home'))
$('#tab-server').on('click', () => switchTab('server'))

$('#btn-hello').on('click', () => {
  alerts.show({
    title: 'Hello from Capsule!',
    message: 'Native integration is working.',
    style: { accentColor: '#0a84ff', cornerRadius: 20 },
  })
})

$('#btn-rpc').on('click', async () => {
  try {
    const res = await bridge.call('hello', { name: 'World' })
    $('#rpc-result').text(res.message)
  } catch (e) {
    $('#rpc-result').text(e instanceof Error ? e.message : String(e))
  }
  $('#btn-clear').show()
})

$('#btn-ping').on('click', async () => {
  try {
    const res = await fetch('/api/ping')
    const data = await res.json()
    $('#ping-result').text(JSON.stringify(data))
  } catch (e) {
    $('#ping-result').text(e instanceof Error ? e.message : String(e))
  }
  $('#btn-clear').show()
})

$('#btn-clear').on('click', () => {
  $('#rpc-result').text('')
  $('#ping-result').text('')
  $('#btn-clear').hide()
})
