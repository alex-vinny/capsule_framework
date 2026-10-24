import { useState } from 'react'
import { alerts } from '@capsule/core'
import type { AlertResult, AlertStyle } from '@capsule/core'
import { Button, Note, Row, theme } from '../ui'

type AlertPreset = 'default' | 'dark' | 'brand' | 'warning'

const ALERT_PRESETS: Record<AlertPreset, AlertStyle | undefined> = {
  default: undefined,
  dark: {
    backgroundColor: '#1C1C1E',
    titleColor: '#FFFFFF',
    titleSize: 17,
    messageColor: '#EBEBF5',
    messageSize: 14,
    accentColor: '#0A84FF',
    cornerRadius: 16,
    buttonAllCaps: false,
    dimAmount: 0.8,
  },
  brand: {
    accentColor: '#34C759',
    cornerRadius: 20,
    buttonAllCaps: false,
  },
  warning: {
    accentColor: '#FF9500',
    titleColor: '#FF9500',
    titleSize: 16,
    dimAmount: 0.6,
  },
}

export default function AlertsScreen() {
  const [result, setResult] = useState<AlertResult | null>(null)
  const [preset, setPreset] = useState<AlertPreset>('default')

  const style = ALERT_PRESETS[preset]

  const showAlert = () => alerts.show({ message: 'Hello from Capsule!', style }).then(setResult)

  const showConfirm = () =>
    alerts
      .show({
        title: 'Confirm',
        message: 'Do you want to continue?',
        buttons: [
          { label: 'Cancel', role: 'cancel' },
          { label: 'Continue', role: 'default' },
        ],
        style,
      })
      .then(setResult)

  const showDestructive = () =>
    alerts
      .show({
        title: 'Delete item',
        message: 'This cannot be undone.',
        buttons: [
          { label: 'Cancel', role: 'cancel' },
          { label: 'Delete', role: 'destructive' },
        ],
        style,
      })
      .then(setResult)

  return (
    <>
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        {(['default', 'dark', 'brand', 'warning'] as AlertPreset[]).map((p) => (
          <label
            key={p}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="alertPreset"
              value={p}
              checked={preset === p}
              onChange={() => setPreset(p)}
            />
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </label>
        ))}
      </div>

      <Row>
        <Button onClick={showAlert}>Alert</Button>
        <Button onClick={showConfirm}>Confirm</Button>
        <Button variant="danger" onClick={showDestructive}>
          Destructive
        </Button>
      </Row>

      {result && (
        <Note>
          Pressed: <strong style={{ color: theme.fg }}>{result.action}</strong>
        </Note>
      )}
    </>
  )
}
