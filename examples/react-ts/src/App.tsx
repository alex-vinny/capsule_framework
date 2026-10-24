import { useMemo, useState } from 'react'
import { FEATURES } from './features/registry'
import type { Feature } from './features/registry'
import { theme } from './ui'

const page = {
  fontFamily: 'sans-serif' as const,
  padding: 24,
  maxWidth: 480,
  margin: '0 auto',
  paddingBottom: 40,
}

export default function App() {
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = FEATURES.find((f) => f.id === activeId) ?? null

  // Group features in declaration order — Home renders one labelled list per group.
  const groups = useMemo(() => {
    const order: string[] = []
    const byGroup = new Map<string, Feature[]>()
    for (const f of FEATURES) {
      if (!byGroup.has(f.group)) {
        byGroup.set(f.group, [])
        order.push(f.group)
      }
      byGroup.get(f.group)!.push(f)
    }
    return order.map((name) => ({ name, items: byGroup.get(name)! }))
  }, [])

  if (active) {
    const Screen = active.Component
    return (
      <div style={page}>
        <button
          onClick={() => setActiveId(null)}
          style={{
            background: 'none',
            border: 'none',
            color: theme.accent,
            fontSize: 15,
            cursor: 'pointer',
            padding: 0,
            fontFamily: 'inherit',
          }}
        >
          ‹ Back
        </button>
        <h1 style={{ fontSize: 20, margin: '12px 0 24px' }}>
          {active.title}
          {active.deviceOnly && (
            <span style={{ marginLeft: 8, fontSize: 11, color: theme.hint, fontWeight: 400 }}>
              device only
            </span>
          )}
        </h1>
        <Screen />
      </div>
    )
  }

  return (
    <div style={page}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Capsule Playground</h1>
      <p style={{ fontSize: 13, color: theme.muted, marginTop: 0, marginBottom: 24 }}>
        Tap a feature to exercise its Capsule API.
      </p>

      {groups.map((group) => (
        <section key={group.name} style={{ marginBottom: 24 }}>
          <h2
            style={{
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              color: theme.muted,
              marginBottom: 8,
            }}
          >
            {group.name}
          </h2>
          <div
            style={{ border: `1px solid ${theme.border}`, borderRadius: 10, overflow: 'hidden' }}
          >
            {group.items.map((f, i) => (
              <button
                key={f.id}
                onClick={() => setActiveId(f.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '12px 14px',
                  background: '#fff',
                  border: 'none',
                  borderTop: i === 0 ? 'none' : `1px solid ${theme.border}`,
                  cursor: 'pointer',
                  fontSize: 15,
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  color: theme.fg,
                }}
              >
                <span style={{ fontSize: 20, lineHeight: 1 }}>{f.icon}</span>
                <span style={{ flex: 1 }}>{f.title}</span>
                <span style={{ color: theme.hint, fontSize: 18 }}>›</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
