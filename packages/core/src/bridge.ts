// Docs: docs/concepts/architecture.md, docs/reference/core-api.md
import { CapsuleError, CapsuleErrorCode } from './errors.js'

export type { CapsuleError }

// ── JSON-RPC wire types ──────────────────────────────────────────────────────

type JsonRpcRequest = {
  jsonrpc: '2.0'
  id: string
  method: string
  params?: unknown
}

type JsonRpcSuccess = {
  jsonrpc: '2.0'
  id: string
  result: unknown
}

type JsonRpcError = {
  jsonrpc: '2.0'
  id: string
  error: { code: number; message: string; data?: unknown }
}

type JsonRpcNotification = {
  jsonrpc: '2.0'
  method: string
  params?: unknown
  // no id — distinguishes notifications from responses
}

// ── Public interface ─────────────────────────────────────────────────────────

/** Receives the `params` of a native notification (an event pushed without a request). */
export type NotificationHandler = (params: unknown) => void

/**
 * Contract that all modules depend on. Allows injection of FakeBridge in tests.
 *
 * Messages are JSON-RPC 2.0 over the WebView: requests carry an `id` and get exactly one
 * response; notifications carry no `id` and fan out to every `on()` subscriber.
 */
export interface Bridge {
  /**
   * Sends a request to the native shell and resolves with its `result`. Rejects with a
   * {@link CapsuleError} carrying the native error code — `BRIDGE_UNAVAILABLE` outside the shell.
   */
  call<T = unknown>(method: string, params?: unknown): Promise<T>
  /** Subscribes to a native notification; returns the function that unsubscribes. */
  on(method: string, handler: NotificationHandler): () => void
}

// ── Native host declaration ──────────────────────────────────────────────────

declare const __capsule_host: {
  postMessage: (json: string) => void
}

declare global {
  interface Window {
    __capsuleReceive: (json: string) => void
  }
}

// ── Implementation ───────────────────────────────────────────────────────────

type ResponseHandler = (response: JsonRpcSuccess | JsonRpcError) => void

class CapsuleBridge implements Bridge {
  private pendingRequests = new Map<string, ResponseHandler>()
  private notificationHandlers = new Map<string, Set<NotificationHandler>>()
  private requestCounter = 0
  private isNative = typeof __capsule_host !== 'undefined'

  constructor() {
    window.__capsuleReceive = (json: string) => {
      this.handleMessage(json)
    }
  }

  call<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.isNative) {
      return Promise.reject(CapsuleError.from(CapsuleErrorCode.BRIDGE_UNAVAILABLE))
    }

    return new Promise<T>((resolve, reject) => {
      const id = `capsule-${++this.requestCounter}-${Date.now()}`
      const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }

      this.pendingRequests.set(id, (response) => {
        if ('error' in response) {
          reject(new CapsuleError(response.error.code, response.error.message, response.error.data))
        } else {
          resolve(response.result as T)
        }
      })

      __capsule_host.postMessage(JSON.stringify(request))
    })
  }

  on(method: string, handler: NotificationHandler): () => void {
    if (!this.notificationHandlers.has(method)) {
      this.notificationHandlers.set(method, new Set())
    }
    this.notificationHandlers.get(method)!.add(handler)

    return () => {
      this.notificationHandlers.get(method)?.delete(handler)
    }
  }

  private handleMessage(json: string) {
    let msg: JsonRpcSuccess | JsonRpcError | JsonRpcNotification

    try {
      msg = JSON.parse(json)
    } catch {
      console.error('[Capsule] Failed to parse bridge message:', json)
      return
    }

    if (!('id' in msg)) {
      const notification = msg as JsonRpcNotification
      this.notificationHandlers.get(notification.method)?.forEach((h) => h(notification.params))
      return
    }

    const handler = this.pendingRequests.get(msg.id)
    if (handler) {
      this.pendingRequests.delete(msg.id)
      handler(msg as JsonRpcSuccess | JsonRpcError)
    }
  }
}

// Singleton — wired once per page
/** The native bridge itself — for plugin authors; apps use the module singletons instead. */
export const bridge: Bridge = new CapsuleBridge()
