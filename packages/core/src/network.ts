// Docs: docs/reference/core-api.md
import type { Bridge } from './bridge.js'

/**
 * Transport currently carrying the connection.
 *
 * - `wifi` / `cellular` / `ethernet` — connected over that transport.
 * - `none` — no connectivity. Always paired with `connected: false`.
 * - `unknown` — connected, but the transport could not be determined (e.g. the
 *   browser exposes `navigator.onLine` but not `navigator.connection`).
 */
export type ConnectionType = 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown'

/**
 * A snapshot of network reachability.
 *
 * `connected` is the single bit both platforms agree on; `connectionType`
 * refines it. The invariant `connectionType === 'none' ⇔ !connected` always
 * holds — a `none` transport means offline, and any other transport means online.
 */
export interface NetworkStatus {
  /** `true` while the device has a usable internet connection. */
  connected: boolean
  /** The active transport, or `none` when offline / `unknown` when undetermined. */
  connectionType: ConnectionType
}

/**
 * Bridge method names — single source of truth, shared with WebBridge and the
 * native handlers. `statusChange` is a **notification** (native → JS push, no
 * response); `getStatus` is request/response.
 */
export const NetworkMethods = {
  GET_STATUS: 'network.getStatus',
  STATUS_CHANGE: 'network.statusChange',
} as const

/**
 * Network reachability + change feed. Mirrors {@link AppModule}: a request/
 * response query plus a push subscription.
 *
 * - {@link getStatus} — read the current reachability on demand.
 * - {@link onStatusChange} — subscribe to transitions. There is **no replay on
 *   subscribe** (consistent with `app.onStateChange`): call {@link getStatus}
 *   once at startup if you need the initial value.
 */
export class NetworkModule {
  constructor(private readonly bridge: Bridge) {}

  /** Query the current reachability on demand. */
  getStatus(): Promise<NetworkStatus> {
    return this.bridge.call<NetworkStatus>(NetworkMethods.GET_STATUS)
  }

  /** Subscribe to every connectivity transition. Returns an unsubscribe fn. */
  onStatusChange(callback: (status: NetworkStatus) => void): () => void {
    return this.bridge.on(NetworkMethods.STATUS_CHANGE, (params) =>
      callback(params as NetworkStatus)
    )
  }
}
