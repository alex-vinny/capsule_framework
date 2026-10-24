---
title: "Mobile CSS reset"
audience: app-developer
status: current
code:
  - packages/cli/src/mobile-css-reset.ts
tests:
  - packages/cli/src/__tests__/mobile-css-reset.test.ts
---
# Mobile CSS Reset

A ~150-byte CSS reset injected automatically into every built app's `index.html`, so Capsule apps
feel like native apps by default — no developer action required.

## What it fixes

| Property | Effect |
|---|---|
| `box-sizing: border-box` | Consistent element sizing across browsers (padding/border included in width) |
| `-webkit-tap-highlight-color: transparent` | Removes the blue/gray tap flash on touch devices |
| `touch-action: manipulation` | Disables double-tap zoom delay; keeps pinch-zoom |
| `overscroll-behavior: none` | Prevents rubber-band/bounce at scroll boundaries |

## The shipped reset

Injected as a single `<style data-capsule-reset>` block before `</head>`:

```css
*, *::before, *::after {
  box-sizing: border-box;
}
* {
  -webkit-tap-highlight-color: transparent;
}
html {
  touch-action: manipulation;
  overscroll-behavior: none;
}
```

## How it's applied

During `capsule build`, after the web bundle is produced, the CLI injects the reset into
`dist/index.html` (before it is copied to `assets/www/`). The injection:

- is skipped when no `dist/index.html` exists;
- is skipped when the reset is disabled (see below);
- goes before `</head>`; without a `</head>`, before `</body>`; without either, at the end;
- is **idempotent** — the `data-capsule-reset` marker is checked first, so running the step again
  over the same file (a rebuild reusing `dist/`) never injects a second copy. The same marker lets
  downstream tooling find or strip it.

## Opt-out

Set `web.mobileReset: false` in `capsule.config.ts`:

```typescript
export default {
  // …
  web: {
    mobileReset: false,
  },
}
```

## What it intentionally does not do

The reset is deliberately minimal. It does **not**:

- zero `margin`/`padding` (use [Tailwind preflight](https://tailwindcss.com/docs/preflight) —
  `capsule init --css tailwind` wires it up);
- disable focus outlines (style `:focus-visible` in your own CSS for accessibility);
- block image drag or text selection (app-specific concern).

Component styling (radius, spacing, typography presets) is Capsule UI territory — the `ui-kit`
class builders, which take a `preset` (`ios` | `material`) per call; see `capsule add-ui` in
[cli.md](../reference/cli.md).

## Implementation

Internal to the CLI — `packages/cli/src/mobile-css-reset.ts`, not part of the `@capsule/core`
runtime API (the build runs in Node, the runtime in the WebView):

| Function | Purpose |
|---|---|
| `getMobileResetCss()` | The raw reset CSS string |
| `hasMobileReset(config)` | Whether the reset is enabled for a given config (default: `true`) |
| `applyMobileReset(html, config)` | Injects the `<style data-capsule-reset>` block into an HTML string (no-op if disabled or already present) |

`capsule build` calls `applyMobileReset`; tests: `packages/cli/src/__tests__/mobile-css-reset.test.ts`.
