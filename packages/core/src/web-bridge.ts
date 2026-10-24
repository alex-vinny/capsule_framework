// Docs: docs/concepts/architecture.md, docs/reference/core-api.md
import { CapsuleError, CapsuleErrorCode } from './errors.js'
import { CameraMethods } from './camera.js'
import { FilesystemMethods } from './filesystem.js'
import { AppMethods } from './app.js'
import { NetworkMethods, type ConnectionType, type NetworkStatus } from './network.js'
import {
  PushMethods,
  type NotificationChannel,
  type PermissionStatus,
  type PushMessage,
} from './push.js'
import { CapabilitiesMethods } from './capabilities.js'
import { AiMethods, type AiAvailability } from './ai.js'
import type { Bridge, NotificationHandler } from './bridge.js'

// Capability versions reported by the browser fallback. Mirrors what the native
// shells answer for capsule.getCapabilities, so dev code that gates on a
// capability behaves the same in the browser as on device.
const WEB_CAPABILITIES: Record<string, number> = {
  ai: 1,
  app: 1,
  camera: 1,
  filesystem: 1,
  network: 1,
  push: 1,
}

const WEB_AI_AVAILABILITY: AiAvailability = {
  tier: 'unavailable',
  status: 'unavailable',
  reason:
    'No on-device model in the browser — run on a device with Gemini Nano or Apple Intelligence',
}

// localStorage key prefix — avoids collisions with the app's own keys
const PREFIX = '__capsule__'

// localStorage namespace for the browser filesystem fallback.
const FS_PREFIX = '__capsule_fs__'

/**
 * Browser fallback bridge — delegates every Capsule API to the closest
 * available Web Platform equivalent. Used automatically when the page is
 * loaded outside a native Capsule shell (i.e. plain browser / Vite dev).
 *
 * Goal: let developers build and iterate in the browser, then verify on device.
 * Behaviour intentionally mirrors the native side as closely as possible.
 */
export class WebBridge implements Bridge {
  private readonly notificationHandlers = new Map<string, Set<NotificationHandler>>()
  private geoWatchId: number | null = null
  // In-memory notification channels for the push dev fallback (Android-only on device).
  private readonly pushChannels = new Map<string, NotificationChannel>()

  constructor() {
    // Bridge document visibility to app.stateChange so onResume/onPause/onStateChange
    // fire in browser dev (tab switch ≈ background). urlOpen is native-only.
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', () => {
        this.emit(AppMethods.STATE_CHANGE, { isActive: !document.hidden })
      })
    }

    // Bridge online/offline to network.statusChange so onStatusChange fires in
    // browser dev. Mirrors the native ConnectivityManager change feed.
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      const push = () => this.emit(NetworkMethods.STATUS_CHANGE, this.networkStatus())
      window.addEventListener('online', push)
      window.addEventListener('offline', push)
    }

    // Dev affordance: fire a push message or tap from the console, the way
    // online/offline simulate connectivity. `kind: 'tap'` marks it as a launch
    // notification so onNotificationTap routing can be exercised in the browser.
    if (typeof window !== 'undefined') {
      ;(window as unknown as Record<string, unknown>).__capsulePushSimulate = (
        message: PushMessage,
        kind: 'message' | 'tap' = 'message'
      ) => {
        if (kind === 'tap') {
          this.emit(PushMethods.NOTIFICATION_TAP, { ...message, launchNotification: true })
        } else {
          this.emit(PushMethods.MESSAGE, message)
        }
      }
    }
  }

  call<T = unknown>(method: string, params?: unknown): Promise<T> {
    return this.dispatch(method, (params ?? {}) as Record<string, unknown>) as Promise<T>
  }

  private dispatch(method: string, p: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case 'alerts.show':
        return this.alertsShow(p)
      case 'device.getInfo':
        return this.deviceGetInfo()
      case 'clipboard.read':
        return this.clipboardRead()
      case 'clipboard.write':
        return this.clipboardWrite(p)
      case 'haptics.vibrate':
        return this.hapticsVibrate()
      case 'geolocation.getCurrentPosition':
        return this.geoGetCurrent(p)
      case 'geolocation.watchPosition':
        return this.geoWatch(p)
      case 'geolocation.clearWatch':
        return this.geoClearWatch()
      case CameraMethods.CAPTURE_PHOTO:
        return this.cameraCapture(p, true)
      case CameraMethods.PICK_IMAGE:
        return this.cameraCapture(p, false)
      case 'storage.get':
        return this.storageGet(p)
      case 'storage.set':
        return this.storageSet(p)
      case 'storage.remove':
        return this.storageRemove(p)
      case 'storage.clear':
        return this.storageClear()
      case 'storage.keys':
        return this.storageKeys()
      case FilesystemMethods.READ_FILE:
        return this.fsReadFile(p)
      case FilesystemMethods.WRITE_FILE:
        return this.fsWriteFile(p)
      case FilesystemMethods.APPEND_FILE:
        return this.fsAppendFile(p)
      case FilesystemMethods.DELETE_FILE:
        return this.fsDeleteFile(p)
      case FilesystemMethods.MKDIR:
        return this.fsMkdir(p)
      case FilesystemMethods.RMDIR:
        return this.fsRmdir(p)
      case FilesystemMethods.READDIR:
        return this.fsReaddir(p)
      case FilesystemMethods.STAT:
        return this.fsStat(p)
      case FilesystemMethods.GET_URI:
        return this.fsGetUri(p)
      case FilesystemMethods.DOWNLOAD_FILE:
        return this.fsDownloadFile(p)
      case AppMethods.GET_STATE:
        return this.appGetState()
      case AppMethods.GET_LAUNCH_URL:
        return this.appGetLaunchUrl()
      case NetworkMethods.GET_STATUS:
        return Promise.resolve(this.networkStatus())
      case PushMethods.REGISTER:
        return Promise.resolve({ value: 'web-dev-token', platform: 'android' })
      case PushMethods.CREATE_CHANNEL:
        return this.pushCreateChannel(p)
      case PushMethods.REMOVE_CHANNEL:
        this.pushChannels.delete(String(p.id))
        return Promise.resolve(undefined)
      case PushMethods.LIST_CHANNELS:
        return Promise.resolve({ channels: [...this.pushChannels.values()] })
      case PushMethods.REMOVE_ALL_DELIVERED:
        return Promise.resolve(undefined)
      case PushMethods.CHECK_PERMISSIONS:
      case PushMethods.REQUEST_PERMISSIONS:
        return Promise.resolve({ notifications: webNotificationPermission() })
      case PushMethods.GET_LAUNCH_NOTIFICATION:
        return Promise.resolve({ message: null })
      // No model runs in the browser fallback: report it honestly (no fake "echo" replies)
      // so dev code exercises the same unavailable path most real devices take.
      case AiMethods.AVAILABILITY:
      case AiMethods.PREPARE:
        return Promise.resolve(WEB_AI_AVAILABILITY)
      case AiMethods.GENERATE:
      case AiMethods.STREAM:
        return Promise.reject(
          CapsuleError.from(CapsuleErrorCode.AI_UNAVAILABLE, WEB_AI_AVAILABILITY.reason)
        )
      case CapabilitiesMethods.GET:
        return Promise.resolve({ capabilities: { ...WEB_CAPABILITIES } })
      default: {
        // In dev mode the route sidecar sets window.__CAPSULE_ROUTES_URL__.
        // Try the RPC endpoint before giving up so file-based routes work in
        // the browser the same way they work on device via QuickJS.
        const routesUrl = (globalThis as Record<string, unknown>).__CAPSULE_ROUTES_URL__ as
          string | undefined
        if (routesUrl) {
          return fetch(`${routesUrl}/_capsule/rpc`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method, params: p }),
          }).then(async (res) => {
            if (res.ok) return res.json() as unknown
            const err = (await res.json().catch(() => ({ error: 'Unknown error' }))) as Record<
              string,
              unknown
            >
            if (res.status === 404) {
              throw CapsuleError.from(
                CapsuleErrorCode.METHOD_NOT_FOUND,
                `Web bridge: unknown method "${method}"`
              )
            }
            throw new Error(String(err.error ?? 'Route error'))
          })
        }
        return Promise.reject(
          CapsuleError.from(
            CapsuleErrorCode.METHOD_NOT_FOUND,
            `Web bridge: unknown method "${method}"`
          )
        )
      }
    }
  }

  on(method: string, handler: NotificationHandler): () => void {
    let set = this.notificationHandlers.get(method)
    if (!set) {
      set = new Set()
      this.notificationHandlers.set(method, set)
    }
    set.add(handler)
    return () => this.notificationHandlers.get(method)?.delete(handler)
  }

  private emit(method: string, params: unknown): void {
    this.notificationHandlers.get(method)?.forEach((h) => h(params))
  }

  // ── alerts ────────────────────────────────────────────────────────────────

  private alertsShow(p: Record<string, unknown>): Promise<{ action: string }> {
    const message = String(p.message ?? '')
    const title = p.title != null ? String(p.title) : undefined
    const buttons = Array.isArray(p.buttons)
      ? (p.buttons as Array<{ label: string; role?: string }>)
      : [{ label: 'OK', role: 'default' as const }]
    const style = (p.style ?? {}) as Record<string, unknown>

    const accentColor = String(style.accentColor ?? '#0a84ff')
    const bgColor = String(style.backgroundColor ?? '#ffffff')
    const titleColor = String(style.titleColor ?? '#1c1c1e')
    const messageColor = String(style.messageColor ?? '#3c3c43')
    const radius = Number(style.cornerRadius ?? 16)
    const dimAmount = Number(style.dimAmount ?? 0.5)
    const allCaps = style.buttonAllCaps !== false // Android default: true

    return new Promise((resolve) => {
      const backdrop = document.createElement('div')
      backdrop.style.cssText = [
        'position:fixed',
        'inset:0',
        'z-index:2147483646',
        `background:rgba(0,0,0,${dimAmount})`,
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'padding:32px',
      ].join(';')

      const dialog = document.createElement('div')
      dialog.style.cssText = [
        `background:${bgColor}`,
        `border-radius:${radius}px`,
        'min-width:240px',
        'max-width:300px',
        'width:100%',
        'box-shadow:0 8px 32px rgba(0,0,0,0.20)',
        'overflow:hidden',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      ].join(';')

      const body = document.createElement('div')
      body.style.cssText = 'padding:24px 24px 12px'
      if (title) {
        const titleEl = document.createElement('div')
        titleEl.style.cssText = `font-size:17px;font-weight:700;color:${titleColor};margin-bottom:8px;line-height:1.3`
        titleEl.textContent = title
        body.appendChild(titleEl)
      }
      const msgEl = document.createElement('div')
      msgEl.style.cssText = `font-size:14px;color:${messageColor};line-height:1.6;white-space:pre-wrap`
      msgEl.textContent = message
      body.appendChild(msgEl)

      const btnRow = document.createElement('div')
      btnRow.style.cssText = 'display:flex;justify-content:flex-end;padding:8px 12px 12px;gap:4px'

      for (const btn of buttons) {
        const el = document.createElement('button')
        el.textContent = allCaps ? btn.label.toUpperCase() : btn.label
        el.style.cssText = [
          'background:none',
          'border:none',
          'padding:8px 12px',
          `font-size:14px`,
          'font-weight:600',
          `color:${accentColor}`,
          'cursor:pointer',
          'border-radius:8px',
          'font-family:inherit',
          'letter-spacing:0.02em',
        ].join(';')
        el.addEventListener('click', () => {
          document.body.removeChild(backdrop)
          resolve({ action: btn.label })
        })
        btnRow.appendChild(el)
      }

      dialog.appendChild(body)
      dialog.appendChild(btnRow)
      backdrop.appendChild(dialog)
      document.body.appendChild(backdrop)
    })
  }

  // ── device ────────────────────────────────────────────────────────────────

  private deviceGetInfo(): Promise<unknown> {
    const ua = navigator.userAgent
    const platform = /android/i.test(ua) ? 'android' : /iphone|ipad|ipod/i.test(ua) ? 'ios' : 'web'
    return Promise.resolve({
      platform,
      model: 'Browser',
      manufacturer: 'Web',
      osVersion: navigator.platform ?? 'unknown',
      sdkVersion: '0',
      isVirtual: false,
      webViewVersion: ua,
    })
  }

  // ── clipboard ─────────────────────────────────────────────────────────────

  private async clipboardRead(): Promise<{ value: string | null }> {
    if (!navigator.clipboard?.readText) return { value: null }
    const value = await navigator.clipboard.readText().catch(() => null)
    return { value }
  }

  private async clipboardWrite(p: Record<string, unknown>): Promise<void> {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(String(p.text ?? '')).catch(() => {})
    }
  }

  // ── haptics ───────────────────────────────────────────────────────────────

  private hapticsVibrate(): Promise<void> {
    if ('vibrate' in navigator) navigator.vibrate(50)
    return Promise.resolve()
  }

  // ── geolocation ───────────────────────────────────────────────────────────

  private geoGetCurrent(p: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(CapsuleError.from(CapsuleErrorCode.LOCATION_UNAVAILABLE))
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(toBridgePosition(pos)),
        (err) =>
          reject(
            CapsuleError.from(
              err.code === 1
                ? CapsuleErrorCode.PERMISSION_DENIED
                : CapsuleErrorCode.LOCATION_UNAVAILABLE
            )
          ),
        {
          enableHighAccuracy: Boolean(p.enableHighAccuracy),
          timeout: Number(p.timeout ?? 10_000),
          maximumAge: Number(p.maximumAge ?? 0),
        }
      )
    })
  }

  private geoWatch(p: Record<string, unknown>): Promise<void> {
    if (!navigator.geolocation) return Promise.resolve()
    this.geoWatchId = navigator.geolocation.watchPosition(
      (pos) => this.emit('geolocation.positionUpdate', toBridgePosition(pos)),
      () => {},
      {
        enableHighAccuracy: Boolean(p.enableHighAccuracy),
        timeout: Number(p.timeout ?? 30_000),
        maximumAge: Number(p.maximumAge ?? 0),
      }
    )
    return Promise.resolve()
  }

  private geoClearWatch(): Promise<void> {
    if (this.geoWatchId !== null) {
      navigator.geolocation.clearWatch(this.geoWatchId)
      this.geoWatchId = null
    }
    return Promise.resolve()
  }

  // ── camera ────────────────────────────────────────────────────────────────

  /**
   * Browser fallback for camera.capturePhoto / camera.pickImage. Uses a hidden
   * file input — with `capture` set it asks the OS for the camera; without it,
   * the gallery. Honours quality / maxWidth / maxHeight via a canvas re-encode.
   */
  private cameraCapture(p: Record<string, unknown>, useCamera: boolean): Promise<unknown> {
    const quality = clamp01(Number(p.quality ?? 0.9))
    const maxWidth = p.maxWidth != null ? Number(p.maxWidth) : undefined
    const maxHeight = p.maxHeight != null ? Number(p.maxHeight) : undefined

    return new Promise((resolve, reject) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      if (useCamera) input.setAttribute('capture', 'environment')
      input.style.display = 'none'

      // The browser gives us no event when the picker is dismissed without a
      // pick. Treat a focus-back with no file (next tick) as a cancellation.
      let settled = false
      const cleanup = () => {
        settled = true
        input.remove()
        window.removeEventListener('focus', onFocus)
      }
      const onFocus = () => {
        setTimeout(() => {
          if (!settled && (!input.files || input.files.length === 0)) {
            cleanup()
            reject(CapsuleError.from(CapsuleErrorCode.OPERATION_CANCELLED))
          }
        }, 500)
      }

      input.addEventListener('change', () => {
        const file = input.files?.[0]
        if (!file) {
          cleanup()
          reject(CapsuleError.from(CapsuleErrorCode.OPERATION_CANCELLED))
          return
        }
        encodeImageFile(file, quality, maxWidth, maxHeight)
          .then((photo) => {
            cleanup()
            resolve(photo)
          })
          .catch(() => {
            cleanup()
            reject(CapsuleError.from(CapsuleErrorCode.MEDIA_PROCESSING_FAILED))
          })
      })

      window.addEventListener('focus', onFocus)
      document.body.appendChild(input)
      input.click()
    })
  }

  // ── storage ───────────────────────────────────────────────────────────────

  private storageGet(p: Record<string, unknown>): Promise<{ value: string | null }> {
    return Promise.resolve({ value: localStorage.getItem(PREFIX + String(p.key)) })
  }

  private storageSet(p: Record<string, unknown>): Promise<void> {
    localStorage.setItem(PREFIX + String(p.key), String(p.value))
    return Promise.resolve()
  }

  private storageRemove(p: Record<string, unknown>): Promise<void> {
    localStorage.removeItem(PREFIX + String(p.key))
    return Promise.resolve()
  }

  private storageClear(): Promise<void> {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(PREFIX)) toRemove.push(k)
    }
    toRemove.forEach((k) => localStorage.removeItem(k))
    return Promise.resolve()
  }

  private storageKeys(): Promise<{ keys: string[] }> {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(PREFIX)) keys.push(k.slice(PREFIX.length))
    }
    return Promise.resolve({ keys })
  }

  // ── filesystem ──────────────────────────────────────────────────────────────
  //
  // Dev fallback: a localStorage-backed filesystem keyed by (directory, path).
  // Bytes are stored canonically as base64 so reads can re-encode to either
  // utf8 or base64 regardless of how the file was written. Faithful enough to
  // iterate in the browser; on device this runs against the real Android FS.

  // These are `async` (not plain Promise-returning) on purpose: fsPath() throws
  // synchronously on a `..` traversal, and `async` turns that throw into a
  // rejection so `call()` always returns a promise per the Bridge contract.

  private async fsReadFile(p: Record<string, unknown>): Promise<{ data: string }> {
    const rec = fsGet(fsDir(p), fsPath(p))
    if (!rec || rec.type !== 'file') {
      throw CapsuleError.from(CapsuleErrorCode.FILE_NOT_FOUND)
    }
    const encoding = p.encoding === 'base64' ? 'base64' : 'utf8'
    return { data: encoding === 'base64' ? rec.b64 : base64ToUtf8(rec.b64) }
  }

  private async fsWriteFile(p: Record<string, unknown>): Promise<{ uri: string }> {
    const dir = fsDir(p)
    const path = fsPath(p)
    const b64 = p.encoding === 'base64' ? String(p.data ?? '') : utf8ToBase64(String(p.data ?? ''))
    if (p.recursive !== false) fsMkParents(dir, path)
    fsPut(dir, path, { type: 'file', b64, size: base64Bytes(b64), mtime: Date.now() })
    return { uri: fsUri(dir, path) }
  }

  private async fsAppendFile(p: Record<string, unknown>): Promise<Record<string, never>> {
    const dir = fsDir(p)
    const path = fsPath(p)
    const existing = fsGet(dir, path)
    const prevB64 = existing?.type === 'file' ? existing.b64 : ''
    const addB64 =
      p.encoding === 'base64' ? String(p.data ?? '') : utf8ToBase64(String(p.data ?? ''))
    // Concatenate at the byte level (decode → join → re-encode) so multi-byte
    // characters straddling an append boundary survive.
    const merged = utf8ToBase64(base64ToUtf8(prevB64) + base64ToUtf8(addB64))
    if (p.recursive !== false) fsMkParents(dir, path)
    fsPut(dir, path, { type: 'file', b64: merged, size: base64Bytes(merged), mtime: Date.now() })
    return {}
  }

  private async fsDeleteFile(p: Record<string, unknown>): Promise<Record<string, never>> {
    const dir = fsDir(p)
    const path = fsPath(p)
    const rec = fsGet(dir, path)
    if (!rec || rec.type !== 'file') {
      throw CapsuleError.from(CapsuleErrorCode.FILE_NOT_FOUND)
    }
    localStorage.removeItem(fsKey(dir, path))
    return {}
  }

  private async fsMkdir(p: Record<string, unknown>): Promise<Record<string, never>> {
    const dir = fsDir(p)
    const path = fsPath(p)
    if (p.recursive !== false) fsMkParents(dir, path)
    fsPut(dir, path, { type: 'directory', mtime: Date.now() })
    return {}
  }

  private async fsRmdir(p: Record<string, unknown>): Promise<Record<string, never>> {
    const dir = fsDir(p)
    const path = fsPath(p)
    const children = fsChildren(dir, path)
    if (children.length > 0 && p.recursive !== true) {
      throw CapsuleError.from(CapsuleErrorCode.FILE_IO_ERROR, 'directory not empty')
    }
    const prefix = path === '' ? '' : path + '/'
    for (const key of fsKeysIn(dir)) {
      const entryPath = key.slice(fsKey(dir, '').length)
      if (entryPath === path || entryPath.startsWith(prefix)) localStorage.removeItem(key)
    }
    return {}
  }

  private async fsReaddir(p: Record<string, unknown>): Promise<{ files: FsEntry[] }> {
    return { files: fsChildren(fsDir(p), fsPath(p)) }
  }

  private async fsStat(p: Record<string, unknown>): Promise<FsStat> {
    const dir = fsDir(p)
    const path = fsPath(p)
    const rec = fsGet(dir, path)
    if (rec) {
      return {
        uri: fsUri(dir, path),
        type: rec.type,
        size: rec.type === 'file' ? rec.size : 0,
        mtime: rec.mtime,
      }
    }
    // Implicit directory — no marker, but something lives under it.
    if (fsChildren(dir, path).length > 0) {
      return { uri: fsUri(dir, path), type: 'directory', size: 0, mtime: 0 }
    }
    throw CapsuleError.from(CapsuleErrorCode.FILE_NOT_FOUND)
  }

  private async fsGetUri(p: Record<string, unknown>): Promise<{ uri: string }> {
    return { uri: fsUri(fsDir(p), fsPath(p)) }
  }

  private async fsDownloadFile(p: Record<string, unknown>): Promise<FsStat> {
    const dir = fsDir(p)
    const path = fsPath(p)
    try {
      const res = await fetch(String(p.url ?? ''))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = await res.arrayBuffer()
      const b64 = bytesToBase64(new Uint8Array(buf))
      if (p.recursive !== false) fsMkParents(dir, path)
      const mtime = Date.now()
      fsPut(dir, path, { type: 'file', b64, size: buf.byteLength, mtime })
      return { uri: fsUri(dir, path), type: 'file', size: buf.byteLength, mtime }
    } catch {
      throw CapsuleError.from(CapsuleErrorCode.FILE_IO_ERROR, 'download failed')
    }
  }

  // ── app lifecycle ───────────────────────────────────────────────────────────
  //
  // State tracks document visibility; the constructor wires visibilitychange to
  // emit app.stateChange. There is no cold-start deep link in the browser, so
  // getLaunchUrl resolves null.

  private appGetState(): Promise<{ isActive: boolean }> {
    const isActive = typeof document !== 'undefined' ? !document.hidden : true
    return Promise.resolve({ isActive })
  }

  private appGetLaunchUrl(): Promise<{ url: string | null }> {
    return Promise.resolve({ url: null })
  }

  // ── network ───────────────────────────────────────────────────────────────
  //
  // Reachability from navigator.onLine; transport from the experimental Network
  // Information API (navigator.connection) when present, else `unknown`. The
  // constructor wires online/offline to emit network.statusChange.

  private networkStatus(): NetworkStatus {
    const online = typeof navigator !== 'undefined' ? navigator.onLine !== false : true
    return {
      connected: online,
      connectionType: online ? webConnectionType() : 'none',
    }
  }

  // ── push ──────────────────────────────────────────────────────────────────
  //
  // No real FCM in the browser. register() hands back a deterministic dev token,
  // channels live in memory, permissions map the Notification Web API, and the
  // constructor exposes window.__capsulePushSimulate to fire message/tap events.

  private pushCreateChannel(p: Record<string, unknown>): Promise<void> {
    const channel = p as unknown as NotificationChannel
    if (channel.id) this.pushChannels.set(channel.id, channel)
    return Promise.resolve()
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.9
  return Math.min(1, Math.max(0, n))
}

/**
 * Best-effort transport from the experimental Network Information API. Only a
 * subset of browsers expose `navigator.connection.type`; everything else (and
 * every unmapped value) falls back to `unknown` — connected, transport unknown.
 */
function webConnectionType(): ConnectionType {
  const conn = (navigator as unknown as { connection?: { type?: string } }).connection
  switch (conn?.type) {
    case 'wifi':
      return 'wifi'
    case 'cellular':
      return 'cellular'
    case 'ethernet':
      return 'ethernet'
    case 'none':
      return 'none'
    default:
      return 'unknown'
  }
}

/**
 * Map the Notification Web API permission to a Capsule {@link PermissionStatus}.
 * `default` (never asked) → `prompt`; absent API → `granted` so dev flows aren't
 * blocked in browsers without notifications.
 */
function webNotificationPermission(): PermissionStatus {
  const N = (globalThis as { Notification?: { permission?: string } }).Notification
  switch (N?.permission) {
    case 'granted':
      return 'granted'
    case 'denied':
      return 'denied'
    case 'default':
      return 'prompt'
    default:
      return 'granted'
  }
}

/**
 * Decode an image File, optionally downscale it to fit within max dimensions,
 * and re-encode as a JPEG data URL. Mirrors the native handler's contract so
 * browser dev and on-device behaviour match.
 */
async function encodeImageFile(
  file: File,
  quality: number,
  maxWidth?: number,
  maxHeight?: number
): Promise<{
  webPath: string
  dataUrl: string
  format: string
  width: number
  height: number
  size: number
}> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImage(objectUrl)
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, maxWidth, maxHeight)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    ctx.drawImage(img, 0, 0, width, height)

    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    return {
      webPath: dataUrl,
      dataUrl,
      format: 'jpeg',
      width,
      height,
      size: approxDataUrlBytes(dataUrl),
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image decode failed'))
    img.src = src
  })
}

function fitWithin(
  w: number,
  h: number,
  maxWidth?: number,
  maxHeight?: number
): { width: number; height: number } {
  const mw = maxWidth ?? Infinity
  const mh = maxHeight ?? Infinity
  const scale = Math.min(1, mw / w, mh / h)
  return { width: Math.round(w * scale), height: Math.round(h * scale) }
}

function approxDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - padding
}

// ── filesystem fallback helpers ────────────────────────────────────────────

type FsRecord =
  { type: 'file'; b64: string; size: number; mtime: number } | { type: 'directory'; mtime: number }

type FsEntry = { name: string; uri: string; type: 'file' | 'directory'; size: number }
type FsStat = { uri: string; type: 'file' | 'directory'; size: number; mtime: number }

function fsDir(p: Record<string, unknown>): string {
  const d = p.directory
  return d === 'cache' || d === 'documents' ? d : 'data'
}

/** Normalise a path: trim slashes, collapse, and reject `..` traversal. */
function fsPath(p: Record<string, unknown>): string {
  const raw = String(p.path ?? '')
  const segments = raw.split('/').filter((s) => s !== '' && s !== '.')
  if (segments.some((s) => s === '..')) {
    throw CapsuleError.from(CapsuleErrorCode.PATH_NOT_ALLOWED)
  }
  return segments.join('/')
}

function fsKey(dir: string, path: string): string {
  return `${FS_PREFIX}:${dir}:${path}`
}

function fsUri(dir: string, path: string): string {
  return `capsule-fs://${dir}/${path}`
}

function fsGet(dir: string, path: string): FsRecord | null {
  const raw = localStorage.getItem(fsKey(dir, path))
  return raw ? (JSON.parse(raw) as FsRecord) : null
}

function fsPut(dir: string, path: string, rec: FsRecord): void {
  localStorage.setItem(fsKey(dir, path), JSON.stringify(rec))
}

function fsKeysIn(dir: string): string[] {
  const base = fsKey(dir, '')
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(base)) keys.push(k)
  }
  return keys
}

/** Create directory markers for every parent of `path`. */
function fsMkParents(dir: string, path: string): void {
  const segments = path.split('/').filter(Boolean)
  let acc = ''
  for (let i = 0; i < segments.length - 1; i++) {
    acc = acc ? `${acc}/${segments[i]}` : segments[i]
    if (!fsGet(dir, acc)) fsPut(dir, acc, { type: 'directory', mtime: Date.now() })
  }
}

/** Direct children of a directory, with implicit (marker-less) dirs inferred. */
function fsChildren(dir: string, path: string): FsEntry[] {
  const prefix = path === '' ? '' : path + '/'
  const base = fsKey(dir, '')
  const byName = new Map<string, FsEntry>()
  for (const key of fsKeysIn(dir)) {
    const entryPath = key.slice(base.length)
    if (entryPath === path || !entryPath.startsWith(prefix)) continue
    const rest = entryPath.slice(prefix.length)
    const slash = rest.indexOf('/')
    if (slash === -1) {
      const rec = fsGet(dir, entryPath)!
      byName.set(rest, {
        name: rest,
        uri: fsUri(dir, entryPath),
        type: rec.type,
        size: rec.type === 'file' ? rec.size : 0,
      })
    } else {
      // Deeper descendant → its top segment is an (implicit) child directory.
      const name = rest.slice(0, slash)
      if (!byName.has(name)) {
        byName.set(name, {
          name,
          uri: fsUri(dir, prefix + name),
          type: 'directory',
          size: 0,
        })
      }
    }
  }
  return [...byName.values()]
}

// base64 ⇄ utf8 that survives multi-byte characters (btoa/atob are latin1-only).
function utf8ToBase64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
}

function base64ToUtf8(b64: string): string {
  return decodeURIComponent(escape(atob(b64)))
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64Bytes(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - padding
}

function toBridgePosition(pos: globalThis.GeolocationPosition): unknown {
  return {
    coords: {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      altitude: pos.coords.altitude,
      altitudeAccuracy: pos.coords.altitudeAccuracy,
      heading: pos.coords.heading,
      speed: pos.coords.speed,
    },
    timestamp: pos.timestamp,
  }
}
