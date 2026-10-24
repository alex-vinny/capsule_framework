// Docs: docs/guide/ota-updates.md, docs/contributing/codesync-internals.md, docs/reference/core-api.md
import type { Bridge } from './bridge.js'

/**
 * Status of an OTA update check.
 */
export type CodeSyncStatus =
  | 'idle'
  | 'checking'
  | 'download ready'
  | 'downloading'
  | 'download failed'
  | 'applying'
  | 'update applied'
  | 'error'

/**
 * Information about an available update.
 */
export interface CodeSyncUpdate {
  /** Version string (semver) of the available update. */
  version: string
  /** Build number of the available update. */
  buildNumber: number
  /** Release notes (if provided). */
  notes?: string
  /** Whether the update is mandatory. */
  mandatory: boolean
  /** Rollout percentage for this update. */
  rolloutPercent: number
}

/**
 * Result of a manual update check.
 */
export interface CodeSyncCheckResult {
  /** Current status of the update check. */
  status: CodeSyncStatus
  /** Information about an available update, if any. */
  update?: CodeSyncUpdate
}

/**
 * Bridge method names for the CodeSync module — single source of truth, shared with WebBridge.
 */
export const CodeSyncMethods = {
  CHECK_FOR_UPDATE: 'codesync.checkForUpdate',
  GET_STATUS: 'codesync.getStatus',
  APPLY_UPDATE: 'codesync.applyUpdate',
} as const

export class CodeSyncModule {
  constructor(private readonly bridge: Bridge) {}

  /**
   * Manually check for an available OTA update.
   * @returns A promise that resolves to information about an available update, or null if no update is available.
   */
  async checkForUpdate(): Promise<CodeSyncUpdate | null> {
    const result = await this.bridge.call<CodeSyncCheckResult>(CodeSyncMethods.CHECK_FOR_UPDATE, {})

    if (result.status === 'download ready' && result.update) {
      return result.update
    }

    return null
  }

  /**
   * Get the current status of the OTA update system.
   * @returns A promise that resolves to the current status.
   */
  async getStatus(): Promise<CodeSyncStatus> {
    const result = await this.bridge.call<CodeSyncCheckResult>(CodeSyncMethods.GET_STATUS, {})
    return result.status
  }

  /**
   * Apply a previously downloaded update.
   * This should be called after `checkForUpdate()` returns an update and the user has chosen to install it.
   * @returns A promise that resolves when the update has been applied.
   */
  async applyUpdate(): Promise<void> {
    await this.bridge.call<void>(CodeSyncMethods.APPLY_UPDATE, {})
  }
}
