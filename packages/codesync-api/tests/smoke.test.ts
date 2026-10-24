import { describe, it, expect } from 'vitest'
import { server } from '../src/index.js'

describe('codesync-api smoke', () => {
  it('GET /health returns ok', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('ok')
    expect(typeof body.timestamp).toBe('string')
  })

  it('GET /devices returns 401 without an api key', async () => {
    const res = await server.inject({ method: 'GET', url: '/devices' })
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error).toBe('Unauthorized')
  })
})
