import type { CSSProperties, ReactNode } from 'react'

// Shared UI primitives for the playground screens. Kept deliberately small and
// dependency-free so this app stays an easy-to-copy base: a feature screen
// imports these, focuses on the Capsule API it demos, and never re-styles buttons.

export const theme = {
  fg: '#000',
  muted: '#888',
  hint: '#aaa',
  border: '#ddd',
  surface: '#f5f5f5',
  danger: '#fee',
  accent: '#007aff',
  warn: '#e8830c',
}

type ButtonVariant = 'default' | 'danger' | 'active'

export function Button({
  children,
  onClick,
  variant = 'default',
  disabled = false,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: ButtonVariant
  disabled?: boolean
}) {
  const background = disabled
    ? '#eee'
    : variant === 'danger'
      ? theme.danger
      : variant === 'active'
        ? '#000'
        : theme.surface
  const color = variant === 'active' && !disabled ? '#fff' : '#000'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 14px',
        borderRadius: 6,
        border: `1px solid ${theme.border}`,
        background,
        color,
        cursor: disabled ? 'default' : 'pointer',
        fontSize: 13,
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  mono = false,
  width,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
  width?: number
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        flex: width ? undefined : 1,
        width,
        padding: '8px 10px',
        borderRadius: 6,
        border: `1px solid ${theme.border}`,
        fontSize: 13,
        fontFamily: mono ? 'monospace' : 'inherit',
      }}
    />
  )
}

/** Horizontal flex row that wraps — the common button/input layout. */
export function Row({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', ...style }}>{children}</div>
}

/** A labelled block within a screen, for screens that demo more than one call. */
export function SubSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 20 }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: theme.fg, marginBottom: 8 }}>{title}</h2>
      {children}
    </section>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: 13, color: theme.muted, marginTop: 8 }}>{children}</p>
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: 13, color: theme.warn, marginTop: 8 }}>⚠ {children}</p>
}
