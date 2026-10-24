// Docs: docs/decisions/0002-capsule-ui.md
/**
 * Capsule UI — button class builder.
 *
 * Framework-agnostic: returns a Tailwind class string. React/Vue/Svelte/vanilla
 * templates apply it to their own `<button>` element, so behaviour stays with
 * the app and only the *look* is centralized here (adr-002 intent).
 */
import { cn, tokensFor, type ThemePreset } from '../tokens'

export type ButtonVariant = 'default' | 'outline' | 'ghost' | 'danger' | 'link'
export type ButtonSize = 'sm' | 'md' | 'lg'

const variantClasses: Record<ButtonVariant, string> = {
  default:
    'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 focus-visible:ring-blue-500',
  outline:
    'border border-blue-600 text-blue-600 hover:bg-blue-50 active:bg-blue-100 focus-visible:ring-blue-500',
  ghost: 'text-blue-600 hover:bg-blue-50 active:bg-blue-100 focus-visible:ring-blue-500',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-500',
  link: 'text-blue-600 underline underline-offset-4 hover:text-blue-700 focus-visible:ring-blue-500',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-base',
  lg: 'h-12 px-6 text-lg',
}

export interface ButtonOptions {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Full-width (block) button. */
  block?: boolean
  /** Theme preset — overrides height/radius/font from the preset tokens. */
  preset?: ThemePreset
}

/** Base classes shared by every button variant. */
const base =
  'inline-flex items-center justify-center font-medium transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
  'disabled:opacity-50 disabled:pointer-events-none select-none'

/** Build the Tailwind classes for a button. */
export function button(options: ButtonOptions = {}): string {
  const { variant = 'default', size = 'md', block = false, preset } = options
  const t = tokensFor(preset)
  // A "link" button is inline text — never a fixed-height control. A preset
  // overrides the height from platform tokens; otherwise the size decides.
  const height = variant === 'link' ? 'h-auto' : preset ? t.controlHeight : sizeClasses[size]
  return cn(base, t.radius, height, variantClasses[variant], block && 'w-full')
}
