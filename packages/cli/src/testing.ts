// Docs: docs/reference/cli.md, docs/contributing/testing.md
import fsExtra from 'fs-extra'
const { copySync, readFileSync, writeFileSync, existsSync } = fsExtra
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Fixtures live alongside the built CLI:  packages/cli/assets/testing/
//   _shared/        → framework-agnostic tiers, copied into every project
//   <framework>/    → vitest.config + setup + component test for that framework
// In dev:  dist/testing.js → ../assets/testing.  Published via the "assets" files entry.
const TESTING_ASSETS_DIR = join(__dirname, '../assets/testing')

// Toolchain every harness needs: Vitest + jsdom, plus quickjs-emscripten + esbuild
// for the embedded-runtime fidelity test.
const SHARED_DEPS: Record<string, string> = {
  vitest: '^4.1.12',
  jsdom: '^25.0.0',
  'quickjs-emscripten': '^0.31.0',
  esbuild: '^0.28.2',
  '@types/node': '^22.0.0',
}

// Per-framework extras for the component test. Vanilla/jQuery drive the DOM
// directly (no Testing Library binding). Angular ships agnostic tiers only.
const FRAMEWORK_DEPS: Record<string, Record<string, string>> = {
  'react-ts': {
    '@testing-library/react': '^16.0.0',
    '@testing-library/dom': '^10.0.0',
    '@testing-library/jest-dom': '^6.0.0',
    '@testing-library/user-event': '^14.0.0',
  },
  'vue-ts': {
    '@testing-library/vue': '^8.0.0',
    '@testing-library/jest-dom': '^6.0.0',
    '@testing-library/user-event': '^14.0.0',
  },
  'svelte-ts': {
    '@testing-library/svelte': '^5.2.0',
    '@testing-library/jest-dom': '^6.0.0',
    '@testing-library/user-event': '^14.0.0',
  },
  'vanilla-ts': {},
  'vanilla-js': {},
  'jquery-bootstrap': {},
  'angular-ts': {},
}

const TEST_SCRIPTS: Record<string, string> = {
  test: 'vitest run',
  'test:watch': 'vitest',
}

// Frameworks with fixtures under assets/testing/. Others fall through (init prints
// a "tests not yet wired for X" note, like Tailwind on a custom source).
const SUPPORTED = Object.keys(FRAMEWORK_DEPS)

/**
 * Adds an opt-in Vitest harness to a freshly-scaffolded project:
 *   • route-contract  — fails if a bridge.call/fetch route has no handler file
 *   • routes          — pure-function unit tests for the handlers
 *   • app (component) — renders the app with @capsule/core's FakeBridge swapped in
 *   • quickjs         — bundles routes + runs them in a real QuickJS runtime
 *   • integration     — HML-gated (CAPSULE_API_BASE), skipped by default
 *
 * The first four are shared verbatim; only the component test + vitest config are
 * framework-specific. Angular ships the agnostic tiers only (see testing.md).
 * Returns false if the framework isn't wired yet (keeps a plain scaffold).
 */
export function applyTesting(projectDir: string, template: string): boolean {
  if (!SUPPORTED.includes(template)) return false

  const frameworkFixtures = join(TESTING_ASSETS_DIR, template)
  if (!existsSync(frameworkFixtures)) return false

  // Shared agnostic tiers first, then the framework-specific files (vitest config,
  // setup, component test). copySync merges into the project's src/ tree.
  copySync(join(TESTING_ASSETS_DIR, '_shared'), projectDir)
  copySync(frameworkFixtures, projectDir)

  const pkgPath = join(projectDir, 'package.json')
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    pkg.scripts = { ...pkg.scripts, ...TEST_SCRIPTS }
    pkg.devDependencies = {
      ...pkg.devDependencies,
      ...SHARED_DEPS,
      ...FRAMEWORK_DEPS[template],
    }
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  }

  return true
}
