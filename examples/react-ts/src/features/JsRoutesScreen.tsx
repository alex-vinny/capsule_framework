import { useState } from 'react'
import { bridge } from '@capsule/core'
import { Button, Note, Row, TextInput } from '../ui'

// Demonstrates a JSON-RPC override handled by a TS file in src/routes/, bundled
// by esbuild and dispatched by QuickJS before the native bridge ever sees it.
export default function JsRoutesScreen() {
  const [name, setName] = useState('Capsule')
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const call = () => {
    setLoading(true)
    bridge
      .call<{ message: string }>('custom.hello', { name })
      .then((r) => setResult(r.message))
      .catch((e: Error) => setResult(`error: ${e.message}`))
      .finally(() => setLoading(false))
  }

  return (
    <>
      <Note>
        Calls <code>custom.hello</code>, handled by <code>src/routes/custom.hello.ts</code>.
      </Note>
      <Row style={{ marginTop: 8 }}>
        <TextInput value={name} onChange={setName} placeholder="name" />
        <Button onClick={call} disabled={loading}>
          {loading ? '…' : 'Call'}
        </Button>
      </Row>
      {result !== null && (
        <p style={{ fontSize: 13, marginTop: 8, fontFamily: 'monospace' }}>{result}</p>
      )}
    </>
  )
}
