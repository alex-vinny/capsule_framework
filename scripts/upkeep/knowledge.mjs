// Facts the report can't fetch in a machine-readable form, copied from the cited pages.
// Re-check them when the report flags a toolchain bump; update the `checked` date when you do.

export const AGP_COMPAT_SOURCE = 'https://developer.android.com/build/releases/about-agp'
export const AGP_COMPAT_CHECKED = '2026-10-24'

/** AGP major.minor → the minimum Gradle it needs. */
export const AGP_MIN_GRADLE = {
  9.4: '9.6.0',
  9.3: '9.5.0',
  9.2: '9.4.1',
  9.1: '9.3.1',
  '9.0': '9.1.0',
  8.13: '8.13',
  8.12: '8.13',
  8.11: '8.13',
  '8.10': '8.11.1',
  8.9: '8.11.1',
  8.8: '8.10.2',
  8.7: '8.9',
  8.6: '8.7',
  8.5: '8.7',
}

/** Android API level → the minimum AGP that supports compiling against it. */
export const API_MIN_AGP = {
  '37.0': '9.1.1',
  36.1: '8.13.0',
  36: '8.9.1',
  35: '8.6.0',
  34: '8.1.1',
  33: '7.2',
}

export const KOTLIN_R8_SOURCE = 'https://developer.android.com/build/kotlin-support'

/**
 * AGP major.minor → the newest Kotlin (major.minor) whose metadata its bundled R8 reads. A newer
 * Kotlin makes release builds warn "An error occurred when parsing kotlin metadata" and can
 * shrink Kotlin code wrongly. From the R8 column of KOTLIN_R8_SOURCE (2.4 → R8 9.1.29,
 * 2.3 → 8.13.19 / 9.0.28, 2.2 → 8.10.21, 2.1 → 8.6.17).
 */
export const AGP_MAX_KOTLIN = {
  9.4: '2.4',
  9.3: '2.4',
  9.2: '2.4',
  9.1: '2.4',
  '9.0': '2.3',
  8.13: '2.3',
  8.12: '2.2',
  8.11: '2.2',
  '8.10': '2.2',
  8.9: '2.1',
  8.8: '2.1',
  8.7: '2.1',
  8.6: '2.1',
}

/** Pins held back on purpose — shown as a note next to the dependency instead of a plain 🟡. */
export const HOLDS = [
  {
    match: (dep) => dep.alias === 'mlkit-genai-prompt' || dep.name === 'genai-prompt',
    note: '1.0.0-beta3+ needs the Kotlin ≥ 2.3 stdlib (docs/guide/ai.md) — keep Kotlin ≥ 2.3',
  },
  {
    match: (dep) => dep.alias === 'androidx-core-ktx',
    note: 'held below 1.19: 1.19+ needs compileSdk 37 and AGP ≥ 9.1 — part of the AGP 9 migration',
  },
  {
    match: (dep) => dep.alias === 'okhttp',
    note: 'held on 4.x: 5.x is a major (Kotlin Multiplatform rewrite) — bump deliberately',
  },
]

const majorMinor = (v) => String(v).split('.').slice(0, 2).join('.')

/** The minimum Gradle for an AGP version, or `undefined` when the table has no row for it. */
export function minGradleFor(agp) {
  return AGP_MIN_GRADLE[majorMinor(agp)]
}

/** The newest Kotlin major.minor an AGP version's R8 supports, or `undefined` when unknown. */
export function maxKotlinFor(agp) {
  return AGP_MAX_KOTLIN[majorMinor(agp)]
}

/** The minimum AGP for compiling against `api` (`36`, `36.1`, `37`). */
export function minAgpForApi(api) {
  const key = String(api)
  return API_MIN_AGP[key] ?? API_MIN_AGP[`${key}.0`] ?? API_MIN_AGP[key.split('.')[0]]
}
