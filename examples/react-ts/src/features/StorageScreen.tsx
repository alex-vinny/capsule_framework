import { useState } from 'react'
import { storage, haptics } from '@capsule/core'
import { Button, Row, TextInput } from '../ui'

export default function StorageScreen() {
  const [key, setKey] = useState('greeting')
  const [value, setValue] = useState('hello capsule')
  const [read, setRead] = useState<string | null>(null)
  const [keys, setKeys] = useState<string[]>([])

  return (
    <>
      <Row style={{ marginBottom: 8 }}>
        <TextInput value={key} onChange={setKey} placeholder="key" width={90} />
        <TextInput value={value} onChange={setValue} placeholder="value" />
        <Button onClick={() => storage.set(key, value).then(() => haptics.vibrate('light'))}>
          Set
        </Button>
      </Row>
      <Row style={{ marginBottom: 8 }}>
        <Button onClick={() => storage.get(key).then(setRead)}>Get</Button>
        <Button onClick={() => storage.remove(key).then(() => setRead(null))}>Remove</Button>
        <Button onClick={() => storage.keys().then(setKeys)}>Keys</Button>
        <Button
          variant="danger"
          onClick={() =>
            storage.clear().then(() => {
              setRead(null)
              setKeys([])
            })
          }
        >
          Clear
        </Button>
      </Row>
      {read !== null && (
        <p style={{ fontSize: 13, margin: '4px 0' }}>
          Value: <strong>{read ?? '(null)'}</strong>
        </p>
      )}
      {keys.length > 0 && <p style={{ fontSize: 13, margin: '4px 0' }}>Keys: {keys.join(', ')}</p>}
    </>
  )
}
