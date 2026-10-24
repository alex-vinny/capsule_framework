import { useState } from 'react'
import { haptics } from '@capsule/core'
import type { HapticStyle } from '@capsule/core'
import { Button, Note, Row } from '../ui'

const HAPTIC_STYLES: HapticStyle[] = [
  'light',
  'medium',
  'heavy',
  'success',
  'warning',
  'error',
  'selection',
]

export default function HapticsScreen() {
  const [last, setLast] = useState<string | null>(null)

  const trigger = (style: HapticStyle) => {
    haptics
      .vibrate(style)
      .then(() => setLast(style))
      .catch(console.error)
  }

  return (
    <>
      <Row>
        {HAPTIC_STYLES.map((style) => (
          <Button
            key={style}
            variant={last === style ? 'active' : 'default'}
            onClick={() => trigger(style)}
          >
            {style}
          </Button>
        ))}
      </Row>
      {last && <Note>Last: {last}</Note>}
    </>
  )
}
