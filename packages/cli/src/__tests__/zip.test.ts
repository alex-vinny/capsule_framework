import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipDirectory } from '../lib/zip.js'

describe('zipDirectory', () => {
  const dirs: string[] = []
  const tempDir = () => {
    const dir = mkdtempSync(join(tmpdir(), 'capsule-zip-'))
    dirs.push(dir)
    return dir
  }
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

  it('writes a zip holding the directory contents at the archive root', async () => {
    const src = tempDir()
    mkdirSync(join(src, 'www'))
    writeFileSync(join(src, 'www', 'index.html'), '<html></html>')
    writeFileSync(join(src, 'capsule-bundle.json'), '{}')
    const zipPath = join(tempDir(), 'bundle.zip')

    await zipDirectory(src, zipPath)

    const zip = readFileSync(zipPath)
    expect(zip.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04])) // local file header
    // Entry names are stored uncompressed — relative to the root, forward slashes, no src prefix.
    const names = zip.toString('latin1')
    expect(names).toContain('www/index.html')
    expect(names).toContain('capsule-bundle.json')
    expect(names).not.toContain(src.replace(/\\/g, '/'))
  })
})
