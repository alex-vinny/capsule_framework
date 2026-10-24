import type { CapsuleHttpRequest, CapsuleHttpResponse } from '@capsule/core/routes'

export function GET(req: CapsuleHttpRequest): CapsuleHttpResponse {
  return {
    status: 200,
    body: JSON.stringify({ status: 'ok', path: req.path }),
    mimeType: 'application/json',
  }
}
