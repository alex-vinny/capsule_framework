import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
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

@customElement('capsule-app')
export class CapsuleApp extends LitElement {
  static styles = css`
    *,
    *::before,
    *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      background: #f2f2f7;
      color: #1c1c1e;
    }
    .header {
      background: #fff;
      border-bottom: 1px solid #e5e5ea;
      padding: 16px 20px;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .header h1 {
      font-size: 17px;
      font-weight: 600;
    }
    main {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      max-width: 480px;
      margin: 0 auto;
      width: 100%;
    }
    .card {
      background: #fff;
      border-radius: 12px;
      padding: 16px;
    }
    .card h2 {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #8e8e93;
      margin-bottom: 12px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-top: 1px solid #f2f2f7;
      gap: 12px;
    }
    .row:first-child {
      border-top: none;
    }
    .lbl {
      color: #8e8e93;
      flex-shrink: 0;
    }
    .val {
      text-align: right;
      word-break: break-all;
    }
    .btn-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
    }
    button {
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid #d1d1d6;
      background: #f2f2f7;
      color: #1c1c1e;
      font-size: 14px;
      font-family: inherit;
      cursor: pointer;
    }
    button:active {
      background: #e5e5ea;
    }
    button.danger {
      background: #fff0f0;
      border-color: #ff3b30;
      color: #ff3b30;
    }
    .input-row {
      display: flex;
      gap: 8px;
      margin-top: 0;
    }
    input {
      flex: 1;
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid #d1d1d6;
      background: #f2f2f7;
      font-size: 14px;
      font-family: inherit;
      color: #1c1c1e;
      min-width: 0;
    }
    input:focus {
      outline: none;
      border-color: #007aff;
      background: #fff;
    }
    .chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chip {
      padding: 6px 14px;
      border-radius: 20px;
      border: 1px solid #d1d1d6;
      background: #f2f2f7;
      font-size: 13px;
      cursor: pointer;
    }
    .chip.active {
      background: #1c1c1e;
      color: #fff;
      border-color: #1c1c1e;
    }
    .radio-row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 10px;
    }
    .radio-row label {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 13px;
      cursor: pointer;
    }
    .status {
      font-size: 13px;
      color: #8e8e93;
      margin-top: 8px;
    }
    .status b {
      color: #1c1c1e;
    }
    .muted {
      color: #8e8e93;
    }
    .warn {
      color: #ff9500;
    }
    .tab-bar {
      display: flex;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      border-top: 1px solid rgba(0, 0, 0, 0.1);
      position: sticky;
      bottom: 0;
    }
    .tab {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 8px 0 12px;
      gap: 2px;
      background: none;
      border: none;
      cursor: pointer;
      font-family: inherit;
      color: #8e8e93;
    }
    .tab.active {
      color: #007aff;
    }
    .tab-icon {
      font-size: 20px;
      line-height: 1;
      display: block;
    }
    .tab-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
  `

  @state() private _info: DeviceInfo | null = null
  @state() private _preset: Preset = 'default'
  @state() private _alertAct: string | null = null
  @state() private _lastHaptic: HapticStyle | null = null
  @state() private _clipIn = ''
  @state() private _clipOut: string | null = null
  @state() private _sKey = 'greeting'
  @state() private _sVal = 'hello capsule'
  @state() private _sRead: string | null | undefined = undefined
  @state() private _sKeys: string[] | null = null
  @state() private _locVal = 'Getting location…'
  @state() private _locWarn = false
  @state() private _tab = 'native'
  @state() private _rpcResult = ''
  @state() private _pingResult = ''
  private _cancelled = false

  connectedCallback() {
    super.connectedCallback()
    device
      .getInfo()
      .then((v) => {
        this._info = v
      })
      .catch(console.error)
    this._attempt()
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this._cancelled = true
  }

  private _attempt() {
    geolocation
      .getCurrentPosition()
      .then((p) => {
        if (!this._cancelled) {
          this._locVal = `${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`
          this._locWarn = false
        }
      })
      .catch((e: Error) => {
        if (this._cancelled) return
        if (e.message === 'PERMISSION_DENIED') setTimeout(() => this._attempt(), 500)
        else {
          this._locVal = `⚠ ${e.message}`
          this._locWarn = true
        }
      })
  }

  private get _style(): AlertStyle | undefined {
    return PRESETS[this._preset]
  }

  private async _callHello() {
    try {
      const res = await bridge.call('hello', { name: 'World' })
      this._rpcResult = res.message
    } catch (e) {
      this._rpcResult = String(e)
    }
  }

  private async _callPing() {
    try {
      const res = await fetch('/api/ping')
      const data = await res.json()
      this._pingResult = JSON.stringify(data)
    } catch (e) {
      this._pingResult = String(e)
    }
  }

  render() {
    return html`
      <div class="header"><h1>Capsule</h1></div>
      ${
        this._tab === 'native'
          ? html`<main>
              <!-- Device -->
              <div class="card">
                <h2>Device</h2>
                ${
                  this._info
                    ? html`
                        <div class="row">
                          <span class="lbl">Model</span>
                          <span class="val">${this._info.model}</span>
                        </div>
                        <div class="row">
                          <span class="lbl">Manufacturer</span>
                          <span class="val">${this._info.manufacturer}</span>
                        </div>
                        <div class="row">
                          <span class="lbl">OS</span>
                          <span class="val"
                            >Android ${this._info.osVersion} (SDK ${this._info.sdkVersion})</span
                          >
                        </div>
                        <div class="row">
                          <span class="lbl">Virtual</span>
                          <span class="val">${this._info.isVirtual}</span>
                        </div>
                        <div class="row">
                          <span class="lbl">WebView</span>
                          <span class="val">${this._info.webViewVersion ?? '—'}</span>
                        </div>
                      `
                    : html`<p class="muted">Loading…</p>`
                }
              </div>

              <!-- Alerts -->
              <div class="card">
                <h2>Alerts</h2>
                <div class="radio-row">
                  ${(['default', 'dark', 'brand', 'warning'] as Preset[]).map(
                    (p) => html`
                      <label>
                        <input
                          type="radio"
                          name="preset"
                          .checked=${this._preset === p}
                          @change=${() => {
                            this._preset = p
                          }}
                        />
                        ${p.charAt(0).toUpperCase() + p.slice(1)}
                      </label>
                    `
                  )}
                </div>
                <div class="btn-row" style="margin-top:0">
                  <button
                    @click=${() =>
                      alerts
                        .show({ message: 'Hello from Capsule!', style: this._style })
                        .then((r) => {
                          this._alertAct = r.action
                        })}
                  >
                    Alert
                  </button>
                  <button
                    @click=${() =>
                      alerts
                        .show({
                          title: 'Confirm',
                          message: 'Continue?',
                          buttons: [
                            { label: 'Cancel', role: 'cancel' },
                            { label: 'Continue', role: 'default' },
                          ],
                          style: this._style,
                        })
                        .then((r) => {
                          this._alertAct = r.action
                        })}
                  >
                    Confirm
                  </button>
                  <button
                    class="danger"
                    @click=${() =>
                      alerts
                        .show({
                          title: 'Delete item',
                          message: 'Cannot be undone.',
                          buttons: [
                            { label: 'Cancel', role: 'cancel' },
                            { label: 'Delete', role: 'destructive' },
                          ],
                          style: this._style,
                        })
                        .then((r) => {
                          this._alertAct = r.action
                        })}
                  >
                    Destructive
                  </button>
                </div>
                ${this._alertAct ? html`<p class="status">Pressed: <b>${this._alertAct}</b></p>` : ''}
              </div>

              <!-- Haptics -->
              <div class="card">
                <h2>Haptics</h2>
                <div class="chip-row">
                  ${HAPTICS.map(
                    (s) => html`
                      <button
                        class="chip ${this._lastHaptic === s ? 'active' : ''}"
                        @click=${() =>
                          haptics
                            .vibrate(s)
                            .then(() => {
                              this._lastHaptic = s
                            })
                            .catch(console.error)}
                      >
                        ${s}
                      </button>
                    `
                  )}
                </div>
                ${
                  this._lastHaptic
                    ? html`<p class="status">Last: <b>${this._lastHaptic}</b></p>`
                    : ''
                }
              </div>

              <!-- Clipboard -->
              <div class="card">
                <h2>Clipboard</h2>
                <div class="input-row">
                  <input
                    .value=${this._clipIn}
                    @input=${(e: Event) => {
                      this._clipIn = (e.target as HTMLInputElement).value
                    }}
                    placeholder="Type something…"
                  />
                  <button
                    @click=${() =>
                      clipboard
                        .write(this._clipIn)
                        .then(() => haptics.vibrate('light'))
                        .catch(console.error)}
                  >
                    Copy
                  </button>
                </div>
                <div class="btn-row">
                  <button
                    @click=${() =>
                      clipboard
                        .read()
                        .then((v) => {
                          this._clipOut = v ?? '(empty)'
                        })
                        .catch(console.error)}
                  >
                    Paste
                  </button>
                  ${this._clipOut !== null ? html`<span class="muted">${this._clipOut}</span>` : ''}
                </div>
              </div>

              <!-- Storage -->
              <div class="card">
                <h2>Storage</h2>
                <div class="input-row">
                  <input
                    .value=${this._sKey}
                    @input=${(e: Event) => {
                      this._sKey = (e.target as HTMLInputElement).value
                    }}
                    style="width:90px;flex:none"
                  />
                  <input
                    .value=${this._sVal}
                    @input=${(e: Event) => {
                      this._sVal = (e.target as HTMLInputElement).value
                    }}
                  />
                  <button
                    @click=${() =>
                      storage
                        .set(this._sKey, this._sVal)
                        .then(() => haptics.vibrate('light'))
                        .catch(console.error)}
                  >
                    Set
                  </button>
                </div>
                <div class="btn-row">
                  <button
                    @click=${() =>
                      storage
                        .get(this._sKey)
                        .then((v) => {
                          this._sRead = v
                        })
                        .catch(console.error)}
                  >
                    Get
                  </button>
                  <button
                    @click=${() =>
                      storage
                        .remove(this._sKey)
                        .then(() => {
                          this._sRead = undefined
                        })
                        .catch(console.error)}
                  >
                    Remove
                  </button>
                  <button
                    @click=${() =>
                      storage
                        .keys()
                        .then((k) => {
                          this._sKeys = k
                        })
                        .catch(console.error)}
                  >
                    Keys
                  </button>
                  <button
                    class="danger"
                    @click=${() =>
                      storage
                        .clear()
                        .then(() => {
                          this._sRead = undefined
                          this._sKeys = null
                        })
                        .catch(console.error)}
                  >
                    Clear
                  </button>
                </div>
                ${
                  this._sRead !== undefined
                    ? html`<p class="status">Value: <b>${this._sRead ?? '(null)'}</b></p>`
                    : ''
                }
                ${
                  this._sKeys !== null
                    ? html`<p class="status">
                        Keys: <b>${this._sKeys!.length ? this._sKeys!.join(', ') : '(none)'}</b>
                      </p>`
                    : ''
                }
              </div>

              <!-- Location -->
              <div class="card">
                <h2>Location</h2>
                <p class="${this._locWarn ? 'warn' : 'muted'}">${this._locVal}</p>
              </div>
            </main>`
          : ''
      }
      ${
        this._tab === 'server'
          ? html`
              <main>
                <div class="card">
                  <h2>Server Routes</h2>
                  <div class="btn-row">
                    <button @click=${() => this._callHello()}>Call hello route</button>
                  </div>
                  ${
                    this._rpcResult
                      ? html`<p class="status">Result: <b>${this._rpcResult}</b></p>`
                      : ''
                  }
                  <div class="btn-row">
                    <button @click=${() => this._callPing()}>GET /api/ping</button>
                  </div>
                  ${
                    this._pingResult
                      ? html`<p class="status">Result: <b>${this._pingResult}</b></p>`
                      : ''
                  }
                </div>
              </main>
            `
          : ''
      }
      <div class="tab-bar">
        <button
          class=${'tab' + (this._tab === 'native' ? ' active' : '')}
          @click=${() => {
            this._tab = 'native'
          }}
        >
          <span class="tab-icon">⚙</span><span class="tab-label">Native</span>
        </button>
        <button
          class=${'tab' + (this._tab === 'server' ? ' active' : '')}
          @click=${() => {
            this._tab = 'server'
          }}
        >
          <span class="tab-icon">⚡</span><span class="tab-label">Server</span>
        </button>
      </div>
    `
  }
}
