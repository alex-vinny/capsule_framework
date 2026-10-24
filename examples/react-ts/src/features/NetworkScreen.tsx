import { useEffect, useState } from 'react'
import { network } from '@capsule/core'
import type { NetworkStatus } from '@capsule/core'
import { Note, SubSection } from '../ui'

/**
 * Network reachability + change feed. Works in the browser too: the WebBridge
 * maps navigator.onLine + the online/offline events onto getStatus /
 * onStatusChange, so toggling your connection (or DevTools "Offline") updates
 * this live. Transport is best-effort in the browser ('unknown' unless the
 * Network Information API is available); on device it's wifi/cellular/ethernet.
 */
export default function NetworkScreen() {
  const [status, setStatus] = useState<NetworkStatus | null>(null)
  const [events, setEvents] = useState<string[]>([])

  // Read the current status once on mount (no replay-on-subscribe).
  useEffect(() => {
    network
      .getStatus()
      .then(setStatus)
      .catch(() => {})
  }, [])

  // Subscribe to live transitions; unsubscribe on unmount.
  useEffect(() => {
    const off = network.onStatusChange((s) => {
      setStatus(s)
      const where = s.connected ? `online (${s.connectionType})` : 'offline'
      setEvents((prev) => [`${new Date().toLocaleTimeString()}  ${where}`, ...prev].slice(0, 15))
    })
    return off
  }, [])

  return (
    <div>
      <SubSection title="Status">
        <p style={{ fontSize: 14 }}>
          {status
            ? status.connected
              ? `🟢 Online — ${status.connectionType}`
              : '⚪ Offline'
            : 'Loading…'}
        </p>
        <Note>Toggle airplane mode / Wi-Fi (or DevTools "Offline") — status updates live.</Note>
      </SubSection>

      <SubSection title="Events">
        {events.length === 0 ? (
          <Note>No events yet — change your connection to see transitions.</Note>
        ) : (
          <ul style={{ fontSize: 12, fontFamily: 'monospace', paddingLeft: 16, margin: '8px 0 0' }}>
            {events.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
      </SubSection>
    </div>
  )
}
