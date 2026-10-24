// Docs: docs/reference/core-api.md
import type { Bridge } from './bridge.js'

/**
 * Logical storage location. Apps address files by `(directory, relative path)`
 * rather than absolute paths, so the same code resolves correctly on Android,
 * iOS, and the browser fallback.
 *
 * All three map to **app-private** storage that is deliberately kept *outside*
 * the OTA-swappable bundle dirs (`www/` + `server/bundle.js`) — a code-push
 * bundle swap never touches user data written here.
 *
 * - `data` — persistent app data. Survives until explicitly deleted.
 * - `cache` — same API, but the OS may reclaim it under storage pressure.
 * - `documents` — persistent, user-facing documents (export targets).
 */
export type FilesystemDirectory = 'data' | 'cache' | 'documents'

/** How file bytes cross the bridge. `utf8` for text, `base64` for binary. */
export type FileEncoding = 'utf8' | 'base64'

/** One entry returned by {@link FilesystemModule.readdir}. */
export interface FileEntry {
  /** Entry name (last path segment), not the full path. */
  name: string
  /** Directly usable as a fetch/`<img src>` target where supported. */
  uri: string
  type: 'file' | 'directory'
  /** Size in bytes (0 for directories). */
  size: number
}

export interface FileStat {
  uri: string
  type: 'file' | 'directory'
  /** Size of the encoded file in bytes (0 for directories). */
  size: number
  /** Last-modified time, epoch milliseconds. */
  mtime: number
}

export interface DirectoryOption {
  /** Logical root to resolve `path` against. Default `'data'`. */
  directory?: FilesystemDirectory
}

export interface ReadFileOptions extends DirectoryOption {
  /** How to decode the bytes. Default `'utf8'`. */
  encoding?: FileEncoding
}

export interface WriteFileOptions extends DirectoryOption {
  /** How `data` is encoded. Default `'utf8'`. */
  encoding?: FileEncoding
  /** Create missing parent directories. Default `true`. */
  recursive?: boolean
}

export interface MkdirOptions extends DirectoryOption {
  /** Create missing intermediate directories. Default `true`. */
  recursive?: boolean
}

export interface RmdirOptions extends DirectoryOption {
  /** Remove a non-empty directory and its contents. Default `false`. */
  recursive?: boolean
}

export interface DownloadFileOptions extends DirectoryOption {
  /** Remote URL to fetch. Requires the INTERNET permission (declared by the CLI). */
  url: string
  /** Destination path, relative to `directory`. */
  path: string
  /** Create missing parent directories. Default `true`. */
  recursive?: boolean
}

/** Bridge method names — single source of truth, shared with WebBridge. */
export const FilesystemMethods = {
  READ_FILE: 'filesystem.readFile',
  WRITE_FILE: 'filesystem.writeFile',
  APPEND_FILE: 'filesystem.appendFile',
  DELETE_FILE: 'filesystem.deleteFile',
  MKDIR: 'filesystem.mkdir',
  RMDIR: 'filesystem.rmdir',
  READDIR: 'filesystem.readdir',
  STAT: 'filesystem.stat',
  GET_URI: 'filesystem.getUri',
  DOWNLOAD_FILE: 'filesystem.downloadFile',
} as const

/**
 * App-private filesystem. Foundational native API: later capabilities
 * (downloads, media serving, SQLite) build on it. Errors reject with a
 * {@link CapsuleError}: `FILE_NOT_FOUND` (5001), `FILE_IO_ERROR` (5002),
 * `PATH_NOT_ALLOWED` (5003 — a path escaping its directory root).
 */
export class FilesystemModule {
  constructor(private readonly bridge: Bridge) {}

  /** Read a file and return its contents decoded per `options.encoding`. */
  async readFile(path: string, options?: ReadFileOptions): Promise<string> {
    const result = await this.bridge.call<{ data: string }>(FilesystemMethods.READ_FILE, {
      path,
      ...options,
    })
    return result.data
  }

  /** Write `data` to a file, creating it (and parents) if needed. Returns its URI. */
  writeFile(path: string, data: string, options?: WriteFileOptions): Promise<{ uri: string }> {
    return this.bridge.call<{ uri: string }>(FilesystemMethods.WRITE_FILE, {
      path,
      data,
      ...options,
    })
  }

  /** Append `data` to a file, creating it (and parents) if needed. */
  appendFile(path: string, data: string, options?: WriteFileOptions): Promise<void> {
    return this.bridge.call(FilesystemMethods.APPEND_FILE, { path, data, ...options })
  }

  /** Delete a single file. Rejects with `FILE_NOT_FOUND` if it does not exist. */
  deleteFile(path: string, options?: DirectoryOption): Promise<void> {
    return this.bridge.call(FilesystemMethods.DELETE_FILE, { path, ...options })
  }

  /** Create a directory. */
  mkdir(path: string, options?: MkdirOptions): Promise<void> {
    return this.bridge.call(FilesystemMethods.MKDIR, { path, ...options })
  }

  /** Remove a directory (empty unless `recursive: true`). */
  rmdir(path: string, options?: RmdirOptions): Promise<void> {
    return this.bridge.call(FilesystemMethods.RMDIR, { path, ...options })
  }

  /** List the entries of a directory. */
  async readdir(path: string, options?: DirectoryOption): Promise<FileEntry[]> {
    const result = await this.bridge.call<{ files: FileEntry[] }>(FilesystemMethods.READDIR, {
      path,
      ...options,
    })
    return result.files
  }

  /** Stat a file or directory. Rejects with `FILE_NOT_FOUND` if absent. */
  stat(path: string, options?: DirectoryOption): Promise<FileStat> {
    return this.bridge.call<FileStat>(FilesystemMethods.STAT, { path, ...options })
  }

  /** Resolve the platform URI for a path without touching the filesystem. */
  async getUri(path: string, options?: DirectoryOption): Promise<string> {
    const result = await this.bridge.call<{ uri: string }>(FilesystemMethods.GET_URI, {
      path,
      ...options,
    })
    return result.uri
  }

  /** Download a remote URL straight to a file, bypassing the JS bridge for the bytes. */
  downloadFile(options: DownloadFileOptions): Promise<FileStat> {
    return this.bridge.call<FileStat>(FilesystemMethods.DOWNLOAD_FILE, { ...options })
  }
}
