// Docs: docs/reference/core-api.md
import type { Bridge } from './bridge.js'

const METHODS = {
  READ: 'clipboard.read',
  WRITE: 'clipboard.write',
} as const

/** The system clipboard (plain text). Use the `clipboard` singleton. */
export class ClipboardModule {
  constructor(private readonly bridge: Bridge) {}

  /** Returns the clipboard text, or `null` when the clipboard is empty or holds no text. */
  async read(): Promise<string | null> {
    const result = await this.bridge.call<{ value: string | null }>(METHODS.READ)
    return result.value
  }

  /** Replaces the clipboard contents with `text`. */
  write(text: string): Promise<void> {
    return this.bridge.call(METHODS.WRITE, { text })
  }
}
