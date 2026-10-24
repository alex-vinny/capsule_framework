import { useEffect, useState } from 'react'
import { app } from '@capsule/core'
import type { AppState } from '@capsule/core'
import { Note, SubSection } from '../ui'

/**
 * App lifecycle + deep links. Foreground/background state works in the browser
 * too (tab switch ≈ background, via the WebBridge visibilitychange fallback);
 * launch URL + incoming deep links are native-only.
 */
export default function AppScreen() {
  const [state, setState] = useState<AppState | null>(null)
  const [launchUrl, setLaunchUrl] = useState<string | null | undefined>(undefined)
  const [events, setEvents] = useState<string[]>([])

  // Read current state + the cold-launch deep link once on mount.
  useEffect(() => {
    app
      .getState()
      .then(setState)
      .catch(() => {})
    app
      .getLaunchUrl()
      .then(({ url }) => setLaunchUrl(url))
      .catch(() => setLaunchUrl(null))
  }, [])

  // Subscribe to live transitions + incoming links; unsubscribe on unmount.
  useEffect(() => {
    const log = (line: string) =>
      setEvents((prev) => [`${new Date().toLocaleTimeString()}  ${line}`, ...prev].slice(0, 15))
    const offState = app.onStateChange((s) => {
      setState(s)
      log(s.isActive ? 'resumed → foreground' : 'paused → background')
    })
    const offUrl = app.onUrlOpen(({ url }) => log(`urlOpen  ${url}`))
    return () => {
      offState()
      offUrl()
    }
  }, [])

  return (
    <div>
      <SubSection title="Lifecycle state">
        <p style={{ fontSize: 14 }}>
          {state ? (state.isActive ? '🟢 Active (foreground)' : '⚪ Background') : 'Loading…'}
        </p>
        <Note>Background the app (or switch browser tabs) and return — state updates live.</Note>
      </SubSection>

      <SubSection title="Launch URL">
        <p style={{ fontSize: 14 }}>
          {launchUrl === undefined ? 'Loading…' : (launchUrl ?? '(launched normally)')}
        </p>
        <Note>The deep link the app was cold-started with. Consumed once.</Note>
      </SubSection>

      <SubSection title="Events">
        {events.length === 0 ? (
          <Note>No events yet — background the app, or send a deep link.</Note>
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
