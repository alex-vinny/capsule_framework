import { describe, it, expect } from 'vitest'
import { addHttpRoute, handleHttpRequest } from '../router.js'

// router.ts uses module-level maps; tests isolate by using unique paths per test.

describe('addHttpRoute + handleHttpRequest', () => {
  it('returns null for unregistered path', () => {
    const result = handleHttpRequest('GET', '/api/unknown', null, {})
    expect(result).toBeNull()
  })

  it('GET handler returns correct status and body', () => {
    addHttpRoute('/api/ping', 'GET', () => ({ status: 200, body: 'pong', mimeType: 'text/plain' }))
    const result = handleHttpRequest('GET', '/api/ping', null, {}) as any
    expect(result.status).toBe(200)
    expect(result.body).toBe('pong')
    expect(result.mimeType).toBe('text/plain')
  })

  it('defaults status to 200, mimeType to application/json', () => {
    addHttpRoute('/api/defaults', 'GET', () => ({ body: '{}' }))
    const result = handleHttpRequest('GET', '/api/defaults', null, {}) as any
    expect(result.status).toBe(200)
    expect(result.mimeType).toBe('application/json')
  })

  it('returns 405 for unregistered HTTP verb on a known path', () => {
    addHttpRoute('/api/readonly', 'GET', () => ({ body: '[]' }))
    const result = handleHttpRequest('DELETE', '/api/readonly', null, {}) as any
    expect(result.status).toBe(405)
  })

  it('handler receives method, path, body, and headers', () => {
    let captured: Parameters<Parameters<typeof addHttpRoute>[2]>[0] | null = null
    addHttpRoute('/api/capture', 'POST', (r) => {
      captured = r
      return { body: 'ok' }
    })
    handleHttpRequest('POST', '/api/capture', '{"x":1}', { authorization: 'Bearer t' })
    expect(captured!.method).toBe('POST')
    expect(captured!.path).toBe('/api/capture')
    expect(captured!.body).toBe('{"x":1}')
    expect(captured!.headers.authorization).toBe('Bearer t')
  })

  it('POST handler overwrites GET on same path', () => {
    addHttpRoute('/api/multi', 'GET', () => ({ body: 'from-get' }))
    addHttpRoute('/api/multi', 'POST', () => ({ body: 'from-post' }))
    expect((handleHttpRequest('GET', '/api/multi', null, {}) as any).body).toBe('from-get')
    expect((handleHttpRequest('POST', '/api/multi', null, {}) as any).body).toBe('from-post')
  })

  it('normalises method to uppercase', () => {
    addHttpRoute('/api/case', 'GET', () => ({ body: 'ok' }))
    const result = handleHttpRequest('get', '/api/case', null, {})
    expect(result).not.toBeNull()
    expect((result as any).body).toBe('ok')
  })

  it('returns 500 and error message when handler throws', () => {
    addHttpRoute('/api/throws', 'GET', () => {
      throw new Error('boom')
    })
    const result = handleHttpRequest('GET', '/api/throws', null, {}) as any
    expect(result.status).toBe(500)
    expect(result.body).toBe('boom')
    expect(result.mimeType).toBe('text/plain')
  })

  it('null body is passed through unchanged', () => {
    let receivedBody: string | null = 'sentinel'
    addHttpRoute('/api/nullbody', 'GET', (r) => {
      receivedBody = r.body
      return {}
    })
    handleHttpRequest('GET', '/api/nullbody', null, {})
    expect(receivedBody).toBeNull()
  })
})
