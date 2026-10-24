import { useState, useEffect } from 'react'
import { geolocation, device, haptics, clipboard, storage, alerts } from '@capsule/core'
import type { DeviceInfo, HapticStyle, AlertResult, AlertStyle } from '@capsule/core'

type AlertPreset = 'default' | 'dark' | 'brand' | 'warning'

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
const PRESETS: AlertPreset[] = ['default', 'dark', 'brand', 'warning']

export default function NativeTab() {
  const [info, setInfo] = useState<DeviceInfo | null>(null)
  const [alertPreset, setAlertPreset] = useState<AlertPreset>('default')
  const [alertResult, setAlertResult] = useState<AlertResult | null>(null)
  const [lastHaptic, setLastHaptic] = useState<HapticStyle | null>(null)
  const [clipValue, setClipValue] = useState('')
  const [clipRead, setClipRead] = useState<string | null>(null)
  const [storeKey, setStoreKey] = useState('greeting')
  const [storeValue, setStoreValue] = useState('hello capsule')
  const [storeRead, setStoreRead] = useState<string | null>(null)
  const [storeKeys, setStoreKeys] = useState<string[]>([])
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)

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
    <div className="flex flex-col gap-5 p-5 max-w-lg mx-auto">
      {/* Device */}
      <section className="bg-white rounded-xl p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
          Device
        </h2>
        {info ? (
          <div className="divide-y divide-gray-100">
            {(
              [
                ['Model', info.model],
                ['Manufacturer', info.manufacturer],
                ['OS', `Android ${info.osVersion} (SDK ${info.sdkVersion})`],
                ['Virtual', String(info.isVirtual)],
                ['WebView', info.webViewVersion ?? '—'],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between items-center py-2 gap-3">
                <span className="text-gray-400 shrink-0">{k}</span>
                <span className="text-right break-all">{v}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400">Loading…</p>
        )}
      </section>

      {/* Alerts */}
      <section className="bg-white rounded-xl p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
          Alerts
        </h2>
        <div className="flex flex-wrap gap-3 mb-3">
          {PRESETS.map((p) => (
            <label key={p} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="radio"
                name="preset"
                value={p}
                checked={alertPreset === p}
                onChange={() => setAlertPreset(p)}
              />
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={showAlert}
            className="px-4 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            Alert
          </button>
          <button
            onClick={showConfirm}
            className="px-4 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            Confirm
          </button>
          <button
            onClick={showDestructive}
            className="px-4 py-2 rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 active:bg-red-200 transition-colors"
          >
            Destructive
          </button>
        </div>
        {alertResult && (
          <p className="mt-2 text-xs text-gray-400">
            Pressed: <strong className="text-gray-700">{alertResult.action}</strong>
          </p>
        )}
      </section>

      {/* Haptics */}
      <section className="bg-white rounded-xl p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
          Haptics
        </h2>
        <div className="flex flex-wrap gap-2">
          {HAPTIC_STYLES.map((s) => (
            <button
              key={s}
              onClick={() =>
                haptics
                  .vibrate(s)
                  .then(() => setLastHaptic(s))
                  .catch(console.error)
              }
              className={`px-3.5 py-1.5 rounded-full border text-xs transition-colors ${lastHaptic === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}
            >
              {s}
            </button>
          ))}
        </div>
        {lastHaptic && (
          <p className="mt-2 text-xs text-gray-400">
            Last: <strong className="text-gray-700">{lastHaptic}</strong>
          </p>
        )}
      </section>

      {/* Clipboard */}
      <section className="bg-white rounded-xl p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
          Clipboard
        </h2>
        <div className="flex gap-2 mb-2">
          <input
            value={clipValue}
            onChange={(e) => setClipValue(e.target.value)}
            placeholder="Type something…"
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white min-w-0"
          />
          <button
            onClick={() =>
              clipboard
                .write(clipValue)
                .then(() => haptics.vibrate('light'))
                .catch(console.error)
            }
            className="px-4 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            Copy
          </button>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={() =>
              clipboard
                .read()
                .then((v) => setClipRead(v ?? '(empty)'))
                .catch(console.error)
            }
            className="px-4 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            Paste
          </button>
          {clipRead !== null && <span className="text-gray-400">{clipRead}</span>}
        </div>
      </section>

      {/* Storage */}
      <section className="bg-white rounded-xl p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
          Storage
        </h2>
        <div className="flex gap-2 mb-2">
          <input
            value={storeKey}
            onChange={(e) => setStoreKey(e.target.value)}
            placeholder="key"
            className="w-24 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white"
          />
          <input
            value={storeValue}
            onChange={(e) => setStoreValue(e.target.value)}
            placeholder="value"
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white min-w-0"
          />
          <button
            onClick={() =>
              storage
                .set(storeKey, storeValue)
                .then(() => haptics.vibrate('light'))
                .catch(console.error)
            }
            className="px-4 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            Set
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => storage.get(storeKey).then(setStoreRead).catch(console.error)}
            className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            Get
          </button>
          <button
            onClick={() =>
              storage
                .remove(storeKey)
                .then(() => setStoreRead(null))
                .catch(console.error)
            }
            className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            Remove
          </button>
          <button
            onClick={() => storage.keys().then(setStoreKeys).catch(console.error)}
            className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            Keys
          </button>
          <button
            onClick={() =>
              storage
                .clear()
                .then(() => {
                  setStoreRead(null)
                  setStoreKeys([])
                })
                .catch(console.error)
            }
            className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 active:bg-red-200 transition-colors"
          >
            Clear
          </button>
        </div>
        {storeRead !== null && (
          <p className="mt-2 text-xs text-gray-400">
            Value: <strong className="text-gray-700">{storeRead ?? '(null)'}</strong>
          </p>
        )}
        {storeKeys.length > 0 && (
          <p className="mt-1 text-xs text-gray-400">
            Keys: <strong className="text-gray-700">{storeKeys.join(', ')}</strong>
          </p>
        )}
      </section>

      {/* Location */}
      <section className="bg-white rounded-xl p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
          Location
        </h2>
        {position && (
          <p>
            {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
          </p>
        )}
        {gpsError && <p className="text-orange-400">⚠ {gpsError}</p>}
        {!position && !gpsError && <p className="text-gray-400">Getting location…</p>}
      </section>
    </div>
  )
}
