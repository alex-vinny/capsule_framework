// Docs: docs/guide/ai.md, docs/decisions/0003-ai-and-agents.md, docs/reference/core-api.md
import type { Bridge } from './bridge.js'

/**
 * Which kind of backend serves AI requests (adr-003):
 *
 * - `os-native` — the OS model: Gemini Nano via AICore (Android), Apple Foundation Models (iOS).
 *   **Flagships only** (Pixel 8+, Galaxy S24+, iPhone 15 Pro+ …) — most devices don't have it.
 * - `bundled` — a small model shipped with the app (Phase 6, not yet available).
 * - `cloud` — Capsule OTA cloud inference (Phase 6, not yet available).
 * - `unavailable` — no tier can serve on this device / shell build.
 */
export type AiTier = 'os-native' | 'bundled' | 'cloud' | 'unavailable'

/**
 * - `ready` — `generate`/`stream` work now.
 * - `downloadable` — supported, but the model must be downloaded first: call {@link AiModule.prepare}.
 * - `downloading` — the model download is in progress; {@link AiModule.prepare} waits for it.
 * - `unavailable` — not supported here; `reason` says why.
 */
export type AiStatus = 'ready' | 'downloadable' | 'downloading' | 'unavailable'

/** The honest answer to "can this app use AI here?" — `reason` explains anything but `ready`. */
export interface AiAvailability {
  tier: AiTier
  status: AiStatus
  reason?: string
}

export interface AiGenerateOptions {
  prompt: string
  /** Upper bound on the reply length, in model tokens. */
  maxTokens?: number
  /** Sampling temperature; lower is more deterministic. */
  temperature?: number
}

/** `length` — `maxTokens` cut the reply short. */
export type AiFinishReason = 'stop' | 'length' | 'other'

export interface AiResult {
  text: string
  finishReason: AiFinishReason
}

/**
 * Bridge method names — single source of truth, shared with WebBridge and the native handlers.
 * `streamChunk` is a **notification** (native → JS, no response), tagged with the `streamId`
 * the caller passed to `stream`.
 */
export const AiMethods = {
  AVAILABILITY: 'ai.availability',
  PREPARE: 'ai.prepare',
  GENERATE: 'ai.generate',
  STREAM: 'ai.stream',
  STREAM_CHUNK: 'ai.streamChunk',
} as const

interface StreamChunk {
  streamId: string
  text: string
}

let streamCounter = 0

/**
 * On-device / hybrid text generation. The shell picks the tier (on-device first); check
 * {@link availability} before offering AI features — on most devices today the answer is
 * `unavailable`, and calls then reject with `AI_UNAVAILABLE`.
 */
export class AiModule {
  constructor(private readonly bridge: Bridge) {}

  /** Which tier would serve a request right now, and whether it is ready. */
  availability(): Promise<AiAvailability> {
    return this.bridge.call<AiAvailability>(AiMethods.AVAILABILITY)
  }

  /**
   * Makes the best tier ready when it can be (e.g. downloads the OS model — may take minutes on
   * first use), then resolves with the resulting availability.
   */
  prepare(): Promise<AiAvailability> {
    return this.bridge.call<AiAvailability>(AiMethods.PREPARE)
  }

  /** Generates a complete reply. Rejects with `AI_UNAVAILABLE` when no tier is ready. */
  generate(options: AiGenerateOptions): Promise<AiResult> {
    return this.bridge.call<AiResult>(AiMethods.GENERATE, options)
  }

  /**
   * Yields the reply piece by piece as the model produces it; the generator's return value is
   * the complete {@link AiResult}. Breaking out of the loop stops listening (the device still
   * finishes the reply in the background).
   *
   * ```ts
   * for await (const piece of ai.stream({ prompt })) output.textContent += piece
   * ```
   */
  async *stream(options: AiGenerateOptions): AsyncGenerator<string, AiResult, undefined> {
    const streamId = `ai-stream-${++streamCounter}-${Date.now().toString(36)}`
    // Mutated from the bridge callbacks below, hence an object rather than narrowed locals.
    const state: {
      pending: string[]
      settled: { result: AiResult } | { error: unknown } | null
      wake: (() => void) | null
    } = { pending: [], settled: null, wake: null }

    const off = this.bridge.on(AiMethods.STREAM_CHUNK, (params) => {
      const chunk = params as StreamChunk
      if (chunk.streamId !== streamId) return
      state.pending.push(chunk.text)
      state.wake?.()
    })
    // Chunks are pushed before the final response on the same channel, so every chunk is
    // queued by the time `settled` is set.
    void this.bridge.call<AiResult>(AiMethods.STREAM, { ...options, streamId }).then(
      (result) => {
        state.settled = { result }
        state.wake?.()
      },
      (error: unknown) => {
        state.settled = { error }
        state.wake?.()
      }
    )

    try {
      for (;;) {
        const next = state.pending.shift()
        if (next !== undefined) {
          yield next
          continue
        }
        const settled = state.settled
        if (settled) {
          if ('error' in settled) throw settled.error
          return settled.result
        }
        await new Promise<void>((resolve) => {
          state.wake = resolve
        })
        state.wake = null
      }
    } finally {
      off()
    }
  }
}
