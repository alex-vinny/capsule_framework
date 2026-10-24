import { useState } from 'react'
import { clipboard, haptics } from '@capsule/core'
import { Button, Row, TextInput } from '../ui'

export default function ClipboardScreen() {
  const [value, setValue] = useState('')
  const [read, setRead] = useState<string | null>(null)

  return (
    <>
      <Row style={{ marginBottom: 8 }}>
        <TextInput value={value} onChange={setValue} placeholder="Type something…" />
        <Button onClick={() => clipboard.write(value).then(() => haptics.vibrate('light'))}>
          Copy
        </Button>
      </Row>
      <Row style={{ alignItems: 'center' }}>
        <Button onClick={() => clipboard.read().then((v) => setRead(v ?? '(empty)'))}>Paste</Button>
        {read !== null && <span style={{ fontSize: 13 }}>{read}</span>}
      </Row>
    </>
  )
}
