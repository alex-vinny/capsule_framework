import { useState } from 'react'
import { bridge } from '@capsule/core'

export default function ServerTab() {
  const [rpcResult, setRpcResult] = useState<string | null>(null)
  const [pingResult, setPingResult] = useState<string | null>(null)

  async function callHello() {
    try {
      const res = await bridge.call('hello', { name: 'World' })
      setRpcResult((res as { message: string }).message)
    } catch (e) {
      setRpcResult(e instanceof Error ? e.message : String(e))
    }
  }

  async function callPing() {
    try {
      const res = await fetch('/api/ping')
      const data = await res.json()
      setPingResult(JSON.stringify(data))
    } catch (e) {
      setPingResult(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Routes</h2>
        </div>
        <div className="divide-y divide-gray-50">
          <button
            onClick={callHello}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-sm">Call hello route</span>
            <span className="text-gray-300 text-lg">›</span>
          </button>
          {rpcResult !== null && (
            <div className="px-4 py-2 bg-gray-50">
              <p className="text-sm text-blue-600 font-mono">{rpcResult}</p>
            </div>
          )}
          <button
            onClick={callPing}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-sm">GET /api/ping</span>
            <span className="text-gray-300 text-lg">›</span>
          </button>
          {pingResult !== null && (
            <div className="px-4 py-2 bg-gray-50">
              <p className="text-sm text-blue-600 font-mono">{pingResult}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
