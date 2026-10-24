import { useState } from 'react'
import { Button, Note, Row, SubSection, TextInput } from '../ui'

// NanoHTTPD forwards /api/* to QuickJS; handlers live in src/server/routes/,
// bundled by esbuild at build time.
export default function HttpRoutesScreen() {
  const [pingResult, setPingResult] = useState<string | null>(null)
  const [pingLoading, setPingLoading] = useState(false)
  const [items, setItems] = useState<string[]>([])
  const [newItem, setNewItem] = useState('')
  const [itemsLoading, setItemsLoading] = useState(false)

  const ping = () => {
    setPingLoading(true)
    fetch('/api/ping')
      .then((r) => r.json())
      .then((d) => setPingResult(JSON.stringify(d, null, 2)))
      .catch((e: Error) => setPingResult(`error: ${e.message}`))
      .finally(() => setPingLoading(false))
  }

  const loadItems = () => {
    setItemsLoading(true)
    fetch('/api/items')
      .then((r) => r.json())
      .then((d: { items: string[] }) => setItems(d.items))
      .catch(() => setItems([]))
      .finally(() => setItemsLoading(false))
  }

  const addItem = () => {
    if (!newItem.trim()) return
    setItemsLoading(true)
    fetch('/api/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ item: newItem.trim() }),
    })
      .then((r) => r.json())
      .then((d: { items: string[] }) => {
        setItems(d.items)
        setNewItem('')
      })
      .catch(() => {})
      .finally(() => setItemsLoading(false))
  }

  return (
    <>
      <Note>
        NanoHTTPD forwards <code>/api/*</code> to handlers in <code>src/server/routes/</code>.
      </Note>

      <SubSection title="GET /api/ping">
        <Button onClick={ping} disabled={pingLoading}>
          {pingLoading ? '…' : 'Ping'}
        </Button>
        {pingResult !== null && (
          <pre
            style={{
              fontSize: 12,
              background: '#f8f8f8',
              padding: 8,
              borderRadius: 6,
              marginTop: 8,
              overflow: 'auto',
            }}
          >
            {pingResult}
          </pre>
        )}
      </SubSection>

      <SubSection title="GET / POST /api/items">
        <Row style={{ marginBottom: 8 }}>
          <Button onClick={loadItems} disabled={itemsLoading}>
            {itemsLoading ? '…' : 'Load'}
          </Button>
        </Row>
        {items.length > 0 && (
          <p style={{ fontSize: 13, marginBottom: 8 }}>Items: {items.join(', ')}</p>
        )}
        <Row>
          <TextInput value={newItem} onChange={setNewItem} placeholder="new item" />
          <Button onClick={addItem} disabled={!newItem.trim() || itemsLoading}>
            Add
          </Button>
        </Row>
      </SubSection>
    </>
  )
}
