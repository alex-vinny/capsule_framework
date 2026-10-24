import { describe, it, expect, beforeEach } from 'vitest'
import { StorageModule } from '../storage.js'
import { FakeBridge } from '../testing/fake-bridge.js'
import { CapsuleError } from '../errors.js'

describe('StorageModule', () => {
  let bridge: FakeBridge
  let storage: StorageModule

  beforeEach(() => {
    bridge = new FakeBridge()
    storage = new StorageModule(bridge)
  })

  it('get calls storage.get with the key and returns value', async () => {
    bridge.mockResolve('storage.get', { value: 'bar' })

    const value = await storage.get('foo')

    expect(value).toBe('bar')
    expect(bridge.calls[0]).toEqual({ method: 'storage.get', params: { key: 'foo' } })
  })

  it('get returns null for missing key', async () => {
    bridge.mockResolve('storage.get', { value: null })
    expect(await storage.get('missing')).toBeNull()
  })

  it('set calls storage.set with key and value', async () => {
    bridge.mockResolve('storage.set', undefined)

    await storage.set('theme', 'dark')

    expect(bridge.calls[0]).toEqual({
      method: 'storage.set',
      params: { key: 'theme', value: 'dark' },
    })
  })

  it('remove calls storage.remove with the key', async () => {
    bridge.mockResolve('storage.remove', undefined)

    await storage.remove('theme')

    expect(bridge.calls[0]).toEqual({ method: 'storage.remove', params: { key: 'theme' } })
  })

  it('clear calls storage.clear', async () => {
    bridge.mockResolve('storage.clear', undefined)

    await storage.clear()

    expect(bridge.calls[0]).toEqual({ method: 'storage.clear', params: undefined })
  })

  it('keys returns the list of keys', async () => {
    bridge.mockResolve('storage.keys', { keys: ['a', 'b', 'c'] })

    const keys = await storage.keys()

    expect(keys).toEqual(['a', 'b', 'c'])
    expect(bridge.calls[0]).toEqual({ method: 'storage.keys', params: undefined })
  })

  it('propagates bridge errors', async () => {
    bridge.mockReject('storage.set', new CapsuleError(1003, 'INTERNAL_ERROR'))
    await expect(storage.set('k', 'v')).rejects.toThrow('INTERNAL_ERROR')
  })
})
