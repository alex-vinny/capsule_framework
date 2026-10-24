// Docs: docs/reference/cli.md, docs/contributing/template-authoring.md, docs/reference/lockfile.md
import { Command } from 'commander'
import prompts from 'prompts'
import chalk from 'chalk'
import ora from 'ora'
import fsExtra from 'fs-extra'
const { copySync, writeFileSync, ensureDirSync } = fsExtra
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { applyTailwind } from '../tailwind.js'
import { applyTesting } from '../testing.js'
import { ANDROID_TOOLCHAIN } from '../platform/android-toolchain.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// In development the repo layout is:
//   capsule/packages/cli/dist/  ← __dirname
//   templates/                  ← ../../../../templates/
// In production (global install) that path won't exist → falls back to GitHub.
const LOCAL_TEMPLATES_DIR = join(__dirname, '../../../../templates')

// Single public templates repo (one subdir per template), fetched with giget.
const TEMPLATES_REPO = 'alex-vinny/capsule-templates'
const TEMPLATES_BRANCH = 'main'
const MANIFEST_RAW_URL = `https://raw.githubusercontent.com/${TEMPLATES_REPO}/${TEMPLATES_BRANCH}/manifest.json`

interface TemplateEntry {
  value: string
  title: string
  dir: string
}

// Bundled fallback — used only if neither the local templates/ folder nor the
// remote manifest is reachable. Keep in sync with templates/manifest.json.
const DEFAULT_TEMPLATES: TemplateEntry[] = [
  { value: 'vanilla-js', title: 'Vanilla JavaScript', dir: 'capsule-vanilla-js-template' },
  { value: 'vanilla-ts', title: 'Vanilla TypeScript', dir: 'capsule-vanilla-ts-template' },
  { value: 'react-ts', title: 'React + TypeScript', dir: 'capsule-react-ts-template' },
  { value: 'vue-ts', title: 'Vue + TypeScript', dir: 'capsule-vue-ts-template' },
  { value: 'svelte-ts', title: 'Svelte + TypeScript', dir: 'capsule-svelte-ts-template' },
  { value: 'angular-ts', title: 'Angular + TypeScript', dir: 'capsule-angular-ts-template' },
  {
    value: 'jquery-bootstrap',
    title: 'jQuery + Bootstrap',
    dir: 'capsule-jquery-bootstrap-template',
  },
]

// Discover the official template list. Local folder wins (dev); otherwise pull
// the manifest from the templates repo so adding a template doesn't need a CLI
// release; bundled list is the offline/failure fallback.
async function loadManifest(): Promise<TemplateEntry[]> {
  const localManifest = join(LOCAL_TEMPLATES_DIR, 'manifest.json')
  if (existsSync(localManifest)) {
    try {
      return JSON.parse(readFileSync(localManifest, 'utf8')) as TemplateEntry[]
    } catch {
      /* fall through */
    }
  }
  try {
    const res = await fetch(MANIFEST_RAW_URL)
    if (res.ok) return (await res.json()) as TemplateEntry[]
  } catch {
    /* offline — use bundled */
  }
  return DEFAULT_TEMPLATES
}

// Accept a human browser URL in addition to giget's shorthand, so users can
// paste the link from the address bar. giget itself only understands the
// shorthand (gh:owner/repo…), not a github.com web URL.
//   https://github.com/owner/repo               → gh:owner/repo
//   https://github.com/owner/repo/tree/dev       → gh:owner/repo#dev
//   https://github.com/owner/repo/tree/dev/sub   → gh:owner/repo/sub#dev
// gitlab.com → gitlab:, bitbucket.org → bitbucket:. Anything else (tarball URLs,
// already-shorthand, local paths) passes through untouched.
function normalizeTemplateSource(input: string): string {
  if (!/^https?:\/\//i.test(input)) return input
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return input
  }
  const host = url.hostname.replace(/^www\./, '')
  const provider =
    host === 'github.com'
      ? 'gh'
      : host === 'gitlab.com'
        ? 'gitlab'
        : host === 'bitbucket.org'
          ? 'bitbucket'
          : null
  if (!provider) return input // unknown host — let giget try it (e.g. a tarball URL)

  const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/')
  if (parts.length < 2) return input
  const owner = parts[0]
  const repo = parts[1].replace(/\.git$/, '')
  let branch: string | undefined
  let subdir: string | undefined
  if (parts[2] === 'tree' && parts[3]) {
    branch = parts[3]
    if (parts.length > 4) subdir = parts.slice(4).join('/')
  }
  let out = `${provider}:${owner}/${repo}`
  if (subdir) out += `/${subdir}`
  if (branch) out += `#${branch}`
  return out
}

const command = new Command('init')
  .argument('[name]', 'project directory name')
  .option(
    '--template <template>',
    'official name (react-ts, vue-ts, …), a GitHub/GitLab/Bitbucket URL (or gh:owner/repo[/subdir][#ref]), a tarball URL, or a local path'
  )
  .option('--app-id <appId>', 'reverse-domain app ID')
  .option('--css <css>', 'optional CSS layer: none (default) | tailwind')
  .option('--test <test>', 'optional test harness: none (default) | vitest')
  .description('Scaffold a new Capsule project from a template')
  .action(async (name: string | undefined, opts) => {
    const manifest = await loadManifest()

    const answers = await prompts([
      {
        type: name ? null : 'text',
        name: 'name',
        message: 'Project name',
        initial: 'my-app',
      },
      {
        type: opts.appId ? null : 'text',
        name: 'appId',
        message: 'App ID (reverse-domain)',
        initial: 'com.example.myapp',
      },
      {
        type: opts.template ? null : 'select',
        name: 'template',
        message: 'Template',
        choices: manifest.map((t) => ({ title: t.title, value: t.value })),
      },
      {
        type: opts.css ? null : 'select',
        name: 'css',
        message: 'CSS layer',
        choices: [
          { title: 'None (plain CSS)', value: 'none' },
          { title: 'Tailwind CSS (native preset)', value: 'tailwind' },
        ],
        initial: 0,
      },
      {
        type: opts.test ? null : 'select',
        name: 'test',
        message: 'Test harness',
        choices: [
          { title: 'None', value: 'none' },
          { title: 'Vitest (unit + component + QuickJS fidelity)', value: 'vitest' },
        ],
        initial: 0,
      },
    ])

    const projectName: string = name ?? answers.name
    const appId: string = opts.appId ?? answers.appId
    const template: string = opts.template ?? answers.template
    const css: string = opts.css ?? answers.css ?? 'none'
    const test: string = opts.test ?? answers.test ?? 'none'

    const spinner = ora(`Creating ${projectName}...`).start()
    const projectDir = join(process.cwd(), projectName)
    ensureDirSync(projectDir)

    // Resolve the template source:
    //  1. official short name → local folder (dev) or templates-repo subdir (prod)
    //  2. otherwise treat the value as a custom source: local path or giget URI
    //     (gh:owner/repo, gitlab:, bitbucket:, https tarball, …)
    const entry = manifest.find((t) => t.value === template)
    const officialLocalPath = entry ? join(LOCAL_TEMPLATES_DIR, entry.dir) : null

    if (officialLocalPath && existsSync(officialLocalPath)) {
      spinner.text = 'Copying template from local folder...'
      copySync(officialLocalPath, projectDir)
    } else if (entry) {
      spinner.text = 'Downloading official template...'
      const { downloadTemplate } = await import('giget')
      await downloadTemplate(`gh:${TEMPLATES_REPO}/${entry.dir}#${TEMPLATES_BRANCH}`, {
        dir: projectDir,
        force: true,
      })
    } else if (existsSync(template)) {
      spinner.text = `Copying template from ${template}...`
      copySync(template, projectDir)
    } else {
      const source = normalizeTemplateSource(template)
      spinner.text = `Downloading template from ${source}...`
      const { downloadTemplate } = await import('giget')
      try {
        await downloadTemplate(source, { dir: projectDir, force: true })
      } catch (e) {
        spinner.fail(chalk.red(`Could not fetch template "${template}"`))
        console.error(
          chalk.dim(
            'Expected an official name (react-ts, vue-ts, …), a GitHub/GitLab/Bitbucket URL ' +
              '(or gh:owner/repo[/subdir][#ref]), a tarball URL, or a local path.'
          )
        )
        throw e
      }
    }

    // The CLI owns capsule.config.ts/lock — but never clobber a config a custom
    // template chose to ship (official templates intentionally don't ship one).
    if (!existsSync(join(projectDir, 'capsule.config.ts'))) {
      writeFileSync(
        join(projectDir, 'capsule.config.ts'),
        generateConfig(appId, projectName, template)
      )
    }
    writeFileSync(join(projectDir, 'capsule.lock'), generateInitialLock())
    if (!existsSync(join(projectDir, '.gitignore'))) {
      writeFileSync(join(projectDir, '.gitignore'), GITIGNORE)
    }

    if (css === 'tailwind') {
      spinner.text = 'Adding Tailwind CSS (native preset)...'
      const applied = applyTailwind(projectDir, template)
      if (!applied) {
        spinner.text = ''
        console.log(chalk.yellow(`  Tailwind not yet wired for "${template}" — kept plain CSS.`))
      }
    }

    if (test === 'vitest') {
      spinner.text = 'Adding Vitest test harness...'
      const applied = applyTesting(projectDir, template)
      if (!applied) {
        spinner.text = ''
        console.log(chalk.yellow(`  Test harness not yet wired for "${template}" — skipped.`))
      }
    }

    spinner.text = 'Installing dependencies...'
    const install = await execa('pnpm', ['install'], { cwd: projectDir, reject: false })
    if (install.exitCode !== 0) {
      // The project is written; only the install failed. Until @capsule/core is on npm that is
      // the expected outcome outside this repo, so say what to do instead of a stack trace.
      spinner.warn(chalk.yellow(`Created ${projectName}, but \`pnpm install\` failed`))
      const output = `${install.stdout ?? ''}\n${install.stderr ?? ''}`
      if (/@capsule%2F|@capsule\//.test(output) && /404|not in the npm registry/i.test(output)) {
        console.log(`
  @capsule packages are not on npm yet. Point the project at a local checkout:
    ${chalk.cyan(`cd ${projectName}`)}
    ${chalk.cyan('pnpm add @capsule/core@link:<path-to-capsule_framework>/packages/core')}
`)
      } else {
        console.log(chalk.gray(output.trim().split('\n').slice(-8).join('\n')))
      }
      process.exitCode = 1
      return
    }

    spinner.succeed(chalk.green(`Created ${projectName}`))
    const testStep = test === 'vitest' ? `\n    ${chalk.cyan('capsule test')}` : ''
    console.log(`
  ${chalk.bold('Next steps:')}
    ${chalk.cyan(`cd ${projectName}`)}
    ${chalk.cyan('capsule add android')}
    ${chalk.cyan('capsule dev')}${testStep}
`)
  })

// ── Generators ──────────────────────────────────────────────────────────────

// A new app starts on the library's own SDK levels. A library build declares no targetSdk
// (AGP ignores it for libraries), so the app targets the compileSdk the library is built and
// tested against — which the upkeep sweep keeps at or above Google Play's requirement.
export const DEFAULT_ANDROID_SDKS = {
  minSdk: ANDROID_TOOLCHAIN.minSdk,
  targetSdk: ANDROID_TOOLCHAIN.targetSdk ?? ANDROID_TOOLCHAIN.compileSdk,
  compileSdk: ANDROID_TOOLCHAIN.compileSdk,
}

export function generateConfig(appId: string, appName: string, template: string): string {
  const webSection =
    template === 'angular-ts'
      ? `\n  web: {\n    buildCommand: 'pnpm exec ng build',\n    devCommand:   'pnpm exec ng serve --host=0.0.0.0',\n  },`
      : ''

  return `export default {
  appId:   '${appId}',
  appName: '${appName}',

  version: {
    name:        '1.0.0',
    buildNumber: 1
  },

  android: {
    minSdk:     ${DEFAULT_ANDROID_SDKS.minSdk},
    targetSdk:  ${DEFAULT_ANDROID_SDKS.targetSdk},
    compileSdk: ${DEFAULT_ANDROID_SDKS.compileSdk},
  },${webSection}
}
`
}

function generateInitialLock(): string {
  return `# capsule.lock — commit this file
# Generated by @capsule/cli. Do not edit manually.
# Regenerate with: capsule sync
lockfileVersion: 1
# Run 'capsule add android' then 'capsule sync' to populate this file.
`
}

const GITIGNORE = `# Dependencies
node_modules/

# Generated by capsule — never commit
.capsule/

# Build output
dist/

# Angular cache
.angular/

# Environment variables
.env
.env.local
*.env

# Logs
*.log
`

export default command
