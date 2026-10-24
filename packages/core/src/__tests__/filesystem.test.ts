import { describe, it, expect, beforeEach } from 'vitest'
import { FilesystemModule, type FileEntry, type FileStat } from '../filesystem.js'
import { FakeBridge } from '../testing/fake-bridge.js'
import { CapsuleError } from '../errors.js'

describe('FilesystemModule', () => {
  let bridge: FakeBridge
  let fs: FilesystemModule

  beforeEach(() => {
    bridge = new FakeBridge()
    fs = new FilesystemModule(bridge)
  })

  it('readFile unwraps the data string and forwards path + options', async () => {
    bridge.mockResolve('filesystem.readFile', { data: 'hello' })

    const data = await fs.readFile('notes/a.txt', { directory: 'cache', encoding: 'utf8' })

    expect(data).toBe('hello')
    expect(bridge.calls[0]).toEqual({
      method: 'filesystem.readFile',
      params: { path: 'notes/a.txt', directory: 'cache', encoding: 'utf8' },
    })
  })

  it('writeFile passes path + data + options and returns the uri', async () => {
    bridge.mockResolve('filesystem.writeFile', { uri: 'file:///data/a.txt' })

    const result = await fs.writeFile('a.txt', 'body', { encoding: 'base64' })

    expect(result).toEqual({ uri: 'file:///data/a.txt' })
    expect(bridge.calls[0].params).toEqual({ path: 'a.txt', data: 'body', encoding: 'base64' })
  })

  it('appendFile forwards path + data', async () => {
    bridge.mockResolve('filesystem.appendFile', {})
    await fs.appendFile('log.txt', 'line\n')
    expect(bridge.calls[0]).toEqual({
      method: 'filesystem.appendFile',
      params: { path: 'log.txt', data: 'line\n' },
    })
  })

  it('deleteFile forwards path', async () => {
    bridge.mockResolve('filesystem.deleteFile', {})
    await fs.deleteFile('a.txt')
    expect(bridge.calls[0]).toEqual({
      method: 'filesystem.deleteFile',
      params: { path: 'a.txt' },
    })
  })

  it('mkdir forwards recursive option', async () => {
    bridge.mockResolve('filesystem.mkdir', {})
    await fs.mkdir('nested/dir', { recursive: true })
    expect(bridge.calls[0].params).toEqual({ path: 'nested/dir', recursive: true })
  })

  it('rmdir forwards recursive option', async () => {
    bridge.mockResolve('filesystem.rmdir', {})
    await fs.rmdir('dir', { recursive: true })
    expect(bridge.calls[0].params).toEqual({ path: 'dir', recursive: true })
  })

  it('readdir unwraps the files array', async () => {
    const entries: FileEntry[] = [{ name: 'a.txt', uri: 'u', type: 'file', size: 3 }]
    bridge.mockResolve('filesystem.readdir', { files: entries })

    const files = await fs.readdir('dir')

    expect(files).toEqual(entries)
    expect(bridge.calls[0].params).toEqual({ path: 'dir' })
  })

  it('stat returns the FileStat directly', async () => {
    const stat: FileStat = { uri: 'u', type: 'file', size: 12, mtime: 1700000000000 }
    bridge.mockResolve('filesystem.stat', stat)

    expect(await fs.stat('a.txt')).toEqual(stat)
  })

  it('getUri unwraps the uri string', async () => {
    bridge.mockResolve('filesystem.getUri', { uri: 'file:///data/a.txt' })
    expect(await fs.getUri('a.txt')).toBe('file:///data/a.txt')
  })

  it('downloadFile forwards the options object', async () => {
    const stat: FileStat = { uri: 'u', type: 'file', size: 100, mtime: 1 }
    bridge.mockResolve('filesystem.downloadFile', stat)

    const result = await fs.downloadFile({
      url: 'https://x/y.bin',
      path: 'y.bin',
      directory: 'cache',
    })

    expect(result).toEqual(stat)
    expect(bridge.calls[0].params).toEqual({
      url: 'https://x/y.bin',
      path: 'y.bin',
      directory: 'cache',
    })
  })

  it('propagates FILE_NOT_FOUND', async () => {
    bridge.mockReject('filesystem.readFile', new CapsuleError(5001, 'FILE_NOT_FOUND'))
    await expect(fs.readFile('missing.txt')).rejects.toThrow('FILE_NOT_FOUND')
  })

  it('propagates PATH_NOT_ALLOWED', async () => {
    bridge.mockReject('filesystem.writeFile', new CapsuleError(5003, 'PATH_NOT_ALLOWED'))
    await expect(fs.writeFile('../escape.txt', 'x')).rejects.toThrow('PATH_NOT_ALLOWED')
  })
})
