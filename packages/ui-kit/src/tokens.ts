// Docs: docs/decisions/0002-capsule-ui.md
/**
 * Capsule UI — design tokens and theme presets.
 *
 * Pure data, no rendering. Two built-in presets target the shells where the
 * components run: `ios` (WKWebView, SF-fluent metrics) and `material`
 * (Android WebView, Material-fluent metrics). Each preset only changes
 * radii/spacing/typography — the Tailwind class *structure* is shared, so a
 * component looks native-flavored on both platforms from one codebase.
 */

export type ThemePreset = 'ios' | 'material'

export interface DesignTokens {
  /** Corner radius applied to buttons, cards, inputs. */
  radius: string
  /** Standard control height (buttons, inputs). */
  controlHeight: string
  /** Font stack for the preset. */
  fontFamily: string
  /** Base font size for body text. */
  fontSize: string
}

export const presets: Record<ThemePreset, DesignTokens> = {
  ios: {
    radius: 'rounded-xl',
    controlHeight: 'h-11',
    fontFamily: "font-['-apple-system','BlinkMacSystemFont','SF_Pro_Text','system-ui']",
    fontSize: 'text-[17px]',
  },
  material: {
    radius: 'rounded-md',
    controlHeight: 'h-10',
    fontFamily: "font-['Roboto','system-ui','sans-serif']",
    fontSize: 'text-base',
  },
}

/** Resolve tokens for a preset, defaulting to `material` (Android-first heritage). */
export function tokensFor(preset: ThemePreset = 'material'): DesignTokens {
  return presets[preset]
}

/**
 * Minimal class merger: joins defined, non-empty parts and deduplicates.
 * Deliberately not tailwind-merge — no dependency, and Capsule class sets
 * don't produce conflicting utilities today.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    if (!part) continue
    for (const cls of part.split(/\s+/)) {
      if (cls && !seen.has(cls)) {
        seen.add(cls)
        out.push(cls)
      }
    }
  }
  return out.join(' ')
}
