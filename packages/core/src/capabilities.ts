// Docs: docs/reference/core-api.md
import type { Bridge } from './bridge.js'

/**
 * A map of native capability name → version implemented by the installed shell.
 * The version is bumped whenever a capability's native surface changes in a way
 * pushed JS might depend on (a new method, a changed payload).
 */
export type CapabilityMap = Record<string, number>

export interface Capabilities {
  /** Per-capability native version, e.g. `{ app: 1, camera: 1, filesystem: 1 }`. */
  capabilities: CapabilityMap
}

export const CapabilitiesMethods = {
  GET: 'capsule.getCapabilities',
} as const

/**
 * Reports which native capabilities — and at what version — the **installed
 * shell** provides. This is the OTA-gating contract (Phase 6): a Server Code
 * Push bundle can refuse to call a native API the user's shell predates, rather
 * than failing at runtime with `METHOD_NOT_FOUND`. Each native module declares
 * its own version; the shell answers the aggregate here.
 */
export class CapabilitiesModule {
  constructor(private readonly bridge: Bridge) {}

  /** Fetch the full capability → version map from the shell. */
  get(): Promise<Capabilities> {
    return this.bridge.call<Capabilities>(CapabilitiesMethods.GET)
  }

  /** `true` if the shell provides `name` at version ≥ `minVersion` (default 1). */
  async has(name: string, minVersion = 1): Promise<boolean> {
    const { capabilities } = await this.get()
    return (capabilities[name] ?? 0) >= minVersion
  }
}
