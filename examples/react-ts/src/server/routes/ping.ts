import type { CapsuleHttpRequest, CapsuleHttpResponse } from '@capsule/core/routes'

// GET /api/ping — health check endpoint, demonstrates HTTP routing (Step 6 Sub-task B).
export function GET(req: CapsuleHttpRequest): CapsuleHttpResponse {
  return {
    status: 200,
    body: JSON.stringify({ status: 'ok', path: req.path, runtime: 'QuickJS' }),
    mimeType: 'application/json',
  }
}
