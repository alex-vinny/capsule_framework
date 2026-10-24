/**
 * @capsule/ui-kit — Capsule UI (Phase 5, adr-002).
 *
 * Framework-agnostic Tailwind class builders + design tokens. No component
 * renders anything: each template (react-ts, vue-ts, svelte-ts, vanilla-ts)
 * binds these classes to its own elements, which keeps behaviour per-framework
 * and the *look* shared — Capsule's own Konsta, shadcn-style.
 *
 * Pure frontend/CSS — touches no native APIs (roadmap constraint).
 */

// Design tokens + presets + class merger
export { presets, tokensFor, cn } from './tokens'
export type { ThemePreset, DesignTokens } from './tokens'

// Button
export { button } from './components/button'
export type { ButtonVariant, ButtonSize, ButtonOptions } from './components/button'

// Card
export { card, cardHeader, cardDescription, cardFooter } from './components/card'
export type { CardVariant, CardOptions } from './components/card'

// Input / Textarea
export { input, textarea, fieldLabel } from './components/input'
export type { FieldOptions } from './components/input'

// Dialog
export {
  dialogOverlay,
  dialogPanel,
  dialogTitle,
  dialogBody,
  dialogFooter,
} from './components/dialog'

// Select
export { select, selectLabel } from './components/select'
export type { SelectOptions } from './components/select'

// Table
export { table, tableHead, tableRow, tableCell } from './components/table'
export type { TableOptions } from './components/table'
