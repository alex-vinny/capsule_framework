import { createSignal, onMount, onCleanup, For, Show } from 'solid-js'
import { geolocation, device, haptics, clipboard, storage, alerts, bridge } from '@capsule/core'
import type { DeviceInfo, HapticStyle, AlertStyle } from '@capsule/core'

type Preset = 'default' | 'dark' | 'brand' | 'warning'

const PRESETS: Record<Preset, AlertStyle | undefined> = {
  default: undefined,
  dark: {
    backgroundColor: '#1C1C1E',
    titleColor: '#FFFFFF',
    titleSize: 17,
    messageColor: '#EBEBF5',
    messageSize: 14,
    accentColor: '#0A84FF',
    cornerRadius: 16,
    buttonAllCaps: false,
    dimAmount: 0.8,
  },
  brand: { accentColor: '#34C759', cornerRadius: 20, buttonAllCaps: false },
  warning: { accentColor: '#FF9500', titleColor: '#FF9500', titleSize: 16, dimAmount: 0.6 },
}

const HAPTICS: HapticStyle[] = [
  'light',
  'medium',
  'heavy',
  'success',
  'warning',
  'error',
  'selection',
]

export default function App() {
  const [info, setInfo] = createSignal<DeviceInfo | null>(null)
  const [preset, setPreset] = createSignal<Preset>('default')
  const [alertAct, setAlertAct] = createSignal<string | null>(null)
  const [lastHaptic, setLastHaptic] = createSignal<HapticStyle | null>(null)
  const [clipIn, setClipIn] = createSignal('')
  const [clipOut, setClipOut] = createSignal<string | null>(null)
  const [sKey, setSKey] = createSignal('greeting')
  const [sVal, setSVal] = createSignal('hello capsule')
  const [sRead, setSRead] = createSignal<string | null | undefined>(undefined)
  const [sKeys, setSKeys] = createSignal<string[] | null>(null)
  const [locVal, setLocVal] = createSignal('Getting location…')
  const [locWarn, setLocWarn] = createSignal(false)
  const [tab, setTab] = createSignal('native')
  const [rpcResult, setRpcResult] = createSignal('')
  const [pingResult, setPingResult] = createSignal('')
  let cancelled = false

  const style = () => PRESETS[preset()]

  const attempt = () => {
    geolocation
      .getCurrentPosition()
      .then((p) => {
        if (!cancelled) {
          setLocVal(`${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`)
          setLocWarn(false)
        }
      })
      .catch((e: Error) => {
        if (cancelled) return
        if (e.message === 'PERMISSION_DENIED') setTimeout(attempt, 500)
        else {
          setLocVal(`⚠ ${e.message}`)
          setLocWarn(true)
        }
      })
  }

  const callHello = async () => {
    try {
      const res = await bridge.call('hello', { name: 'World' })
      setRpcResult(res.message)
    } catch (e) {
      setRpcResult(String(e))
    }
  }
  const callPing = async () => {
    try {
      const res = await fetch('/api/ping')
      const data = await res.json()
      setPingResult(JSON.stringify(data))
    } catch (e) {
      setPingResult(String(e))
    }
  }

  onMount(() => {
    device.getInfo().then(setInfo).catch(console.error)
    attempt()
  })

  onCleanup(() => {
    cancelled = true
  })

  return (
    <>
      <header>
        <h1>Capsule</h1>
      </header>
      <main>
        <Show when={tab() === 'native'}>
          {/* Device */}
          <div class="card">
            <h2>Device</h2>
            <Show when={info()} fallback={<p class="muted">Loading…</p>}>
              {(i) => (
                <>
                  <div class="row">
                    <span class="lbl">Model</span> <span class="val">{i().model}</span>
                  </div>
                  <div class="row">
                    <span class="lbl">Manufacturer</span>{' '}
                    <span class="val">{i().manufacturer}</span>
                  </div>
                  <div class="row">
                    <span class="lbl">OS</span>{' '}
                    <span class="val">
                      Android {i().osVersion} (SDK {i().sdkVersion})
                    </span>
                  </div>
                  <div class="row">
                    <span class="lbl">Virtual</span>{' '}
                    <span class="val">{String(i().isVirtual)}</span>
                  </div>
                  <div class="row">
                    <span class="lbl">WebView</span>{' '}
                    <span class="val">{i().webViewVersion ?? '—'}</span>
                  </div>
                </>
              )}
            </Show>
          </div>

          {/* Alerts */}
          <div class="card">
            <h2>Alerts</h2>
            <div class="radio-row">
              <For each={['default', 'dark', 'brand', 'warning'] as Preset[]}>
                {(p) => (
                  <label>
                    <input
                      type="radio"
                      name="preset"
                      checked={preset() === p}
                      onChange={() => setPreset(p)}
                    />
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </label>
                )}
              </For>
            </div>
            <div class="btn-row">
              <button
                onClick={() =>
                  alerts
                    .show({ message: 'Hello from Capsule!', style: style() })
                    .then((r) => setAlertAct(r.action))
                }
              >
                Alert
              </button>
              <button
                onClick={() =>
                  alerts
                    .show({
                      title: 'Confirm',
                      message: 'Continue?',
                      buttons: [
                        { label: 'Cancel', role: 'cancel' },
                        { label: 'Continue', role: 'default' },
                      ],
                      style: style(),
                    })
                    .then((r) => setAlertAct(r.action))
                }
              >
                Confirm
              </button>
              <button
                class="danger"
                onClick={() =>
                  alerts
                    .show({
                      title: 'Delete item',
                      message: 'Cannot be undone.',
                      buttons: [
                        { label: 'Cancel', role: 'cancel' },
                        { label: 'Delete', role: 'destructive' },
                      ],
                      style: style(),
                    })
                    .then((r) => setAlertAct(r.action))
                }
              >
                Destructive
              </button>
            </div>
            <Show when={alertAct()}>
              <p class="status">
                Pressed: <b>{alertAct()}</b>
              </p>
            </Show>
          </div>

          {/* Haptics */}
          <div class="card">
            <h2>Haptics</h2>
            <div class="chip-row">
              <For each={HAPTICS}>
                {(s) => (
                  <button
                    class={`chip${lastHaptic() === s ? ' active' : ''}`}
                    onClick={() =>
                      haptics
                        .vibrate(s)
                        .then(() => setLastHaptic(s))
                        .catch(console.error)
                    }
                  >
                    {s}
                  </button>
                )}
              </For>
            </div>
            <Show when={lastHaptic()}>
              <p class="status">
                Last: <b>{lastHaptic()}</b>
              </p>
            </Show>
          </div>

          {/* Clipboard */}
          <div class="card">
            <h2>Clipboard</h2>
            <div class="input-row">
              <input
                type="text"
                value={clipIn()}
                onInput={(e) => setClipIn(e.currentTarget.value)}
                placeholder="Type something…"
              />
              <button
                onClick={() =>
                  clipboard
                    .write(clipIn())
                    .then(() => haptics.vibrate('light'))
                    .catch(console.error)
                }
              >
                Copy
              </button>
            </div>
            <div class="btn-row" style="margin-top:8px">
              <button
                onClick={() =>
                  clipboard
                    .read()
                    .then((v) => setClipOut(v ?? '(empty)'))
                    .catch(console.error)
                }
              >
                Paste
              </button>
              <Show when={clipOut() !== null}>
                <span class="muted">{clipOut()}</span>
              </Show>
            </div>
          </div>

          {/* Storage */}
          <div class="card">
            <h2>Storage</h2>
            <div class="input-row">
              <input
                type="text"
                value={sKey()}
                onInput={(e) => setSKey(e.currentTarget.value)}
                style="width:90px;flex:none"
              />
              <input type="text" value={sVal()} onInput={(e) => setSVal(e.currentTarget.value)} />
              <button
                onClick={() =>
                  storage
                    .set(sKey(), sVal())
                    .then(() => haptics.vibrate('light'))
                    .catch(console.error)
                }
              >
                Set
              </button>
            </div>
            <div class="btn-row" style="margin-top:8px">
              <button
                onClick={() =>
                  storage
                    .get(sKey())
                    .then((v) => setSRead(v))
                    .catch(console.error)
                }
              >
                Get
              </button>
              <button
                onClick={() =>
                  storage
                    .remove(sKey())
                    .then(() => setSRead(undefined))
                    .catch(console.error)
                }
              >
                Remove
              </button>
              <button
                onClick={() =>
                  storage
                    .keys()
                    .then((k) => setSKeys(k))
                    .catch(console.error)
                }
              >
                Keys
              </button>
              <button
                class="danger"
                onClick={() =>
                  storage
                    .clear()
                    .then(() => {
                      setSRead(undefined)
                      setSKeys(null)
                    })
                    .catch(console.error)
                }
              >
                Clear
              </button>
            </div>
            <Show when={sRead() !== undefined}>
              <p class="status">
                Value: <b>{sRead() ?? '(null)'}</b>
              </p>
            </Show>
            <Show when={sKeys() !== null}>
              <p class="status">
                Keys: <b>{sKeys()!.length ? sKeys()!.join(', ') : '(none)'}</b>
              </p>
            </Show>
          </div>

          {/* Location */}
          <div class="card">
            <h2>Location</h2>
            <p class={locWarn() ? 'warn' : 'muted'}>{locVal()}</p>
          </div>
        </Show>

        <Show when={tab() === 'server'}>
          <div class="card">
            <h2>Server Routes</h2>
            <div class="btn-row">
              <button onClick={callHello}>Call hello route</button>
            </div>
            <Show when={!!rpcResult()}>
              <p class="status">
                Result: <b>{rpcResult()}</b>
              </p>
            </Show>
            <div class="btn-row" style="margin-top:8px">
              <button onClick={callPing}>GET /api/ping</button>
            </div>
            <Show when={!!pingResult()}>
              <p class="status">
                Result: <b>{pingResult()}</b>
              </p>
            </Show>
          </div>
        </Show>
      </main>
      <nav class="tab-bar">
        <button
          class={'tab' + (tab() === 'native' ? ' active' : '')}
          onClick={() => setTab('native')}
        >
          <span class="tab-icon">⚙</span>
          <span class="tab-label">Native</span>
        </button>
        <button
          class={'tab' + (tab() === 'server' ? ' active' : '')}
          onClick={() => setTab('server')}
        >
          <span class="tab-icon">⚡</span>
          <span class="tab-label">Server</span>
        </button>
      </nav>
    </>
  )
}
