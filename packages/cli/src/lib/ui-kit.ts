// Docs: docs/reference/cli.md, docs/decisions/0002-capsule-ui.md
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/** `src/` of the installed @capsule/ui-kit package — the sources `capsule add-ui` copies. */
export function uiKitSourceDir(): string {
  const require = createRequire(import.meta.url)
  return join(dirname(require.resolve('@capsule/ui-kit/package.json')), 'src')
}

/** Components the ui-kit ships: one per file in `src/components/`. */
export function uiKitComponents(sourceDir: string): string[] {
  return readdirSync(join(sourceDir, 'components'))
    .filter((file) => file.endsWith('.ts'))
    .map((file) => file.slice(0, -'.ts'.length))
    .sort()
}

export interface AddUiOptions {
  /** ui-kit `src/` directory (see uiKitSourceDir). */
  sourceDir: string
  /** Where the app keeps its copies, e.g. `<project>/src/ui`. */
  targetDir: string
  components: string[]
  /** Overwrite files that already exist. */
  force?: boolean
}

export interface AddUiResult {
  /** Paths relative to targetDir, forward slashes. */
  copied: string[]
  skipped: string[]
}

/**
 * Copies ui-kit component sources into the app — the app owns its copy and may edit it.
 * The layout mirrors ui-kit's own `src/` so the components' `../tokens` imports keep working:
 * `<targetDir>/tokens.ts` and `<targetDir>/components/<name>.ts`. Existing files are kept
 * (they may be customised) unless `force` is set.
 */
export function addUiComponents(options: AddUiOptions): AddUiResult {
  const available = uiKitComponents(options.sourceDir)
  const requested = [...new Set(options.components.map((name) => name.toLowerCase()))]
  const unknown = requested.filter((name) => !available.includes(name))
  if (unknown.length > 0) {
    throw new Error(
      `Unknown UI component: ${unknown.join(', ')}. Available: ${available.join(', ')}`
    )
  }

  const result: AddUiResult = { copied: [], skipped: [] }
  for (const file of ['tokens.ts', ...requested.map((name) => `components/${name}.ts`)]) {
    const destination = join(options.targetDir, file)
    if (existsSync(destination) && !options.force) {
      result.skipped.push(file)
      continue
    }
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(join(options.sourceDir, file), destination)
    result.copied.push(file)
  }
  return result
}
