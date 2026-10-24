import { describe, it, expect, beforeEach } from 'vitest'
import { CodeSyncModule, type CodeSyncUpdate, type CodeSyncCheckResult } from '../codesync.js'
import { FakeBridge } from '../testing/fake-bridge.js'
import { CapsuleError } from '../errors.js'

const mockUpdate: CodeSyncUpdate = {
  version: '1.1.0',
  buildNumber: 2,
  notes: 'Bug fixes and performance improvements',
  mandatory: false,
  rolloutPercent: 50,
}

const mockCheckResult: CodeSyncCheckResult = {
  status: 'download ready',
  update: mockUpdate,
}

describe('CodeSyncModule', () => {
  let bridge: FakeBridge
  let codesync: CodeSyncModule

  beforeEach(() => {
    bridge = new FakeBridge()
    codesync = new CodeSyncModule(bridge)
  })

  it('checkForUpdate calls the correct method and returns the update', async () => {
    bridge.mockResolve('codesync.checkForUpdate', mockCheckResult)

    const update = await codesync.checkForUpdate()

    expect(update).toEqual(mockUpdate)
    expect(bridge.calls[0]).toEqual({ method: 'codesync.checkForUpdate', params: {} })
  })

  it('checkForUpdate returns null when no update is available', async () => {
    const noUpdateResult: CodeSyncCheckResult = {
      status: 'idle',
      update: undefined,
    }
    bridge.mockResolve('codesync.checkForUpdate', noUpdateResult)

    const update = await codesync.checkForUpdate()

    expect(update).toBeNull()
    expect(bridge.calls[0]).toEqual({ method: 'codesync.checkForUpdate', params: {} })
  })

  it('getStatus calls the correct method and returns the status', async () => {
    bridge.mockResolve('codesync.getStatus', mockCheckResult)

    const status = await codesync.getStatus()

    expect(status).toEqual('download ready')
    expect(bridge.calls[0]).toEqual({ method: 'codesync.getStatus', params: {} })
  })

  it('applyUpdate calls the correct method', async () => {
    bridge.mockResolve('codesync.applyUpdate', undefined)

    await codesync.applyUpdate()

    expect(bridge.calls[0]).toEqual({ method: 'codesync.applyUpdate', params: {} })
  })

  it('propagates errors from checkForUpdate', async () => {
    bridge.mockReject('codesync.checkForUpdate', new CapsuleError(1001, 'NETWORK_ERROR'))
    await expect(codesync.checkForUpdate()).rejects.toThrow('NETWORK_ERROR')
  })

  it('propagates errors from getStatus', async () => {
    bridge.mockReject('codesync.getStatus', new CapsuleError(1002, 'SERVER_ERROR'))
    await expect(codesync.getStatus()).rejects.toThrow('SERVER_ERROR')
  })

  it('propagates errors from applyUpdate', async () => {
    bridge.mockReject('codesync.applyUpdate', new CapsuleError(1003, 'APPLY_FAILED'))
    await expect(codesync.applyUpdate()).rejects.toThrow('APPLY_FAILED')
  })
})
