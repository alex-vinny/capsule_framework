// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { WebBridge } from '../web-bridge.js'
import { CapsuleError, CapsuleErrorCode } from '../errors.js'

describe('WebBridge', () => {
  let bridge: WebBridge

  beforeEach(() => {
    localStorage.clear()
    bridge = new WebBridge()
  })

  describe('storage', () => {
    it('set and get round-trip', async () => {
      await bridge.call('storage.set', { key: 'color', value: 'blue' })
      const { value } = await bridge.call<{ value: string | null }>('storage.get', { key: 'color' })
      expect(value).toBe('blue')
    })

    it('get returns null for missing key', async () => {
      const { value } = await bridge.call<{ value: string | null }>('storage.get', { key: 'nope' })
      expect(value).toBeNull()
    })

    it('remove deletes a key', async () => {
      await bridge.call('storage.set', { key: 'tmp', value: '1' })
      await bridge.call('storage.remove', { key: 'tmp' })
      const { value } = await bridge.call<{ value: string | null }>('storage.get', { key: 'tmp' })
      expect(value).toBeNull()
    })

    it('clear removes only capsule-prefixed keys', async () => {
      localStorage.setItem('external', 'keep')
      await bridge.call('storage.set', { key: 'a', value: '1' })
      await bridge.call('storage.set', { key: 'b', value: '2' })
      await bridge.call('storage.clear')
      expect(localStorage.getItem('external')).toBe('keep')
      const { keys } = await bridge.call<{ keys: string[] }>('storage.keys')
      expect(keys).toHaveLength(0)
    })

    it('keys returns stored keys without the internal prefix', async () => {
      await bridge.call('storage.set', { key: 'x', value: '1' })
      await bridge.call('storage.set', { key: 'y', value: '2' })
      const { keys } = await bridge.call<{ keys: string[] }>('storage.keys')
      expect(keys).toEqual(expect.arrayContaining(['x', 'y']))
      expect(keys).toHaveLength(2)
    })
  })

  describe('app lifecycle', () => {
    it('getState reflects document visibility', async () => {
      const { isActive } = await bridge.call<{ isActive: boolean }>('app.getState')
      expect(isActive).toBe(!document.hidden)
    })

    it('getLaunchUrl resolves null in the browser', async () => {
      expect(await bridge.call('app.getLaunchUrl')).toEqual({ url: null })
    })

    it('emits app.stateChange on visibilitychange', () => {
      const seen: Array<{ isActive: boolean }> = []
      bridge.on('app.stateChange', (p) => seen.push(p as { isActive: boolean }))

      Object.defineProperty(document, 'hidden', { value: true, configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
      Object.defineProperty(document, 'hidden', { value: false, configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))

      expect(seen).toEqual([{ isActive: false }, { isActive: true }])
    })
  })

  describe('network', () => {
    afterEach(() => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    })

    it('getStatus reports connected from navigator.onLine', async () => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
      const status = await bridge.call<{ connected: boolean; connectionType: string }>(
        'network.getStatus'
      )
      expect(status.connected).toBe(true)
      // No Network Information API in happy-dom → transport is undetermined.
      expect(status.connectionType).toBe('unknown')
    })

    it('getStatus reports offline + none transport when navigator.onLine is false', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
      const status = await bridge.call<{ connected: boolean; connectionType: string }>(
        'network.getStatus'
      )
      expect(status).toEqual({ connected: false, connectionType: 'none' })
    })

    it('emits network.statusChange on offline/online events', () => {
      const seen: Array<{ connected: boolean; connectionType: string }> = []
      bridge.on('network.statusChange', (p) =>
        seen.push(p as { connected: boolean; connectionType: string })
      )

      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
      window.dispatchEvent(new Event('offline'))
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
      window.dispatchEvent(new Event('online'))

      expect(seen).toEqual([
        { connected: false, connectionType: 'none' },
        { connected: true, connectionType: 'unknown' },
      ])
    })
  })

  describe('push', () => {
    it('register returns a deterministic dev token', async () => {
      const tok = await bridge.call<{ value: string; platform: string }>('push.register')
      expect(tok).toEqual({ value: 'web-dev-token', platform: 'android' })
    })

    it('channels create / list / remove round-trip in memory', async () => {
      await bridge.call('push.createChannel', { id: 'chat', name: 'Chat', importance: 'high' })
      await bridge.call('push.createChannel', { id: 'news', name: 'News', importance: 'low' })
      let { channels } = await bridge.call<{ channels: Array<{ id: string }> }>('push.listChannels')
      expect(channels.map((c) => c.id)).toEqual(['chat', 'news'])

      await bridge.call('push.removeChannel', { id: 'chat' })
      ;({ channels } = await bridge.call<{ channels: Array<{ id: string }> }>('push.listChannels'))
      expect(channels.map((c) => c.id)).toEqual(['news'])
    })

    it('getLaunchNotification resolves null in the browser', async () => {
      expect(await bridge.call('push.getLaunchNotification')).toEqual({ message: null })
    })

    it('checkPermissions maps the Notification Web API (granted when absent)', async () => {
      // happy-dom has no Notification API → fallback is granted.
      const res = await bridge.call<{ notifications: string }>('push.checkPermissions')
      expect(res).toEqual({ notifications: 'granted' })
    })

    it('__capsulePushSimulate fires push.message and (as a tap) push.notificationTap', () => {
      const messages: Array<{ id: string }> = []
      const taps: Array<{ id: string; launchNotification?: boolean }> = []
      bridge.on('push.message', (p) => messages.push(p as { id: string }))
      bridge.on('push.notificationTap', (p) => taps.push(p as { id: string }))

      const simulate = (
        window as unknown as {
          __capsulePushSimulate: (
            msg: { id: string; title?: string },
            kind?: 'message' | 'tap'
          ) => void
        }
      ).__capsulePushSimulate
      simulate({ id: 'm1', title: 'Hi' })
      simulate({ id: 'm2', title: 'Tapped' }, 'tap')

      expect(messages).toEqual([{ id: 'm1', title: 'Hi' }])
      expect(taps).toEqual([{ id: 'm2', title: 'Tapped', launchNotification: true }])
    })
  })

  describe('capabilities', () => {
    it('reports the web capability map', async () => {
      const { capabilities } = await bridge.call<{ capabilities: Record<string, number> }>(
        'capsule.getCapabilities'
      )
      expect(capabilities.app).toBe(1)
      expect(capabilities.filesystem).toBe(1)
      expect(capabilities.network).toBe(1)
      expect(capabilities.push).toBe(1)
    })
  })

  describe('device.getInfo', () => {
    it('returns web platform info', async () => {
      const info = await bridge.call<{
        platform: string
        model: string
        manufacturer: string
        sdkVersion: string
        isVirtual: boolean
      }>('device.getInfo')
      expect(info.platform).toBe('web')
      expect(info.model).toBe('Browser')
      expect(info.manufacturer).toBe('Web')
      expect(info.sdkVersion).toBe('0')
      expect(info.isVirtual).toBe(false)
    })
  })

  describe('haptics.vibrate', () => {
    it('resolves even when navigator.vibrate is absent', async () => {
      await expect(bridge.call('haptics.vibrate')).resolves.toBeUndefined()
    })
  })

  describe('clipboard', () => {
    afterEach(() => vi.restoreAllMocks())

    it('read returns null when clipboard API is unavailable', async () => {
      vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(undefined as unknown as Clipboard)
      const { value } = await bridge.call<{ value: string | null }>('clipboard.read')
      expect(value).toBeNull()
    })

    it('write resolves silently when clipboard API is unavailable', async () => {
      vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(undefined as unknown as Clipboard)
      await expect(bridge.call('clipboard.write', { text: 'hello' })).resolves.toBeUndefined()
    })
  })

  describe('camera', () => {
    afterEach(() => vi.useRealTimers())

    it('pickImage rejects with OPERATION_CANCELLED when dismissed without a pick', async () => {
      vi.useFakeTimers()
      const promise = bridge.call('camera.pickImage')
      const rejection = expect(promise).rejects.toMatchObject({
        code: CapsuleErrorCode.OPERATION_CANCELLED.code,
      })
      // Simulate the OS picker closing and returning focus with no file chosen.
      window.dispatchEvent(new Event('focus'))
      await vi.advanceTimersByTimeAsync(600)
      await rejection
    })

    it('capturePhoto rejects with OPERATION_CANCELLED when dismissed without a pick', async () => {
      vi.useFakeTimers()
      const promise = bridge.call('camera.capturePhoto')
      const rejection = expect(promise).rejects.toMatchObject({
        code: CapsuleErrorCode.OPERATION_CANCELLED.code,
      })
      window.dispatchEvent(new Event('focus'))
      await vi.advanceTimersByTimeAsync(600)
      await rejection
    })
  })

  describe('filesystem', () => {
    it('writeFile then readFile round-trips utf8 (incl. multi-byte)', async () => {
      await bridge.call('filesystem.writeFile', { path: 'notes/a.txt', data: 'héllo 😀' })
      const { data } = await bridge.call<{ data: string }>('filesystem.readFile', {
        path: 'notes/a.txt',
      })
      expect(data).toBe('héllo 😀')
    })

    it('readFile can return base64 of what was written as utf8', async () => {
      await bridge.call('filesystem.writeFile', { path: 'a.txt', data: 'AB' })
      const { data } = await bridge.call<{ data: string }>('filesystem.readFile', {
        path: 'a.txt',
        encoding: 'base64',
      })
      expect(data).toBe(btoa('AB'))
    })

    it('readFile rejects with FILE_NOT_FOUND for a missing file', async () => {
      const err = await bridge.call('filesystem.readFile', { path: 'nope.txt' }).catch((e) => e)
      expect((err as CapsuleError).code).toBe(CapsuleErrorCode.FILE_NOT_FOUND.code)
    })

    it('appendFile concatenates byte-wise', async () => {
      await bridge.call('filesystem.writeFile', { path: 'log.txt', data: 'a' })
      await bridge.call('filesystem.appendFile', { path: 'log.txt', data: 'b' })
      const { data } = await bridge.call<{ data: string }>('filesystem.readFile', {
        path: 'log.txt',
      })
      expect(data).toBe('ab')
    })

    it('deleteFile removes a file and then rejects on re-delete', async () => {
      await bridge.call('filesystem.writeFile', { path: 'a.txt', data: 'x' })
      await bridge.call('filesystem.deleteFile', { path: 'a.txt' })
      const err = await bridge.call('filesystem.deleteFile', { path: 'a.txt' }).catch((e) => e)
      expect((err as CapsuleError).code).toBe(CapsuleErrorCode.FILE_NOT_FOUND.code)
    })

    it('readdir lists files and (implicit) child directories', async () => {
      await bridge.call('filesystem.writeFile', { path: 'top.txt', data: '1' })
      await bridge.call('filesystem.writeFile', { path: 'sub/deep.txt', data: '2' })
      const { files } = await bridge.call<{ files: Array<{ name: string; type: string }> }>(
        'filesystem.readdir',
        { path: '' }
      )
      const byName = Object.fromEntries(files.map((f) => [f.name, f.type]))
      expect(byName).toEqual({ 'top.txt': 'file', sub: 'directory' })
    })

    it('directories are isolated per directory root', async () => {
      await bridge.call('filesystem.writeFile', { path: 'a.txt', data: '1', directory: 'data' })
      await bridge.call('filesystem.writeFile', { path: 'a.txt', data: '2', directory: 'cache' })
      const data = await bridge.call<{ data: string }>('filesystem.readFile', {
        path: 'a.txt',
        directory: 'data',
      })
      const cache = await bridge.call<{ data: string }>('filesystem.readFile', {
        path: 'a.txt',
        directory: 'cache',
      })
      expect([data.data, cache.data]).toEqual(['1', '2'])
    })

    it('rmdir refuses a non-empty directory unless recursive', async () => {
      await bridge.call('filesystem.writeFile', { path: 'dir/f.txt', data: '1' })
      const err = await bridge.call('filesystem.rmdir', { path: 'dir' }).catch((e) => e)
      expect((err as CapsuleError).code).toBe(CapsuleErrorCode.FILE_IO_ERROR.code)
      await bridge.call('filesystem.rmdir', { path: 'dir', recursive: true })
      const { files } = await bridge.call<{ files: unknown[] }>('filesystem.readdir', { path: '' })
      expect(files).toHaveLength(0)
    })

    it('stat reports size and type', async () => {
      await bridge.call('filesystem.writeFile', { path: 'a.txt', data: 'ABC' })
      const stat = await bridge.call<{ type: string; size: number }>('filesystem.stat', {
        path: 'a.txt',
      })
      expect(stat.type).toBe('file')
      expect(stat.size).toBe(3)
    })

    it('rejects path traversal with PATH_NOT_ALLOWED', async () => {
      const err = await bridge
        .call('filesystem.writeFile', { path: '../escape.txt', data: 'x' })
        .catch((e) => e)
      expect((err as CapsuleError).code).toBe(CapsuleErrorCode.PATH_NOT_ALLOWED.code)
    })
  })

  describe('on / notification handler', () => {
    it('on returns an unsubscribe function', () => {
      const unsubscribe = bridge.on('geolocation.positionUpdate', () => {})
      expect(typeof unsubscribe).toBe('function')
    })

    it('unsubscribe can be called without error', () => {
      const unsubscribe = bridge.on('geolocation.positionUpdate', () => {})
      expect(() => unsubscribe()).not.toThrow()
    })
  })

  describe('unknown method', () => {
    it('rejects with CapsuleError METHOD_NOT_FOUND', async () => {
      const err = await bridge.call('unknown.method').catch((e) => e)
      expect(err).toBeInstanceOf(CapsuleError)
      expect((err as CapsuleError).code).toBe(CapsuleErrorCode.METHOD_NOT_FOUND.code)
    })
  })
})
