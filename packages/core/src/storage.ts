// Docs: docs/reference/core-api.md
import type { Bridge } from './bridge.js'

const METHODS = {
  GET: 'storage.get',
  SET: 'storage.set',
  REMOVE: 'storage.remove',
  CLEAR: 'storage.clear',
  KEYS: 'storage.keys',
} as const

/**
 * Persistent string key/value storage, private to the app (Android `SharedPreferences`).
 * Survives restarts and app updates; cleared when the app is uninstalled. Use the `storage`
 * singleton. Store structured data as JSON, or use `db` for anything relational.
 */
export class StorageModule {
  constructor(private readonly bridge: Bridge) {}

  /** Returns the value stored under `key`, or `null` when there is none. */
  async get(key: string): Promise<string | null> {
    const result = await this.bridge.call<{ value: string | null }>(METHODS.GET, { key })
    return result.value
  }

  /** Stores `value` under `key`, replacing any previous value. */
  set(key: string, value: string): Promise<void> {
    return this.bridge.call(METHODS.SET, { key, value })
  }

  /** Deletes `key`; a missing key is not an error. */
  remove(key: string): Promise<void> {
    return this.bridge.call(METHODS.REMOVE, { key })
  }

  /** Deletes every key this app stored. */
  clear(): Promise<void> {
    return this.bridge.call(METHODS.CLEAR)
  }

  /** Lists every stored key, in no particular order. */
  async keys(): Promise<string[]> {
    const result = await this.bridge.call<{ keys: string[] }>(METHODS.KEYS)
    return result.keys
  }
}
