// Restores the quickJs.ping JSON-RPC method that was previously handled by
// QuickJSPingHandler.kt (deleted in Phase 2 Step 5). Now runs inside QuickJS
// via file-based routing — the eval happens in the same JS runtime as the routes.
export default function handler(params: { expr?: string }) {
  try {
    // eslint-disable-next-line no-eval
    const result = eval(params?.expr ?? 'undefined')
    return { result: String(result) }
  } catch (e: unknown) {
    return { error: String(e instanceof Error ? e.message : e) }
  }
}
