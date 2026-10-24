// Demonstrates JSON-RPC file-based routing (Phase 2 Step 6 Sub-task A).
// This handler is auto-discovered by the CLI and registered via addRoute().
// Call it with: bridge.call('custom.hello', { name: 'World' })
export default function handler(params: { name?: string }) {
  const name = params?.name ?? 'world'
  return { message: `Hello, ${name}! (handled by QuickJS)` }
}
