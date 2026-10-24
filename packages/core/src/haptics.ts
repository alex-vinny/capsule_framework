// Docs: docs/reference/core-api.md
import type { Bridge } from './bridge.js'

/**
 * Feedback pattern for `haptics.vibrate()`. Impact styles (`light`, `medium`, `heavy`) and
 * notification styles (`success`, `warning`, `error`) map to the closest platform effect;
 * `selection` is the lightest tick.
 */
export type HapticStyle =
  'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection'

const METHODS = {
  VIBRATE: 'haptics.vibrate',
} as const

/** Haptic feedback. Use the `haptics` singleton. */
export class HapticsModule {
  constructor(private readonly bridge: Bridge) {}

  /** Plays one haptic effect; does nothing on devices without a vibrator. */
  vibrate(style: HapticStyle = 'medium'): Promise<void> {
    return this.bridge.call(METHODS.VIBRATE, { style })
  }
}
