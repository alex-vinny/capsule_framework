// Docs: docs/decisions/0002-capsule-ui.md
/**
 * Capsule UI — select class builders.
 *
 * A native `<select>` is styled rather than a custom popover: on device
 * WebViews the platform picker is the accessible, familiar control, and it
 * avoids focus-trap/scroll-lock work that differs per framework.
 */
import { cn, tokensFor, type ThemePreset } from '../tokens'

export interface SelectOptions {
  /** Invalid state — red border + ring. */
  invalid?: boolean
  /** Theme preset — changes radius/height/font. Defaults to `material`. */
  preset?: ThemePreset
}

/** Build the Tailwind classes for a native `<select>` control. */
export function select(options: SelectOptions = {}): string {
  const { invalid = false, preset } = options
  const t = tokensFor(preset)
  return cn(
    'w-full appearance-none bg-white border border-gray-300 text-gray-900 px-3',
    "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-10",
    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50',
    t.radius,
    t.controlHeight,
    t.fontSize,
    invalid && 'border-red-500 focus:ring-red-500 focus:border-red-500'
  )
}

/** Label styling — shared with inputs. */
export const selectLabel = 'block font-medium text-gray-700 mb-1'
