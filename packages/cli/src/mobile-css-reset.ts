// Docs: docs/guide/mobile-css-reset.md
// Mobile CSS Reset — ~150 bytes `capsule build` injects into every built app's dist/index.html.
// Fixes common mobile web issues: box-sizing, tap highlight, touch bounce.
// Opt-out: set web.mobileReset: false in capsule.config.ts

const RESET_MARKER = 'data-capsule-reset'

// The reset CSS — inline in the built index.html <head>
const mobileResetCss = `
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
`

/**
 * getMobileResetCss — returns the mobile reset CSS string.
 * Used by the build pipeline to inject into index.html.
 */
export function getMobileResetCss(): string {
  return mobileResetCss
}

/**
 * hasMobileReset — checks if mobile reset is enabled in config.
 * Defaults to true for backward compatibility.
 */
export function hasMobileReset(config: { web?: { mobileReset?: boolean } }): boolean {
  return config.web?.mobileReset !== false
}

/**
 * applyMobileReset — injects the mobile reset CSS into an HTML string.
 * Used by the build pipeline during `capsule build`.
 * @param html - The HTML string to inject into
 * @param config - The capsule config (checks mobileReset flag)
 * @returns The HTML string with mobile reset CSS injected into <head>
 */
export function applyMobileReset(
  html: string,
  config: {
    web?: { mobileReset?: boolean }
  }
): string {
  // The marker attribute makes the reset identifiable in the built output, so a second pass
  // over the same file (e.g. a rebuild that reuses dist/) never injects it twice.
  if (!hasMobileReset(config) || html.includes(RESET_MARKER)) {
    return html
  }

  // Wrap the raw CSS in a <style> block so the injected fragment is valid HTML.
  const styleBlock = `<style ${RESET_MARKER}>` + getMobileResetCss() + '</style>'

  // Inject the style block just before the closing </head> tag
  const injectPosition = html.lastIndexOf('</head>')

  if (injectPosition === -1) {
    // No </head> found — inject before </body>, or append at the end
    const bodyInjectPos = html.lastIndexOf('</body>')
    if (bodyInjectPos === -1) {
      return html + '\n' + styleBlock
    }
    return html.slice(0, bodyInjectPos) + '\n' + styleBlock + html.slice(bodyInjectPos)
  }

  return html.slice(0, injectPosition) + styleBlock + html.slice(injectPosition)
}
