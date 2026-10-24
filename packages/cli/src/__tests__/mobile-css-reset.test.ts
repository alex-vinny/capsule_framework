import { describe, it, expect } from 'vitest'
import { getMobileResetCss, hasMobileReset, applyMobileReset } from '../mobile-css-reset.js'

describe('mobile-css-reset', () => {
  describe('getMobileResetCss', () => {
    it('returns the reset CSS containing the four core properties', () => {
      const css = getMobileResetCss()
      expect(css).toContain('box-sizing: border-box')
      expect(css).toContain('-webkit-tap-highlight-color: transparent')
      expect(css).toContain('touch-action: manipulation')
      expect(css).toContain('overscroll-behavior: none')
    })

    it('stays small (~150 bytes of rules)', () => {
      const css = getMobileResetCss()
      // The whole reset should stay well under 500 bytes
      expect(css.length).toBeLessThan(500)
    })
  })

  describe('hasMobileReset', () => {
    it('defaults to true when no config is given', () => {
      expect(hasMobileReset({})).toBe(true)
    })

    it('defaults to true when web config exists but mobileReset is unset', () => {
      expect(hasMobileReset({ web: {} })).toBe(true)
    })

    it('returns false when mobileReset is explicitly false', () => {
      expect(hasMobileReset({ web: { mobileReset: false } })).toBe(false)
    })

    it('returns true when mobileReset is explicitly true', () => {
      expect(hasMobileReset({ web: { mobileReset: true } })).toBe(true)
    })
  })

  describe('applyMobileReset', () => {
    const sampleHtml =
      '<!DOCTYPE html><html><head><title>App</title></head><body><div id="app"></div></body></html>'

    it('injects the reset CSS before </head> by default', () => {
      const result = applyMobileReset(sampleHtml, {})
      expect(result).toContain('<style data-capsule-reset>')
      expect(result).toContain('box-sizing: border-box')
      // The style block must land inside <head>, before </head>
      const headEnd = result.indexOf('</head>')
      const styleEnd = result.indexOf('</style>')
      expect(styleEnd).toBeGreaterThan(-1)
      expect(styleEnd).toBeLessThan(headEnd)
    })

    it('does not modify the HTML when mobileReset is false', () => {
      const result = applyMobileReset(sampleHtml, { web: { mobileReset: false } })
      expect(result).toBe(sampleHtml)
      expect(result).not.toContain('box-sizing')
    })

    it('keeps the document valid', () => {
      const result = applyMobileReset(sampleHtml, {})
      expect(result).toContain('<!DOCTYPE html>')
      expect(result).toContain('</html>')
    })

    it('is idempotent — a second pass injects nothing', () => {
      const once = applyMobileReset(sampleHtml, {})
      expect(applyMobileReset(once, {})).toBe(once)
    })

    it('falls back to injecting before </body> when </head> is missing', () => {
      const headlessHtml = '<html><body><div id="app"></div></body></html>'
      const result = applyMobileReset(headlessHtml, {})
      expect(result).toContain('box-sizing: border-box')
      const bodyEnd = result.indexOf('</body>')
      const styleEnd = result.indexOf('</style>')
      expect(styleEnd).toBeGreaterThan(-1)
      expect(styleEnd).toBeLessThan(bodyEnd)
    })

    it('appends at the end when neither </head> nor </body> exist', () => {
      const fragment = '<div id="app"></div>'
      const result = applyMobileReset(fragment, {})
      expect(result).toContain('box-sizing: border-box')
      expect(result.startsWith(fragment)).toBe(true)
    })
  })
})
