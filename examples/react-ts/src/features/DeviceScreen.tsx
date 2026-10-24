import { useEffect, useState } from 'react'
import { device } from '@capsule/core'
import type { DeviceInfo } from '@capsule/core'
import { theme } from '../ui'

export default function DeviceScreen() {
  const [info, setInfo] = useState<DeviceInfo | null>(null)

  useEffect(() => {
    device.getInfo().then(setInfo).catch(console.error)
  }, [])

  if (!info) return <p style={{ color: theme.muted, fontSize: 14 }}>Loading…</p>

  const rows: [string, string][] = [
    ['Model', info.model],
    ['Manufacturer', info.manufacturer],
    ['OS', `Android ${info.osVersion} (SDK ${info.sdkVersion})`],
    ['Virtual', String(info.isVirtual)],
    ['WebView', info.webViewVersion ?? '—'],
  ]

  return (
    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td style={{ padding: '3px 16px 3px 0', color: theme.muted, whiteSpace: 'nowrap' }}>
              {k}
            </td>
            <td style={{ padding: '3px 0' }}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
