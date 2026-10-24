import type { CapsuleHttpRequest, CapsuleHttpResponse } from '@capsule/core/routes'

// In-memory list — persists in the QuickJS runtime for the app's lifetime.
const items: string[] = ['apple', 'banana', 'cherry']

// GET /api/items — return current list
export function GET(): CapsuleHttpResponse {
  return {
    status: 200,
    body: JSON.stringify({ items }),
    mimeType: 'application/json',
  }
}

// POST /api/items — add an item; body: { "item": "string" }
export function POST(req: CapsuleHttpRequest): CapsuleHttpResponse {
  if (!req.body) {
    return {
      status: 400,
      body: JSON.stringify({ error: 'Missing body' }),
      mimeType: 'application/json',
    }
  }
  let parsed: { item?: string }
  try {
    parsed = JSON.parse(req.body)
  } catch {
    return {
      status: 400,
      body: JSON.stringify({ error: 'Invalid JSON' }),
      mimeType: 'application/json',
    }
  }
  const item = parsed.item?.trim()
  if (!item) {
    return {
      status: 400,
      body: JSON.stringify({ error: 'item is required' }),
      mimeType: 'application/json',
    }
  }
  items.push(item)
  return {
    status: 201,
    body: JSON.stringify({ items }),
    mimeType: 'application/json',
  }
}
