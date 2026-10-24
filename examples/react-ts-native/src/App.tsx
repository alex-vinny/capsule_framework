import { useState, useEffect } from 'react'
import { geolocation, device, haptics, clipboard, storage, alerts, bridge } from '@capsule/core'
import type { DeviceInfo, HapticStyle, AlertResult, AlertStyle } from '@capsule/core'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'home' | 'tools' | 'settings' | 'server'
type AlertPreset = 'default' | 'dark' | 'brand' | 'warning'

// ─── Constants ────────────────────────────────────────────────────────────────

const ALERT_PRESETS: Record<AlertPreset, AlertStyle | undefined> = {
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

const HAPTIC_STYLES: HapticStyle[] = [
  'light',
  'medium',
  'heavy',
  'success',
  'warning',
  'error',
  'selection',
]

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  // Layout
  screen: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 14,
    background: '#f2f2f7',
    color: '#1c1c1e',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  body: { flex: 1, overflowY: 'auto' as const, paddingBottom: 83 },
  // Navigation bar
  navbar: {
    background: '#fff',
    borderBottom: '1px solid rgba(0,0,0,0.12)',
    padding: '14px 16px 10px',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  navTitle: { fontSize: 28, fontWeight: 700, letterSpacing: -0.5 },
  navRight: {
    fontSize: 24,
    lineHeight: '1',
    cursor: 'pointer',
    color: '#007aff',
    paddingBottom: 2,
  },
  // Tab bar
  tabBar: {
    position: 'fixed' as const,
    bottom: 0,
    left: 0,
    right: 0,
    background: 'rgba(255,255,255,0.92)',
    backdropFilter: 'blur(20px)',
    borderTop: '1px solid rgba(0,0,0,0.12)',
    display: 'flex',
    paddingBottom: 'env(safe-area-inset-bottom)',
  },
  tab: (active: boolean) => ({
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '8px 0 6px',
    cursor: 'pointer',
    gap: 3,
    color: active ? '#007aff' : '#8e8e93',
    fontSize: 10,
    fontWeight: active ? 600 : 400,
  }),
  tabIcon: { fontSize: 22, lineHeight: '1' },
  // Groups
  group: { margin: '20px 16px 0' },
  groupLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: '#6c6c70',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
    marginBottom: 6,
    paddingLeft: 4,
  },
  cell: { background: '#fff', borderRadius: 10 },
  row: {
    display: 'flex',
    alignItems: 'center',
    padding: '11px 16px',
    borderTop: '1px solid #f2f2f7',
    gap: 12,
    minHeight: 44,
  },
  rowFirst: { display: 'flex', alignItems: 'center', padding: '11px 16px', gap: 12, minHeight: 44 },
  rowLabel: { flex: 1, fontWeight: 400 },
  rowValue: { color: '#8e8e93', textAlign: 'right' as const, wordBreak: 'break-all' as const },
  chevron: { color: '#c7c7cc', fontSize: 18, fontWeight: 300 },
  // Controls
  btnGroup: { display: 'flex', flexWrap: 'wrap' as const, gap: 8, padding: '12px 16px' },
  btn: {
    padding: '9px 18px',
    borderRadius: 8,
    border: '1px solid #d1d1d6',
    background: '#f2f2f7',
    color: '#1c1c1e',
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnBlue: {
    padding: '9px 18px',
    borderRadius: 8,
    border: 'none',
    background: '#007aff',
    color: '#fff',
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontWeight: 600,
  },
  btnRed: {
    padding: '9px 18px',
    borderRadius: 8,
    border: '1px solid #ff3b30',
    background: '#fff0f0',
    color: '#ff3b30',
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  input: {
    flex: 1,
    padding: '9px 12px',
    borderRadius: 8,
    border: '1px solid #d1d1d6',
    background: '#f2f2f7',
    fontSize: 14,
    fontFamily: 'inherit',
    color: '#1c1c1e',
    minWidth: 0,
  },
  chip: (active: boolean) => ({
    padding: '6px 14px',
    borderRadius: 20,
    border: '1px solid',
    borderColor: active ? '#1c1c1e' : '#d1d1d6',
    background: active ? '#1c1c1e' : '#f2f2f7',
    color: active ? '#fff' : '#1c1c1e',
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }),
  radio: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' },
  status: { fontSize: 13, color: '#8e8e93', padding: '0 16px 12px' },
  badge: {
    background: '#007aff',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    borderRadius: 10,
    padding: '1px 6px',
    minWidth: 18,
    textAlign: 'center' as const,
  },
}

// ─── Sub-views ────────────────────────────────────────────────────────────────

function HomeTab({
  info,
  position,
  gpsError,
}: {
  info: DeviceInfo | null
  position: { lat: number; lng: number } | null
  gpsError: string | null
}) {
  return (
    <div>
      <div style={s.group}>
        <div style={s.groupLabel}>Device</div>
        <div style={s.cell}>
          {info ? (
            [
              ['Model', info.model],
              ['Manufacturer', info.manufacturer],
              ['OS', `Android ${info.osVersion} (SDK ${info.sdkVersion})`],
              ['Virtual', String(info.isVirtual)],
              ['WebView', info.webViewVersion ?? '—'],
            ].map(([k, v], i) => (
              <div key={k} style={i === 0 ? s.rowFirst : s.row}>
                <span style={s.rowLabel}>{k}</span>
                <span style={s.rowValue}>{v}</span>
              </div>
            ))
          ) : (
            <div style={s.rowFirst}>
              <span style={{ color: '#8e8e93' }}>Loading…</span>
            </div>
          )}
        </div>
      </div>

      <div style={s.group}>
        <div style={s.groupLabel}>Location</div>
        <div style={s.cell}>
          <div style={s.rowFirst}>
            <span style={s.rowLabel}>Coordinates</span>
            <span style={s.rowValue}>
              {position
                ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`
                : gpsError
                  ? '⚠ ' + gpsError
                  : 'Getting…'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function ToolsTab({
  lastHaptic,
  setLastHaptic,
  clipValue,
  setClipValue,
  clipRead,
  setClipRead,
  storeKey,
  setStoreKey,
  storeValue,
  setStoreValue,
  storeRead,
  setStoreRead,
  storeKeys,
  setStoreKeys,
}: {
  lastHaptic: HapticStyle | null
  setLastHaptic: (s: HapticStyle) => void
  clipValue: string
  setClipValue: (v: string) => void
  clipRead: string | null
  setClipRead: (v: string | null) => void
  storeKey: string
  setStoreKey: (v: string) => void
  storeValue: string
  setStoreValue: (v: string) => void
  storeRead: string | null
  setStoreRead: (v: string | null) => void
  storeKeys: string[]
  setStoreKeys: (v: string[]) => void
}) {
  return (
    <div>
      <div style={s.group}>
        <div style={s.groupLabel}>Haptics</div>
        <div style={{ ...s.cell, padding: '12px 16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {HAPTIC_STYLES.map((h) => (
              <button
                key={h}
                style={s.chip(lastHaptic === h)}
                onClick={() =>
                  haptics
                    .vibrate(h)
                    .then(() => setLastHaptic(h))
                    .catch(console.error)
                }
              >
                {h}
              </button>
            ))}
          </div>
          {lastHaptic && (
            <p style={{ ...s.status, padding: '10px 0 0' }}>
              Last: <strong style={{ color: '#1c1c1e' }}>{lastHaptic}</strong>
            </p>
          )}
        </div>
      </div>

      <div style={s.group}>
        <div style={s.groupLabel}>Clipboard</div>
        <div style={s.cell}>
          <div style={{ ...s.rowFirst, gap: 8 }}>
            <input
              style={s.input}
              value={clipValue}
              onChange={(e) => setClipValue(e.target.value)}
              placeholder="Type something…"
            />
            <button
              style={s.btnBlue}
              onClick={() =>
                clipboard
                  .write(clipValue)
                  .then(() => haptics.vibrate('light'))
                  .catch(console.error)
              }
            >
              Copy
            </button>
          </div>
          <div style={{ ...s.row, gap: 8 }}>
            <button
              style={s.btn}
              onClick={() =>
                clipboard
                  .read()
                  .then((v) => setClipRead(v ?? '(empty)'))
                  .catch(console.error)
              }
            >
              Paste
            </button>
            {clipRead !== null && <span style={{ color: '#8e8e93' }}>{clipRead}</span>}
          </div>
        </div>
      </div>

      <div style={s.group}>
        <div style={s.groupLabel}>Storage</div>
        <div style={s.cell}>
          <div style={{ ...s.rowFirst, gap: 8 }}>
            <input
              style={{ ...s.input, flex: 'none', width: 90 }}
              value={storeKey}
              onChange={(e) => setStoreKey(e.target.value)}
              placeholder="key"
            />
            <input
              style={s.input}
              value={storeValue}
              onChange={(e) => setStoreValue(e.target.value)}
              placeholder="value"
            />
            <button
              style={s.btnBlue}
              onClick={() =>
                storage
                  .set(storeKey, storeValue)
                  .then(() => haptics.vibrate('light'))
                  .catch(console.error)
              }
            >
              Set
            </button>
          </div>
          <div style={{ ...s.row, gap: 8, flexWrap: 'wrap' }}>
            <button
              style={s.btn}
              onClick={() => storage.get(storeKey).then(setStoreRead).catch(console.error)}
            >
              Get
            </button>
            <button
              style={s.btn}
              onClick={() =>
                storage
                  .remove(storeKey)
                  .then(() => setStoreRead(null))
                  .catch(console.error)
              }
            >
              Remove
            </button>
            <button
              style={s.btn}
              onClick={() => storage.keys().then(setStoreKeys).catch(console.error)}
            >
              Keys
            </button>
            <button
              style={s.btnRed}
              onClick={() =>
                storage
                  .clear()
                  .then(() => {
                    setStoreRead(null)
                    setStoreKeys([])
                  })
                  .catch(console.error)
              }
            >
              Clear
            </button>
          </div>
          {storeRead !== null && (
            <p style={s.status}>
              Value: <strong style={{ color: '#1c1c1e' }}>{storeRead ?? '(null)'}</strong>
            </p>
          )}
          {storeKeys.length > 0 && (
            <p style={s.status}>
              Keys: <strong style={{ color: '#1c1c1e' }}>{storeKeys.join(', ')}</strong>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function SettingsTab({
  alertPreset,
  setAlertPreset,
  alertResult,
  setAlertResult,
}: {
  alertPreset: AlertPreset
  setAlertPreset: (p: AlertPreset) => void
  alertResult: AlertResult | null
  setAlertResult: (r: AlertResult) => void
}) {
  const style = ALERT_PRESETS[alertPreset]
  const showAlert = () =>
    alerts.show({ message: 'Hello from Capsule!', style }).then(setAlertResult)
  const showConfirm = () =>
    alerts
      .show({
        title: 'Confirm',
        message: 'Do you want to continue?',
        buttons: [
          { label: 'Cancel', role: 'cancel' },
          { label: 'Continue', role: 'default' },
        ],
        style,
      })
      .then(setAlertResult)
  const showDestructive = () =>
    alerts
      .show({
        title: 'Delete item',
        message: 'This cannot be undone.',
        buttons: [
          { label: 'Cancel', role: 'cancel' },
          { label: 'Delete', role: 'destructive' },
        ],
        style,
      })
      .then(setAlertResult)

  return (
    <div>
      <div style={s.group}>
        <div style={s.groupLabel}>Alert style</div>
        <div style={s.cell}>
          {(['default', 'dark', 'brand', 'warning'] as AlertPreset[]).map((p, i) => (
            <div key={p} style={i === 0 ? s.rowFirst : s.row}>
              <label style={{ ...s.radio, flex: 1 }}>
                <input
                  type="radio"
                  name="preset"
                  value={p}
                  checked={alertPreset === p}
                  onChange={() => setAlertPreset(p)}
                />
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </label>
              {alertPreset === p && <span style={{ color: '#007aff', fontSize: 18 }}>✓</span>}
            </div>
          ))}
        </div>
      </div>

      <div style={s.group}>
        <div style={s.groupLabel}>Alerts</div>
        <div style={s.cell}>
          <div style={s.rowFirst} onClick={showAlert}>
            <span style={s.rowLabel}>Show alert</span>
            <span style={s.chevron}>›</span>
          </div>
          <div style={s.row} onClick={showConfirm}>
            <span style={s.rowLabel}>Show confirm</span>
            <span style={s.chevron}>›</span>
          </div>
          <div style={s.row} onClick={showDestructive}>
            <span style={{ ...s.rowLabel, color: '#ff3b30' }}>Show destructive</span>
            <span style={s.chevron}>›</span>
          </div>
        </div>
      </div>
      {alertResult && (
        <p style={{ ...s.status, margin: '8px 16px 0', padding: 0 }}>
          Last: <strong style={{ color: '#1c1c1e' }}>{alertResult.action}</strong>
        </p>
      )}
    </div>
  )
}

function ServerTab({
  rpcResult,
  pingResult,
  callHello,
  callPing,
}: {
  rpcResult: string | null
  pingResult: string | null
  callHello: () => void
  callPing: () => void
}) {
  return (
    <div>
      <div style={s.group}>
        <div style={s.groupLabel}>Routes</div>
        <div style={s.cell}>
          <div style={s.rowFirst} onClick={callHello}>
            <span style={s.rowLabel}>Call hello route</span>
            <span style={s.chevron}>›</span>
          </div>
          {rpcResult !== null && (
            <p style={s.status}>
              <strong style={{ color: '#1c1c1e' }}>{rpcResult}</strong>
            </p>
          )}
          <div style={s.row} onClick={callPing}>
            <span style={s.rowLabel}>GET /api/ping</span>
            <span style={s.chevron}>›</span>
          </div>
          {pingResult !== null && (
            <p style={s.status}>
              <strong style={{ color: '#1c1c1e' }}>{pingResult}</strong>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [info, setInfo] = useState<DeviceInfo | null>(null)
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [alertPreset, setAlertPreset] = useState<AlertPreset>('default')
  const [alertResult, setAlertResult] = useState<AlertResult | null>(null)
  const [lastHaptic, setLastHaptic] = useState<HapticStyle | null>(null)
  const [clipValue, setClipValue] = useState('')
  const [clipRead, setClipRead] = useState<string | null>(null)
  const [storeKey, setStoreKey] = useState('greeting')
  const [storeValue, setStoreValue] = useState('hello capsule')
  const [storeRead, setStoreRead] = useState<string | null>(null)
  const [storeKeys, setStoreKeys] = useState<string[]>([])
  const [rpcResult, setRpcResult] = useState(null)
  const [pingResult, setPingResult] = useState(null)

  useEffect(() => {
    device.getInfo().then(setInfo).catch(console.error)
  }, [])

  useEffect(() => {
    let cancelled = false
    const attempt = () => {
      geolocation
        .getCurrentPosition()
        .then((p) => {
          if (!cancelled) setPosition({ lat: p.coords.latitude, lng: p.coords.longitude })
        })
        .catch((e: Error) => {
          if (cancelled) return
          if (e.message === 'PERMISSION_DENIED')
            setTimeout(() => {
              if (!cancelled) attempt()
            }, 500)
          else setGpsError(e.message)
        })
    }
    attempt()
    return () => {
      cancelled = true
    }
  }, [])

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

  const tabs: { id: Tab; icon: string; label: string }[] = [
    { id: 'home', icon: '⌂', label: 'Home' },
    { id: 'tools', icon: '⚙', label: 'Tools' },
    { id: 'settings', icon: '☰', label: 'Settings' },
    { id: 'server', icon: '⚡', label: 'Server' },
  ]

  const titles: Record<Tab, string> = {
    home: 'Home',
    tools: 'Tools',
    settings: 'Settings',
    server: 'Server',
  }

  return (
    <div style={s.screen}>
      <div style={s.body}>
        <div style={s.navbar}>
          <span style={s.navTitle}>{titles[tab]}</span>
          {tab === 'tools' && lastHaptic && <span style={s.badge}>1</span>}
        </div>

        {tab === 'home' && <HomeTab info={info} position={position} gpsError={gpsError} />}
        {tab === 'tools' && (
          <ToolsTab
            lastHaptic={lastHaptic}
            setLastHaptic={setLastHaptic}
            clipValue={clipValue}
            setClipValue={setClipValue}
            clipRead={clipRead}
            setClipRead={setClipRead}
            storeKey={storeKey}
            setStoreKey={setStoreKey}
            storeValue={storeValue}
            setStoreValue={setStoreValue}
            storeRead={storeRead}
            setStoreRead={setStoreRead}
            storeKeys={storeKeys}
            setStoreKeys={setStoreKeys}
          />
        )}
        {tab === 'settings' && (
          <SettingsTab
            alertPreset={alertPreset}
            setAlertPreset={setAlertPreset}
            alertResult={alertResult}
            setAlertResult={setAlertResult}
          />
        )}
        {tab === 'server' && (
          <ServerTab
            rpcResult={rpcResult}
            pingResult={pingResult}
            callHello={callHello}
            callPing={callPing}
          />
        )}
      </div>

      <nav style={s.tabBar}>
        {tabs.map(({ id, icon, label }) => (
          <div key={id} style={s.tab(tab === id)} onClick={() => setTab(id)}>
            <span style={s.tabIcon}>{icon}</span>
            <span>{label}</span>
          </div>
        ))}
      </nav>
    </div>
  )
}
