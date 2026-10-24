// Docs: docs/reference/core-api.md, docs/decisions/0001-embedded-runtime.md, docs/concepts/primers/quickjs.md
/**
 * `@capsule/core/routes` — register the handlers of an app's on-device `/api` server.
 *
 * The CLI bundles the app's route files with this module; on the device QuickJS runs the bundle
 * and the embedded server forwards each `/api/` request (and each bridge RPC routed to JS) to the
 * handler registered here.
 *
 * @module @capsule/core/routes
 */
/** Request passed to an HTTP route handler by the embedded server (CivetwebServer) via QuickJS. */
export interface CapsuleHttpRequest {
  method: string
  path: string
  body: string | null
  headers: Record<string, string>
}

/** Return value from an HTTP route handler. */
export interface CapsuleHttpResponse {
  status?: number
  body?: string | null
  mimeType?: string
}

/** A JSON-RPC route handler: receives the request params, returns the result. */
export type RpcHandler = (params: unknown) => unknown
/** An HTTP route handler for an `/api/...` path. */
export type HttpHandler = (req: CapsuleHttpRequest) => CapsuleHttpResponse

const rpcRoutes: Record<string, RpcHandler> = {}
const httpRoutes: Record<string, Record<string, HttpHandler>> = {}

/** Register a synchronous JS handler for the given JSON-RPC method. */
export function addRoute(method: string, handler: RpcHandler): void {
  rpcRoutes[method] = handler
}

/**
 * Register an HTTP handler for a specific path + HTTP method.
 * Path must start with /api/ and use exact matching (no params in Step 6).
 */
export function addHttpRoute(path: string, httpMethod: string, handler: HttpHandler): void {
  if (!httpRoutes[path]) httpRoutes[path] = {}
  httpRoutes[path][httpMethod.toUpperCase()] = handler
}

/**
 * Dispatch entry point called by QuickJSBridge for every incoming JSON-RPC request.
 *
 * Returns a plain JS object (NOT a JSON string). The C call helper wraps every return
 * value in JSON.stringify(), so returning an object produces clean JSON on the Kotlin
 * side. Returning a pre-serialised string would cause double-encoding.
 *
 * Returns null to signal the Kotlin bridge to fall through to native Android handlers.
 */
export function dispatch(requestJson: string): object | null {
  let req: { id?: string; method: string; params?: unknown }
  try {
    req = JSON.parse(requestJson)
  } catch {
    return null
  }

  const handler = rpcRoutes[req.method]
  if (!handler) return null

  try {
    const result = handler(req.params ?? null)
    return { jsonrpc: '2.0', id: req.id ?? null, result }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    // 1003 = CapsuleErrorCode.INTERNAL_ERROR (literal: this file is bundled standalone into QuickJS).
    return { jsonrpc: '2.0', id: req.id ?? null, error: { code: 1003, message } }
  }
}

/**
 * HTTP dispatch entry point called by the native RequestRouter for every /api/* request.
 *
 * Arguments are passed as a JSON array by QuickJSBridgeImpl.handleHttpRequest():
 * [method, path, body|null, headers-object].
 * The C call helper parses the array and passes values as native JS types — no JSON.parse needed.
 *
 * Returns a plain object with { status, body, mimeType } or null if no handler matches.
 * Returning null makes the embedded server respond with 404.
 */
export function handleHttpRequest(
  method: string,
  path: string,
  body: string | null,
  headers: Record<string, string>
): object | null {
  const pathHandlers = httpRoutes[path]
  if (!pathHandlers) return null

  const verb = method.toUpperCase()
  const handler = pathHandlers[verb]
  if (!handler) {
    return { status: 405, body: 'Method Not Allowed', mimeType: 'text/plain' }
  }

  try {
    const res = handler({ method: verb, path, body, headers: headers ?? {} })
    return {
      status: res.status ?? 200,
      body: res.body ?? '',
      mimeType: res.mimeType ?? 'application/json',
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return { status: 500, body: message, mimeType: 'text/plain' }
  }
}
