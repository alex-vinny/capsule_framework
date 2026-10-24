// Docs: docs/guide/mobile-css-reset.md
import fsExtra from 'fs-extra'
const { writeFileSync, readFileSync, existsSync } = fsExtra
import { join } from 'node:path'

// ── Shared "Capsule native preset" ───────────────────────────────────────────
// A Tailwind stylesheet that restyles the SAME class names every template uses
// (.shell/.header/.card/.btn/.tab/…) with a native iOS look — so enabling
// Tailwind needs no markup rewrite. Tailwind utilities are also available for
// the developer's own code. Components live in @layer so utilities win on
// conflict. Material variant left as a future toggle (see adr-002).
export const NATIVE_PRESET_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer components {
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .shell {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #f0f4f8;
    color: #1c1c1e;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .header {
    background: linear-gradient(135deg, #0a84ff 0%, #5856d6 100%);
    padding: 18px 24px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .header-icon {
    width: 32px; height: 32px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px;
  }
  .header-name { font-size: 18px; font-weight: 700; color: #fff; letter-spacing: -0.3px; }

  .main {
    flex: 1;
    display: flex; flex-direction: column; align-items: center;
    padding: 32px 24px; gap: 16px;
    overflow-y: auto;
  }

  .card {
    background: #fff;
    border-radius: 24px;
    padding: 36px 28px;
    max-width: 360px; width: 100%;
    box-shadow: 0 4px 32px rgba(10, 132, 255, 0.10), 0 1px 4px rgba(0, 0, 0, 0.06);
    text-align: center;
  }
  .card-badge {
    display: inline-block;
    background: #f0f4f8; color: #5856d6;
    font-size: 11px; font-weight: 700;
    letter-spacing: 0.08em; text-transform: uppercase;
    padding: 4px 12px; border-radius: 20px;
    margin-bottom: 24px;
  }
  .card-title { font-size: 28px; font-weight: 800; line-height: 1.2; letter-spacing: -0.5px; margin-bottom: 12px; }
  .card-title span { color: #0a84ff; }
  .card-desc { font-size: 15px; color: #8e8e93; line-height: 1.5; margin-bottom: 20px; }
  .result { font-size: 13px; color: #5856d6; margin-top: 8px; word-break: break-all; min-height: 18px; }

  /* iOS-native button: solid system blue, 44px touch target, press feedback */
  .btn {
    width: 100%;
    min-height: 44px;
    padding: 14px 20px;
    border-radius: 14px;
    border: none;
    background: #007aff;
    color: #fff;
    font-size: 17px;
    font-weight: 600;
    font-family: inherit;
    letter-spacing: -0.2px;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s, opacity 0.15s;
    -webkit-user-select: none;
    user-select: none;
    touch-action: manipulation;
  }
  .btn:active { background: #0063cc; transform: scale(0.98); }

  /* secondary / outline */
  .btn-clear { background: transparent; color: #8e8e93; border: 1px solid rgba(0, 0, 0, 0.18); }
  .btn-clear:active { background: rgba(0, 0, 0, 0.05); transform: scale(0.98); }
  .secondary { margin-top: 10px; }

  /* vanilla/jquery tab-panel visibility (no framework conditional rendering) */
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }

  .tab-bar {
    display: flex;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border-top: 1px solid rgba(0, 0, 0, 0.08);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .tab {
    flex: 1;
    display: flex; flex-direction: column; align-items: center;
    padding: 10px 0 14px; gap: 3px;
    background: none; border: none; cursor: pointer;
    font-family: inherit; color: #8e8e93;
    transition: color 0.15s;
  }
  .tab.active { color: #0a84ff; }
  .tab-icon { font-size: 22px; line-height: 1; }
  .tab-label { font-size: 10px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
}
`

const POSTCSS_CONFIG = `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`

function tailwindConfig(contentGlobs: string[]): string {
  const content = contentGlobs.map((g) => `'${g}'`).join(', ')
  return `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [${content}],
  theme: { extend: {} },
  plugins: [],
}
`
}

const TAILWIND_DEPS: Record<string, string> = {
  tailwindcss: '^3.4.0',
  postcss: '^8.4.0',
  autoprefixer: '^10.4.0',
}

const CONTENT: Record<string, string[]> = {
  'react-ts': ['./index.html', './src/**/*.{ts,tsx}'],
  'vue-ts': ['./index.html', './src/**/*.{vue,ts}'],
  'svelte-ts': ['./index.html', './src/**/*.{svelte,ts}'],
  'vanilla-js': ['./index.html', './src/**/*.{js,ts}'],
  'vanilla-ts': ['./index.html', './src/**/*.{js,ts}'],
  'angular-ts': ['./src/**/*.{html,ts}'],
}

const PRESET_IMPORT = "import './capsule-ui.css'\n"

function stripStyleBlocks(s: string): string {
  return s.replace(/<style[^>]*>[\s\S]*?<\/style>\s*/g, '').replace(/\n{3,}/g, '\n\n')
}

function write(file: string, content: string) {
  writeFileSync(file, content)
}

function edit(file: string, fn: (s: string) => string) {
  if (existsSync(file)) write(file, fn(readFileSync(file, 'utf8')))
}

/**
 * Adds Tailwind (v3 + PostCSS) to a freshly-scaffolded project and installs the
 * Capsule native preset, restyling the existing class names. Relocates each
 * framework's embedded styles to a shared sheet so the global preset applies.
 * Returns false if the framework isn't supported (jQuery → keeps Bootstrap).
 */
export function applyTailwind(projectDir: string, template: string): boolean {
  const content = CONTENT[template]
  if (!content) return false // jquery-bootstrap (and custom sources) keep their CSS

  // shared config + deps. Use .cjs so they load as CommonJS even when the
  // project's package.json sets "type": "module" (Vite/Tailwind templates do).
  write(join(projectDir, 'postcss.config.cjs'), POSTCSS_CONFIG)
  write(join(projectDir, 'tailwind.config.cjs'), tailwindConfig(content))
  const pkgPath = join(projectDir, 'package.json')
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    pkg.devDependencies = { ...pkg.devDependencies, ...TAILWIND_DEPS }
    write(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  }

  const p = (f: string) => join(projectDir, f)

  switch (template) {
    case 'react-ts':
      // App.tsx already imports ./App.css — just swap its contents.
      write(p('src/App.css'), NATIVE_PRESET_CSS)
      break

    case 'vue-ts':
      write(p('src/capsule-ui.css'), NATIVE_PRESET_CSS)
      edit(p('src/main.ts'), (s) => PRESET_IMPORT + s)
      edit(p('src/App.vue'), stripStyleBlocks)
      break

    case 'svelte-ts':
      write(p('src/capsule-ui.css'), NATIVE_PRESET_CSS)
      edit(p('src/main.ts'), (s) => PRESET_IMPORT + s)
      edit(p('src/App.svelte'), stripStyleBlocks)
      break

    case 'vanilla-js':
      write(p('src/capsule-ui.css'), NATIVE_PRESET_CSS)
      edit(p('src/main.js'), (s) => PRESET_IMPORT + s)
      edit(p('index.html'), stripStyleBlocks)
      break

    case 'vanilla-ts':
      write(p('src/capsule-ui.css'), NATIVE_PRESET_CSS)
      edit(p('src/main.ts'), (s) => PRESET_IMPORT + s)
      edit(p('index.html'), stripStyleBlocks)
      break

    case 'angular-ts':
      // Angular: global stylesheet via angular.json; empty the inline component styles.
      write(p('src/styles.css'), NATIVE_PRESET_CSS)
      edit(p('angular.json'), (s) => {
        const json = JSON.parse(s)
        for (const name of Object.keys(json.projects ?? {})) {
          const opts = json.projects[name]?.architect?.build?.options
          if (opts) opts.styles = ['src/styles.css']
        }
        return JSON.stringify(json, null, 2) + '\n'
      })
      edit(p('src/app.component.ts'), (s) =>
        s.replace(/styles:\s*\[\s*`[\s\S]*?`\s*\]/, 'styles: []')
      )
      break
  }

  return true
}
