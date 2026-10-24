import { useEffect, useState } from 'react'
import { push } from '@capsule/core'
import type { NotificationChannel, PermissionStatus, PushMessage } from '@capsule/core'
import { Button, Note, Row, SubSection } from '../ui'

/**
 * Push notifications (FCM). Works in the browser too: the WebBridge hands back a
 * fake token, keeps channels in memory, and maps the Notification permission —
 * and you can simulate arrivals from the console:
 *
 *   __capsulePushSimulate({ id: '1', title: 'Hi', body: 'there' })          // foreground message
 *   __capsulePushSimulate({ id: '2', title: 'Tap me' }, 'tap')              // warm tap
 *
 * Real FCM (token from Firebase, tray notifications, cold-tap routing) lands in
 * Slice 2 on device. Tap routing mirrors deep links: cold-launch taps surface via
 * getLaunchNotification() on mount, warm taps via onNotificationTap.
 */
export default function PushScreen() {
  const [token, setToken] = useState<string | null>(null)
  const [permission, setPermission] = useState<PermissionStatus | null>(null)
  const [channels, setChannels] = useState<NotificationChannel[]>([])
  const [events, setEvents] = useState<string[]>([])

  const log = (line: string) =>
    setEvents((prev) => [`${new Date().toLocaleTimeString()}  ${line}`, ...prev].slice(0, 15))

  // Read permission, the cold-launch tap, and existing channels once on mount.
  useEffect(() => {
    push
      .checkPermissions()
      .then(({ notifications }) => setPermission(notifications))
      .catch(() => {})
    push
      .getLaunchNotification()
      .then(({ message }) => {
        if (message) log(`launch tap  ${message.title ?? message.id}`)
      })
      .catch(() => {})
    push
      .listChannels()
      .then(setChannels)
      .catch(() => {})
  }, [])

  // Subscribe to foreground messages, warm taps, and registration errors.
  useEffect(() => {
    const fmt = (m: PushMessage) => m.title ?? m.body ?? m.id
    const offMsg = push.onMessage((m) => log(`message  ${fmt(m)}`))
    const offTap = push.onNotificationTap((m) => log(`tap  ${fmt(m)}`))
    const offErr = push.onRegistrationError((e) => log(`error  ${e.message} (${e.code})`))
    return () => {
      offMsg()
      offTap()
      offErr()
    }
  }, [])

  const register = () =>
    push
      .register()
      .then((t) => setToken(t.value))
      .catch((e) => log(`register failed  ${e?.message ?? e}`))

  const requestPermission = () =>
    push
      .requestPermissions()
      .then(({ notifications }) => setPermission(notifications))
      .catch(() => {})

  const addChannel = async () => {
    await push.createChannel({ id: 'chat', name: 'Chat', importance: 'high' })
    setChannels(await push.listChannels())
  }

  return (
    <div>
      <SubSection title="Registration">
        <Row>
          <Button onClick={register}>Register for push</Button>
        </Row>
        <p style={{ fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all', marginTop: 8 }}>
          {token ?? '(not registered)'}
        </p>
      </SubSection>

      <SubSection title="Permission">
        <Row>
          <Button onClick={requestPermission}>Request permission</Button>
        </Row>
        <p style={{ fontSize: 14, marginTop: 8 }}>{permission ?? 'Loading…'}</p>
      </SubSection>

      <SubSection title="Channels (Android)">
        <Row>
          <Button onClick={addChannel}>Create “Chat” channel</Button>
        </Row>
        {channels.length === 0 ? (
          <Note>No channels yet.</Note>
        ) : (
          <ul style={{ fontSize: 13, paddingLeft: 16, margin: '8px 0 0' }}>
            {channels.map((c) => (
              <li key={c.id}>
                {c.name} — {c.importance}
              </li>
            ))}
          </ul>
        )}
      </SubSection>

      <SubSection title="Events">
        {events.length === 0 ? (
          <Note>No events yet — register, then simulate a message from the console.</Note>
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
