// Docs: docs/guide/alerts-styling.md, docs/reference/core-api.md
import type { Bridge } from './bridge.js'

const METHODS = {
  SHOW: 'alerts.show',
} as const

export type AlertButtonRole = 'default' | 'cancel' | 'destructive'

export interface AlertButton {
  label: string
  role?: AlertButtonRole
}

/**
 * Per-dialog visual style.
 *
 * IMPORTANT — this is NOT a CSS layer. Every property maps to a specific,
 * tested native API call. Properties not listed here are not supported on
 * any platform; they are intentionally absent (not forgotten). Unsupported
 * things include: per-button colors, custom fonts, layout/padding,
 * entry/exit animations, and dialog width.
 *
 * Colors: hex string — `#RGB`, `#RRGGBB`, or `#AARRGGBB` (alpha-first).
 * Sizes:  sp on Android (scale-independent pixels), pt on iOS.
 * Lengths: dp on Android, pt on iOS.
 *
 * Each property documents its exact platform behaviour below.
 * Properties marked "iOS: not supported" are silently ignored on iOS —
 * they do not throw, but they have no visual effect.
 */
export interface AlertStyle {
  // ── Colors ───────────────────────────────────────────────────────────────

  /**
   * Button text color — applied to all button slots.
   * Per-button colors are not supported by either platform's native dialog API.
   *
   * Android: `getButton(slot).setTextColor()` — fully supported.
   * iOS:     `UIAlertController.view.tintColor` — fully supported.
   */
  accentColor?: string

  /**
   * Dialog panel background color.
   *
   * Android: `GradientDrawable` on `dialog.window` — fully supported.
   * iOS:     NOT SUPPORTED — `UIAlertController` background is system-controlled
   *          and cannot be changed via public API. Setting this has no effect on iOS.
   */
  backgroundColor?: string

  /**
   * Title text color.
   *
   * Android: `TextView(android.R.id.title).setTextColor()` — fully supported.
   * iOS:     `NSAttributedString` on `alertController.setValue` — fully supported.
   */
  titleColor?: string

  /**
   * Message body text color.
   *
   * Android: `TextView(android.R.id.message).setTextColor()` — fully supported.
   * iOS:     `NSAttributedString` on `alertController.setValue` — fully supported.
   */
  messageColor?: string

  // ── Typography ───────────────────────────────────────────────────────────

  /**
   * Title text size in sp (Android) / pt (iOS).
   *
   * Android: `TextView.setTextSize(COMPLEX_UNIT_SP, value)` — fully supported.
   * iOS:     `NSAttributedString` font attribute — fully supported.
   */
  titleSize?: number

  /**
   * Message body text size in sp (Android) / pt (iOS).
   *
   * Android: `TextView.setTextSize(COMPLEX_UNIT_SP, value)` — fully supported.
   * iOS:     `NSAttributedString` font attribute — fully supported.
   */
  messageSize?: number

  /**
   * Whether button labels are rendered in uppercase.
   *
   * Android: `Button.isAllCaps` — fully supported. Platform default is `true`.
   * iOS:     NOT SUPPORTED — iOS buttons are always mixed-case. This property
   *          is silently ignored on iOS.
   */
  buttonAllCaps?: boolean

  // ── Shape ────────────────────────────────────────────────────────────────

  /**
   * Dialog panel corner radius in dp (Android) / pt (iOS).
   *
   * Android: `GradientDrawable.cornerRadius` on `dialog.window` — fully supported.
   * iOS:     NOT SUPPORTED — `UIAlertController` corner radius is system-controlled
   *          and overridden by internal masking. Setting this has no effect on iOS.
   */
  cornerRadius?: number

  // ── Overlay ──────────────────────────────────────────────────────────────

  /**
   * Backdrop scrim opacity behind the dialog.
   * Range: `0.0` (fully transparent) → `1.0` (fully opaque black).
   * Values outside this range are clamped. Platform default is ~0.5.
   *
   * Android: `Window.setDimAmount()` — fully supported.
   * iOS:     NOT SUPPORTED — `UIAlertController` scrim is system-controlled.
   *          Setting this has no effect on iOS.
   */
  dimAmount?: number
}

export interface AlertOptions {
  message: string
  title?: string
  buttons?: AlertButton[]
  style?: AlertStyle
}

export interface AlertResult {
  action: string
}

export class AlertsModule {
  constructor(private readonly bridge: Bridge) {}

  show(options: AlertOptions): Promise<AlertResult> {
    return this.bridge.call<AlertResult>(METHODS.SHOW, options)
  }
}
