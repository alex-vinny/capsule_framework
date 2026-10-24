import { describe, it, expect, beforeEach } from 'vitest'
import { AlertsModule, type AlertOptions, type AlertStyle } from '../alerts.js'
import { FakeBridge } from '../testing/fake-bridge.js'
import { CapsuleError } from '../errors.js'

describe('AlertsModule', () => {
  let bridge: FakeBridge
  let alerts: AlertsModule

  beforeEach(() => {
    bridge = new FakeBridge()
    alerts = new AlertsModule(bridge)
  })

  it('show calls alerts.show with message and returns action', async () => {
    bridge.mockResolve('alerts.show', { action: 'OK' })

    const result = await alerts.show({ message: 'Hello' })

    expect(result).toEqual({ action: 'OK' })
    expect(bridge.calls[0]).toEqual({
      method: 'alerts.show',
      params: { message: 'Hello' },
    })
  })

  it('passes title when provided', async () => {
    bridge.mockResolve('alerts.show', { action: 'OK' })

    await alerts.show({ message: 'Are you sure?', title: 'Confirm' })

    expect(bridge.calls[0].params).toEqual({ message: 'Are you sure?', title: 'Confirm' })
  })

  it('passes buttons when provided', async () => {
    bridge.mockResolve('alerts.show', { action: 'Cancel' })

    const options: AlertOptions = {
      message: 'Delete this item?',
      title: 'Delete',
      buttons: [
        { label: 'Cancel', role: 'cancel' },
        { label: 'Delete', role: 'destructive' },
      ],
    }

    const result = await alerts.show(options)

    expect(result).toEqual({ action: 'Cancel' })
    expect(bridge.calls[0].params).toEqual(options)
  })

  it('returns the label of the button pressed', async () => {
    bridge.mockResolve('alerts.show', { action: 'Delete' })

    const result = await alerts.show({
      message: 'Are you sure?',
      buttons: [
        { label: 'Cancel', role: 'cancel' },
        { label: 'Delete', role: 'destructive' },
      ],
    })

    expect(result.action).toBe('Delete')
  })

  it('propagates bridge errors', async () => {
    bridge.mockReject('alerts.show', new CapsuleError(1003, 'INTERNAL_ERROR'))
    await expect(alerts.show({ message: 'Hello' })).rejects.toThrow('INTERNAL_ERROR')
  })

  it('passes style object to bridge when provided', async () => {
    bridge.mockResolve('alerts.show', { action: 'OK' })
    const style: AlertStyle = {
      accentColor: '#FF0000',
      backgroundColor: '#FFFFFF',
      titleColor: '#333333',
      messageColor: '#666666',
      cornerRadius: 12,
    }

    await alerts.show({ message: 'Styled', style })

    expect(bridge.calls[0].params).toEqual({ message: 'Styled', style })
  })

  it('omits style key when not provided', async () => {
    bridge.mockResolve('alerts.show', { action: 'OK' })

    await alerts.show({ message: 'Plain' })

    expect(bridge.calls[0].params).not.toHaveProperty('style')
  })

  it('supports partial style — only accentColor', async () => {
    bridge.mockResolve('alerts.show', { action: 'OK' })
    const style: AlertStyle = { accentColor: '#0099FF' }

    await alerts.show({ message: 'Tinted', style })

    expect(bridge.calls[0].params).toEqual({ message: 'Tinted', style: { accentColor: '#0099FF' } })
  })
})
