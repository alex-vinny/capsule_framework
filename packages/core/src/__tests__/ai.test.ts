import { describe, it, expect, beforeEach } from 'vitest'
import { AiModule, AiMethods, type AiAvailability, type AiResult } from '../ai.js'
import { CapsuleError, CapsuleErrorCode } from '../errors.js'
import { FakeBridge } from '../testing/fake-bridge.js'
import { WebBridge } from '../web-bridge.js'
import type { NotificationHandler } from '../bridge.js'

const ready: AiAvailability = { tier: 'os-native', status: 'ready' }

/** FakeBridge whose `ai.stream` pushes scripted chunks, then answers like the native handler. */
class StreamingBridge extends FakeBridge {
  constructor(
    private readonly chunks: string[],
    private readonly outcome: AiResult | CapsuleError
  ) {
    super()
  }

  override call<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (method !== AiMethods.STREAM) return super.call<T>(method, params)
    this.calls.push({ method, params })
    const { streamId } = params as { streamId: string }
    // Another stream's chunk on the shared notification channel must be ignored.
    this.emit(AiMethods.STREAM_CHUNK, { streamId: 'someone-else', text: 'NOISE' })
    for (const text of this.chunks) this.emit(AiMethods.STREAM_CHUNK, { streamId, text })
    return this.outcome instanceof CapsuleError
      ? Promise.reject(this.outcome)
      : Promise.resolve(this.outcome as unknown as T)
  }

  listenerCount = 0
  override on(method: string, handler: NotificationHandler): () => void {
    this.listenerCount++
    const off = super.on(method, handler)
    return () => {
      this.listenerCount--
      off()
    }
  }
}

describe('AiModule', () => {
  let bridge: FakeBridge
  let ai: AiModule

  beforeEach(() => {
    bridge = new FakeBridge()
    ai = new AiModule(bridge)
  })

  it('availability calls ai.availability', async () => {
    bridge.mockResolve(AiMethods.AVAILABILITY, ready)
    expect(await ai.availability()).toEqual(ready)
    expect(bridge.calls[0]).toEqual({ method: 'ai.availability', params: undefined })
  })

  it('prepare calls ai.prepare and returns the new availability', async () => {
    bridge.mockResolve(AiMethods.PREPARE, ready)
    expect(await ai.prepare()).toEqual(ready)
  })

  it('generate sends the options and returns the result', async () => {
    const result: AiResult = { text: 'Short summary.', finishReason: 'stop' }
    bridge.mockResolve(AiMethods.GENERATE, result)

    expect(await ai.generate({ prompt: 'Summarise', maxTokens: 64, temperature: 0.2 })).toEqual(
      result
    )
    expect(bridge.calls[0]).toEqual({
      method: 'ai.generate',
      params: { prompt: 'Summarise', maxTokens: 64, temperature: 0.2 },
    })
  })

  it('generate surfaces AI_UNAVAILABLE', async () => {
    bridge.mockReject(
      AiMethods.GENERATE,
      CapsuleError.from(CapsuleErrorCode.AI_UNAVAILABLE, 'no tier')
    )
    await expect(ai.generate({ prompt: 'hi' })).rejects.toMatchObject({ code: 7001 })
  })

  describe('stream', () => {
    it('yields its own chunks in order and returns the full result', async () => {
      const result: AiResult = { text: 'Hello, world', finishReason: 'stop' }
      const streaming = new StreamingBridge(['Hello', ', ', 'world'], result)
      const gen = new AiModule(streaming).stream({ prompt: 'hi' })

      const pieces: string[] = []
      let step = await gen.next()
      while (!step.done) {
        pieces.push(step.value)
        step = await gen.next()
      }

      expect(pieces).toEqual(['Hello', ', ', 'world'])
      expect(step.value).toEqual(result)
      expect(streaming.calls[0].params).toMatchObject({
        prompt: 'hi',
        streamId: expect.any(String),
      })
      expect(streaming.listenerCount).toBe(0)
    })

    it('works with for await', async () => {
      const streaming = new StreamingBridge(['a', 'b'], { text: 'ab', finishReason: 'length' })
      let text = ''
      for await (const piece of new AiModule(streaming).stream({ prompt: 'hi' })) text += piece
      expect(text).toBe('ab')
    })

    it('rethrows the native error after delivering what arrived', async () => {
      const failure = CapsuleError.from(CapsuleErrorCode.AI_GENERATION_FAILED)
      const streaming = new StreamingBridge(['partial'], failure)
      const pieces: string[] = []

      await expect(
        (async () => {
          for await (const piece of new AiModule(streaming).stream({ prompt: 'hi' }))
            pieces.push(piece)
        })()
      ).rejects.toBe(failure)
      expect(pieces).toEqual(['partial'])
      expect(streaming.listenerCount).toBe(0)
    })

    it('stops listening when the consumer breaks early', async () => {
      const streaming = new StreamingBridge(['a', 'b', 'c'], { text: 'abc', finishReason: 'stop' })
      for await (const piece of new AiModule(streaming).stream({ prompt: 'hi' })) {
        if (piece === 'a') break
      }
      expect(streaming.listenerCount).toBe(0)
    })

    it('gives every stream a distinct id', async () => {
      const streaming = new StreamingBridge([], { text: '', finishReason: 'stop' })
      const module = new AiModule(streaming)
      for await (const _ of module.stream({ prompt: '1' })) void _
      for await (const _ of module.stream({ prompt: '2' })) void _

      const ids = streaming.calls.map((c) => (c.params as { streamId: string }).streamId)
      expect(new Set(ids).size).toBe(2)
    })
  })
})

describe('WebBridge ai fallback', () => {
  it('reports AI as unavailable, with a reason', async () => {
    const availability = await new WebBridge().call<AiAvailability>(AiMethods.AVAILABILITY)
    expect(availability).toMatchObject({ tier: 'unavailable', status: 'unavailable' })
    expect(availability.reason).toBeTruthy()
  })

  it('rejects generation with AI_UNAVAILABLE instead of faking a reply', async () => {
    await expect(new WebBridge().call(AiMethods.GENERATE, { prompt: 'hi' })).rejects.toMatchObject({
      code: CapsuleErrorCode.AI_UNAVAILABLE.code,
    })
  })
})
