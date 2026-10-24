---
title: "Alert styling"
audience: app-developer
status: current
code:
  - packages/core/src/alerts.ts
  - packages/capsule-android/capsule/src/main/kotlin/dev/capsule/alerts/**
  - packages/capsule-android/capsule/src/main/kotlin/dev/capsule/handlers/alerts/**
tests:
  - packages/core/src/__tests__/alerts.test.ts
---
# Alert Styling

`alerts.show()` accepts an optional `style` object that controls the visual
appearance of the native dialog. Every property maps to a specific, tested
native API — this is not a CSS layer. Properties not listed in `AlertStyle`
are not supported on any platform and are intentionally absent.

```typescript
import { alerts } from '@capsule/core'
import type { AlertStyle } from '@capsule/core'

await alerts.show({
  title: 'Confirm',
  message: 'Do you want to continue?',
  buttons: [
    { label: 'Cancel', role: 'cancel' },
    { label: 'Continue', role: 'default' },
  ],
  style: {
    accentColor: '#0A84FF',
    backgroundColor: '#1C1C1E',
    titleColor: '#FFFFFF',
    messageColor: '#EBEBF5',
    titleSize: 17,
    messageSize: 14,
    cornerRadius: 16,
    buttonAllCaps: false,
    dimAmount: 0.8,
  },
})
```

## Supported properties

| Property | Type | Android | iOS |
|---|---|---|---|
| `accentColor` | `string` (hex) | button text color | `tintColor` |
| `backgroundColor` | `string` (hex) | window background | **not supported** |
| `titleColor` | `string` (hex) | title `TextView` color | `NSAttributedString` |
| `messageColor` | `string` (hex) | message `TextView` color | `NSAttributedString` |
| `titleSize` | `number` (sp / pt) | `setTextSize(SP)` | `NSAttributedString` font |
| `messageSize` | `number` (sp / pt) | `setTextSize(SP)` | `NSAttributedString` font |
| `buttonAllCaps` | `boolean` | `Button.isAllCaps` | **ignored** (iOS is always mixed-case) |
| `cornerRadius` | `number` (dp / pt) | `GradientDrawable.cornerRadius` | **not supported** |
| `dimAmount` | `number` (0.0 – 1.0) | `Window.setDimAmount()` | **not supported** |

Properties marked **not supported** are silently ignored — they do not throw,
but they have no visual effect on that platform.

Colors accept `#RGB`, `#RRGGBB`, or `#AARRGGBB` (alpha-first).  
Sizes are in sp on Android and pt on iOS.  
Lengths (cornerRadius) are in dp on Android and pt on iOS.

## Style presets pattern

Capsule intentionally ships no built-in presets — the framework is unopinionated
about your app's visual language. The recommended pattern is to define your own
preset map, keyed to your design tokens, and reuse it across calls:

```typescript
// lib/alert-styles.ts
import type { AlertStyle } from '@capsule/core'

export const alertStyles = {
  dark: {
    backgroundColor: '#1C1C1E',
    titleColor: '#FFFFFF',
    messageColor: '#EBEBF5',
    accentColor: '#0A84FF',
    cornerRadius: 16,
    buttonAllCaps: false,
    dimAmount: 0.8,
  },
  danger: {
    accentColor: '#FF3B30',
    titleColor: '#FF3B30',
  },
  branded: {
    accentColor: '#34C759',
    cornerRadius: 20,
    buttonAllCaps: false,
  },
} satisfies Record<string, AlertStyle>
```

```typescript
// anywhere in your app
import { alerts } from '@capsule/core'
import { alertStyles } from './lib/alert-styles'

await alerts.show({
  title: 'Delete',
  message: 'This cannot be undone.',
  buttons: [
    { label: 'Cancel', role: 'cancel' },
    { label: 'Delete', role: 'destructive' },
  ],
  style: alertStyles.danger,
})
```

You can also spread a preset and override individual properties per call:

```typescript
style: { ...alertStyles.dark, accentColor: '#FF9500' }
```

## What is not supported

The following are intentionally absent from `AlertStyle`. They cannot be
implemented via the native `AlertDialog` / `UIAlertController` APIs without
replacing the dialog with a fully custom view:

- Per-button colors (all buttons share `accentColor`)
- Custom fonts / typefaces
- Button background colors or shapes
- Dialog width or height
- Entry / exit animations
- Custom layout or additional views (icons, images, inputs)

If you need any of these, the escape hatch is to implement a custom
`AlertsProvider` on the native side while keeping the same TypeScript API.
