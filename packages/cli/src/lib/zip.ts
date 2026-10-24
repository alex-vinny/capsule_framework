// Docs: docs/contributing/codesync-internals.md
import { createWriteStream } from 'node:fs'
import { ZipArchive } from 'archiver'

/**
 * Zips the contents of `dir` (not the directory itself) into `zipPath`.
 * Pure Node — the same on Windows, macOS and Linux.
 */
export async function zipDirectory(dir: string, zipPath: string): Promise<void> {
  const output = createWriteStream(zipPath)
  const closed = new Promise<void>((resolve, reject) => {
    output.on('close', resolve)
    output.on('error', reject)
  })
  const archive = new ZipArchive({ zlib: { level: 9 } })
  archive.on('error', (err: Error) => output.destroy(err))
  archive.pipe(output)
  archive.directory(dir, false)
  await archive.finalize()
  await closed
}
