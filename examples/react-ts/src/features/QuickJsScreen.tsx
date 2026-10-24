import { useState } from 'react'
import { bridge } from '@capsule/core'
import { Button, Row, TextInput, theme } from '../ui'

export default function QuickJsScreen() {
  const [expr, setExpr] = useState('1 + 1')
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const evaluate = () => {
    setLoading(true)
    bridge
      .call<{ result?: string; error?: string }>('quickJs.ping', { expr })
      .then((r) => setResult(r.error ? `error: ${r.error}` : (r.result ?? 'undefined')))
      .catch((e: Error) => setResult(`bridge error: ${e.message}`))
      .finally(() => setLoading(false))
  }

  return (
    <>
      <Row style={{ marginBottom: 8 }}>
        <TextInput value={expr} onChange={setExpr} placeholder="JS expression…" mono />
        <Button onClick={evaluate} disabled={loading}>
          {loading ? '…' : 'Eval'}
        </Button>
      </Row>
      {result !== null && (
        <p style={{ fontSize: 13, color: theme.muted, marginTop: 4 }}>
          <span style={{ fontFamily: 'monospace', color: theme.fg }}>{expr}</span>
          {' → '}
          <strong style={{ fontFamily: 'monospace' }}>{result}</strong>
        </p>
      )}
    </>
  )
}
