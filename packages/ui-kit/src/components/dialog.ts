// Docs: docs/decisions/0002-capsule-ui.md
/**
 * Capsule UI — dialog (modal) class builders.
 *
 * Only classes are provided; the app template owns the open/close state and
 * focus-trap behaviour (those differ per framework).
 */
import { cn, tokensFor, type ThemePreset } from '../tokens'

/** Full-screen backdrop behind the dialog. */
export const dialogOverlay = 'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm'

/** Centered dialog panel. */
export function dialogPanel(options: { preset?: ThemePreset } = {}): string {
  const t = tokensFor(options.preset)
  return cn(
    'fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2',
    'bg-white p-6 shadow-xl text-gray-900',
    t.radius
  )
}

/** Dialog title. */
export function dialogTitle(options: { preset?: ThemePreset } = {}): string {
  return cn('font-semibold text-gray-900', tokensFor(options.preset).fontSize)
}

/** Dialog body text. */
export const dialogBody = 'mt-2 text-sm text-gray-600'

/** Footer row for action buttons. */
export const dialogFooter = 'mt-6 flex justify-end gap-2'
