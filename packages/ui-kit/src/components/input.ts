// Docs: docs/decisions/0002-capsule-ui.md
/**
 * Capsule UI — input / textarea class builders.
 */
import { cn, tokensFor, type ThemePreset } from '../tokens'

/** Shared control styling for single- and multi-line text fields. */
const fieldBase =
  'w-full bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ' +
  'disabled:opacity-50 px-3'

export interface FieldOptions {
  /** Invalid state — red border + ring. */
  invalid?: boolean
  /** Theme preset — changes radius/height/font. Defaults to `material`. */
  preset?: ThemePreset
}

/** Build the Tailwind classes for a single-line text input. */
export function input(options: FieldOptions = {}): string {
  const { invalid = false, preset } = options
  const t = tokensFor(preset)
  return cn(
    fieldBase,
    t.radius,
    t.controlHeight,
    t.fontSize,
    invalid && 'border-red-500 focus:ring-red-500 focus:border-red-500'
  )
}

/** Build the Tailwind classes for a multi-line textarea. */
export function textarea(options: FieldOptions = {}): string {
  const { invalid = false, preset } = options
  const t = tokensFor(preset)
  return cn(
    fieldBase,
    t.radius,
    t.fontSize,
    'min-h-[80px] py-2',
    invalid && 'border-red-500 focus:ring-red-500 focus:border-red-500'
  )
}

/** Label styling for any field. */
export function fieldLabel(options: { preset?: ThemePreset } = {}): string {
  return cn('block font-medium text-gray-700 mb-1', tokensFor(options.preset).fontSize)
}
