import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addUiComponents, uiKitComponents } from '../lib/ui-kit.js'

describe('add-ui', () => {
  let sourceDir: string
  let targetDir: string

  beforeEach(() => {
    // A miniature ui-kit src/: tokens.ts + components/*.ts, like the real package.
    sourceDir = mkdtempSync(join(tmpdir(), 'ui-kit-src-'))
    mkdirSync(join(sourceDir, 'components'))
    writeFileSync(join(sourceDir, 'tokens.ts'), 'export const tokens = 1')
    writeFileSync(join(sourceDir, 'components', 'button.ts'), "import { cn } from '../tokens'")
    writeFileSync(join(sourceDir, 'components', 'card.ts'), "import { cn } from '../tokens'")
    targetDir = join(mkdtempSync(join(tmpdir(), 'app-')), 'src', 'ui')
  })

  afterEach(() => {
    rmSync(sourceDir, { recursive: true, force: true })
    rmSync(join(targetDir, '..', '..'), { recursive: true, force: true })
  })

  it('lists the components the ui-kit ships', () => {
    expect(uiKitComponents(sourceDir)).toEqual(['button', 'card'])
  })

  it("copies components next to tokens.ts, keeping ui-kit's layout so '../tokens' resolves", () => {
    const result = addUiComponents({ sourceDir, targetDir, components: ['Button'] })

    expect(result).toEqual({ copied: ['tokens.ts', 'components/button.ts'], skipped: [] })
    expect(readFileSync(join(targetDir, 'components', 'button.ts'), 'utf8')).toContain(
      "'../tokens'"
    )
    expect(existsSync(join(targetDir, 'tokens.ts'))).toBe(true)
    expect(existsSync(join(targetDir, 'components', 'card.ts'))).toBe(false)
  })

  it('keeps files the app already has unless forced', () => {
    addUiComponents({ sourceDir, targetDir, components: ['button'] })
    writeFileSync(join(targetDir, 'components', 'button.ts'), '// customised')

    const kept = addUiComponents({ sourceDir, targetDir, components: ['button', 'card'] })
    expect(kept).toEqual({
      copied: ['components/card.ts'],
      skipped: ['tokens.ts', 'components/button.ts'],
    })
    expect(readFileSync(join(targetDir, 'components', 'button.ts'), 'utf8')).toBe('// customised')

    addUiComponents({ sourceDir, targetDir, components: ['button'], force: true })
    expect(readFileSync(join(targetDir, 'components', 'button.ts'), 'utf8')).toContain('../tokens')
  })

  it('rejects unknown components before copying anything', () => {
    expect(() =>
      addUiComponents({ sourceDir, targetDir, components: ['button', 'carousel'] })
    ).toThrow('Unknown UI component: carousel. Available: button, card')
    expect(existsSync(targetDir)).toBe(false)
  })
})
