// Docs: docs/decisions/0002-capsule-ui.md
/**
 * Capsule UI — card class builder.
 */
import { cn, tokensFor, type ThemePreset } from '../tokens'

export type CardVariant = 'default' | 'outline' | 'elevated'

const variantClasses: Record<CardVariant, string> = {
  default: 'bg-white shadow-sm hover:shadow-md',
  outline: 'bg-white border border-gray-200',
  elevated: 'bg-white shadow-lg hover:shadow-2xl',
}

export interface CardOptions {
  variant?: CardVariant
  /** Theme preset — changes radius. Defaults to `material`. */
  preset?: ThemePreset
  /** Extra padding beyond the default p-4 (e.g. "p-6"). */
  padding?: string
}

const base = 'rounded-lg p-4 text-gray-900 transition-shadow'

/** Build the Tailwind classes for a card container. */
export function card(options: CardOptions = {}): string {
  const { variant = 'default', preset, padding } = options
  const t = tokensFor(preset)
  return cn(base, t.radius, variantClasses[variant], padding)
}

// ── Sub-parts (shadcn-style composition) ────────────────────────────────────

/** Card header block. */
export function cardHeader(options: { preset?: ThemePreset } = {}): string {
  return cn('font-semibold', tokensFor(options.preset).fontSize)
}

/** Card description/muted text block. */
export const cardDescription = 'text-sm text-gray-500'

/** Card footer row. */
export const cardFooter = 'flex items-center justify-end gap-2 pt-2'
