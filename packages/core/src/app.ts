// Docs: docs/reference/core-api.md
import type { Bridge } from './bridge.js'

/**
 * Foreground/background state of the app.
 *
 * Deliberately a **binary** contract: Android (resumed/paused/stopped) and iOS
 * (active/inactive/background) disagree on the middle states, but both agree on
 * "is the app in the foreground and interactive?". Modelling that single bit
 * keeps the cross-platform seam honest — the same listener fires identically on
 * both platforms. A richer `state` enum can be layered on later without breaking
 * this shape.
 */
export interface AppState {
  /** `true` while the app is foregrounded and receiving input. */
  isActive: boolean
}

/** Payload for a deep link / universal link delivered while the app is running. */
export interface UrlOpenEvent {
  /** The full incoming URL, e.g. `myapp://order/42` or `https://acme.com/order/42`. */
  url: string
}

/**
 * Bridge method names — single source of truth, shared with WebBridge and the
 * native handlers. `stateChange` and `urlOpen` are **notifications** (native →
 * JS push, no response), the rest are request/response.
 */
export const AppMethods = {
  GET_STATE: 'app.getState',
  GET_LAUNCH_URL: 'app.getLaunchUrl',
  STATE_CHANGE: 'app.stateChange',
  URL_OPEN: 'app.urlOpen',
} as const

/**
 * App lifecycle + deep links. **Infrastructure**, not just an API: push
 * tap-routing and OTA foreground re-checks both build on the events emitted here.
 *
 * - {@link onStateChange} / {@link onResume} / {@link onPause} — foreground &
 *   background transitions. On Android these come from `ProcessLifecycleOwner`,
 *   so internal activity transitions (e.g. opening the camera picker) do **not**
 *   spuriously fire background/foreground.
 * - {@link onUrlOpen} — a deep link arriving while the app is already running.
 * - {@link getLaunchUrl} — the deep link the app was *cold-started* with
 *   (consumed once; resolves `null` afterwards or on a normal launch).
 */
export class AppModule {
  constructor(private readonly bridge: Bridge) {}

  /** Query the current foreground state on demand. */
  getState(): Promise<AppState> {
    return this.bridge.call<AppState>(AppMethods.GET_STATE)
  }

  /**
   * The URL the app was *cold-started* with via a deep link, or `null` for a
   * normal launch. Consume-once: a second call resolves `null`.
   *
   * Cold-start links surface **here** and **not** through {@link onUrlOpen} (which
   * fires only for links arriving while the app is already running) — so route on
   * both at startup to cover every entry path:
   *
   * ```ts
   * const { url } = await app.getLaunchUrl()
   * if (url) route(url)            // launched by a deep link
   * app.onUrlOpen(({ url }) => route(url))  // links while running
   * ```
   */
  getLaunchUrl(): Promise<{ url: string | null }> {
    return this.bridge.call<{ url: string | null }>(AppMethods.GET_LAUNCH_URL)
  }

  /** Subscribe to every foreground/background transition. Returns an unsubscribe fn. */
  onStateChange(callback: (state: AppState) => void): () => void {
    return this.bridge.on(AppMethods.STATE_CHANGE, (params) => callback(params as AppState))
  }

  /** Subscribe to deep links delivered while the app is running. Returns an unsubscribe fn. */
  onUrlOpen(callback: (event: UrlOpenEvent) => void): () => void {
    return this.bridge.on(AppMethods.URL_OPEN, (params) => callback(params as UrlOpenEvent))
  }

  /** Sugar over {@link onStateChange}: fires only when the app returns to the foreground. */
  onResume(callback: () => void): () => void {
    return this.onStateChange((state) => {
      if (state.isActive) callback()
    })
  }

  /** Sugar over {@link onStateChange}: fires only when the app leaves the foreground. */
  onPause(callback: () => void): () => void {
    return this.onStateChange((state) => {
      if (!state.isActive) callback()
    })
  }
}
