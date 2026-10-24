// Docs: docs/decisions/0002-capsule-ui.md
/**
 * Capsule UI — table class builders.
 *
 * Column count is the caller's concern (CSS grid `gridTemplateColumns` or a
 * real `<table>`); these classes style rows/cells/headers consistently.
 */
import { cn, tokensFor, type ThemePreset } from '../tokens'

export interface TableOptions {
  /** Zebra-stripe even rows. */
  striped?: boolean
  /** Highlight row on hover. */
  hoverable?: boolean
  /** Theme preset. Defaults to `material`. */
  preset?: ThemePreset
}

/** Table wrapper (rounded, bordered, horizontally scrollable). */
export function table(options: TableOptions = {}): string {
  const t = tokensFor(options.preset)
  return cn('w-full overflow-x-auto border border-gray-200 bg-white text-gray-900', t.radius)
}

/** Header row. */
export const tableHead = 'bg-gray-50 text-left text-sm font-semibold text-gray-600'

/** Data row. */
export function tableRow(options: TableOptions = {}): string {
  return cn(
    'border-t border-gray-100 text-sm',
    options.striped && 'even:bg-gray-50',
    options.hoverable && 'hover:bg-blue-50'
  )
}

/** Cell padding shared by th/td. */
export const tableCell = 'px-3 py-2'
