import type { Bridge, NotificationHandler } from '../bridge.js'
import { CapsuleError } from '../errors.js'

/** One recorded bridge call. */
export type CallRecord = { method: string; params: unknown }

/**
 * Test double for Bridge. Configure responses per method, inspect recorded calls.
 */
export class FakeBridge implements Bridge {
  private responses = new Map<string, () => Promise<unknown>>()
  private notificationHandlers = new Map<string, Set<NotificationHandler>>()

  readonly calls: CallRecord[] = []

  /** Register a resolved response for a method. */
  mockResolve(method: string, value: unknown): this {
    this.responses.set(method, () => Promise.resolve(value))
    return this
  }

  /** Register a rejected error for a method. */
  mockReject(method: string, error: CapsuleError): this {
    this.responses.set(method, () => Promise.reject(error))
    return this
  }

  /** Emit a notification to all registered listeners (for watch/subscribe tests). */
  emit(method: string, params: unknown): void {
    this.notificationHandlers.get(method)?.forEach((h) => h(params))
  }

  call<T = unknown>(method: string, params?: unknown): Promise<T> {
    this.calls.push({ method, params })
    const factory = this.responses.get(method)
    if (!factory) {
      return Promise.reject(
        new CapsuleError(1002, `METHOD_NOT_FOUND: no mock registered for '${method}'`)
      )
    }
    return factory() as Promise<T>
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
}
