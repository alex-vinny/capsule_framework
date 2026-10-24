// Docs: docs/reference/cli.md
import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { execa } from 'execa'
import fsExtra from 'fs-extra'
const { copySync, ensureDirSync } = fsExtra
import { join, relative, basename } from 'node:path'
import { writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { syncProject } from '../sync/sync.js'
import { loadConfig } from '../config.js'
import { applyMobileReset } from '../mobile-css-reset.js'
import { warnStoreRequirements } from '../platform/store-check.js'

/**
 * Recursively collect all .ts files under a directory.
 * Returns paths relative to the given root for use in import statements.
 */
function collectTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(full))
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(full)
    }
  }
  return results
}

/**
 * Convert a src/server/routes/*.ts file path to its /api/ URL path.
 * Examples:
 *   src/server/routes/users.ts        → /api/users
 *   src/server/routes/users/posts.ts  → /api/users/posts
 */
function filePathToApiPath(filePath: string, routesDir: string): string {
  const rel = relative(routesDir, filePath) // e.g. "users.ts" or "users/posts.ts"
  const withoutExt = rel.replace(/\.ts$/, '') // "users" or "users/posts"
  return '/api/' + withoutExt.replace(/\\/g, '/')
}

/**
 * Bundles @capsule/core's router + user route files into assets/server/bundle.js.
 *
 * Sub-task A (JSON-RPC overrides): src/routes/<method>.ts
 *   export default function handler(params) { ... }
 *   → addRoute("method.name", handler)
 *
 * Sub-task B (HTTP API routes): src/server/routes/**\/*.ts
 *   export function GET(req: CapsuleHttpRequest) { ... }
 *   → addHttpRoute("/api/path", "GET", handler)
 *
 * esbuild produces an IIFE bundle assigned to capsuleRouter, then we append
 * top-level var aliases so QuickJSBridge can call dispatch() / handleHttpRequest()
 * by name via engine.call() — QuickJS looks up the global scope.
 *
 * Output: assets/server/bundle.js  (never served as a static asset by the embedded server)
 */
async function bundleRoutes(projectRoot: string, serverDir: string, verbose: boolean) {
  const { build } = await import('esbuild')

  const rpcRoutesDir = join(projectRoot, 'src', 'routes')
  const httpRoutesDir = join(projectRoot, 'src', 'server', 'routes')

  const rpcFiles = collectTsFiles(rpcRoutesDir)
  const httpFiles = collectTsFiles(httpRoutesDir)

  const lines: string[] = [
    "import { dispatch, addRoute, handleHttpRequest, addHttpRoute } from '@capsule/core/routes';",
  ]

  // JSON-RPC overrides: filename (without ext) = method name
  for (let i = 0; i < rpcFiles.length; i++) {
    const file = rpcFiles[i]
    const methodName = basename(file, '.ts')
    const relPath = './' + relative(projectRoot, file).replace(/\\/g, '/')
    lines.push(`import rpcHandler${i} from '${relPath}';`)
    lines.push(`addRoute(${JSON.stringify(methodName)}, rpcHandler${i});`)
  }

  // HTTP routes: file path → /api/... path, exported verbs → addHttpRoute
  const HTTP_VERBS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
  for (let i = 0; i < httpFiles.length; i++) {
    const file = httpFiles[i]
    const apiPath = filePathToApiPath(file, httpRoutesDir)
    const relPath = './' + relative(projectRoot, file).replace(/\\/g, '/')
    lines.push(`import * as httpHandler${i} from '${relPath}';`)
    for (const verb of HTTP_VERBS) {
      lines.push(
        `if (typeof httpHandler${i}.${verb} === 'function') addHttpRoute(${JSON.stringify(apiPath)}, '${verb}', httpHandler${i}.${verb});`
      )
    }
  }

  lines.push('export { dispatch, addRoute, handleHttpRequest, addHttpRoute };')

  const result = await build({
    stdin: {
      contents: lines.join('\n'),
      loader: 'ts',
      resolveDir: projectRoot,
    },
    bundle: true,
    format: 'iife',
    globalName: 'capsuleRouter',
    platform: 'neutral',
    write: false,
    logLevel: verbose ? 'info' : 'silent',
  })

  // Expose the four globals for QuickJS engine.call() by name.
  const bundled = result.outputFiles[0].text
  const js =
    bundled +
    '\nvar dispatch = capsuleRouter.dispatch;' +
    '\nvar addRoute = capsuleRouter.addRoute;' +
    '\nvar handleHttpRequest = capsuleRouter.handleHttpRequest;' +
    '\nvar addHttpRoute = capsuleRouter.addHttpRoute;\n'

  ensureDirSync(serverDir)
  writeFileSync(join(serverDir, 'bundle.js'), js)

  if (verbose) {
    if (rpcFiles.length > 0) {
      console.log(chalk.dim(`    JSON-RPC routes: ${rpcFiles.map((f) => basename(f)).join(', ')}`))
    }
    if (httpFiles.length > 0) {
      console.log(chalk.dim(`    HTTP routes: ${httpFiles.map((f) => basename(f)).join(', ')}`))
    }
  }
}

function log(verbose: boolean, msg: string) {
  if (verbose) console.log(chalk.dim(msg))
}

const command = new Command('build')
  .argument('<platform>', 'android (the only platform supported so far)')
  .option(
    '--release',
    'minified release build, signed with the local debug keystore (~/.android/debug.keystore) — not accepted by app stores yet'
  )
  .option('--format <format>', 'apk | aab', 'apk')
  .option('--verbose', 'print commands and timing')
  .description('Build a native app bundle')
  .action(async (platform: string, opts) => {
    if (platform !== 'android') {
      console.error(chalk.red('Only android is supported in Phase 1'))
      process.exit(1)
    }

    const verbose: boolean = !!opts.verbose
    const projectRoot = process.cwd()
    const config = await loadConfig(projectRoot)
    const outDir = join(projectRoot, '.capsule', 'android')
    warnStoreRequirements(config)

    const spinner = ora('Syncing native wrapper...').start()
    await syncProject(projectRoot)
    spinner.succeed('Native wrapper synced')

    // ── Web bundle ───────────────────────────────────────────────────────────
    spinner.start('Building web bundle...')
    const buildCmd = config.web?.buildCommand
    const webStart = Date.now()

    if (buildCmd) {
      log(verbose, `  $ ${buildCmd}`)
      const [bin, ...args] = buildCmd.split(' ')
      await execa(bin, args, { cwd: projectRoot, stdout: 'inherit', stderr: 'inherit' })
    } else {
      const cmd = 'pnpm exec vite build'
      log(verbose, `  $ ${cmd}`)
      await execa('pnpm', ['exec', 'vite', 'build'], {
        cwd: projectRoot,
        stdout: 'inherit',
        stderr: 'inherit',
      })
    }
    spinner.succeed(
      `Web bundle built → dist/${verbose ? chalk.dim(` (${Date.now() - webStart}ms)`) : ''}`
    )

    // ── Mobile CSS reset injection ───────────────────────────────────────
    // Injects ~150 bytes of reset CSS into dist/index.html so every app is
    // correct by default (box-sizing, tap highlight, touch-action, overscroll).
    // Opt-out: web.mobileReset: false in capsule.config.ts.
    const distIndex = join(projectRoot, 'dist', 'index.html')
    if (existsSync(distIndex)) {
      const html = readFileSync(distIndex, 'utf8')
      const patched = applyMobileReset(html, config)
      if (patched !== html) {
        writeFileSync(distIndex, patched)
        spinner.info('Mobile CSS reset injected → dist/index.html')
      }
    }

    const wwwDir = join(outDir, 'app', 'src', 'main', 'assets', 'www')
    ensureDirSync(wwwDir)
    copySync(join(projectRoot, 'dist'), wwwDir)
    spinner.succeed('Web bundle copied → .capsule/android/app/src/main/assets/www/')

    // ── Server bundle (QuickJS) ───────────────────────────────────────────────
    const serverDir = join(outDir, 'app', 'src', 'main', 'assets', 'server')
    spinner.start('Bundling server/bundle.js for QuickJS...')
    await bundleRoutes(projectRoot, serverDir, verbose)
    spinner.succeed(
      'server/bundle.js bundled → .capsule/android/app/src/main/assets/server/bundle.js'
    )

    // ── Gradle ───────────────────────────────────────────────────────────────
    const gradleTask = opts.release
      ? opts.format === 'aab'
        ? 'bundleRelease'
        : 'assembleRelease'
      : 'assembleDebug'

    const gradleCmd = process.platform === 'win32' ? join(outDir, 'gradlew.bat') : './gradlew'
    spinner.stop()
    console.log(`\nRunning Gradle ${gradleTask}...`)
    log(verbose, `  $ ${gradleCmd} ${gradleTask}  (cwd: ${outDir})`)
    const gradleStart = Date.now()

    await execa(gradleCmd, [gradleTask], {
      cwd: outDir,
      stdout: 'inherit',
      stderr: 'inherit',
      env: { ...process.env },
    })
    log(verbose, `  Gradle finished in ${((Date.now() - gradleStart) / 1000).toFixed(1)}s`)

    const apkPath = opts.release
      ? join(outDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
      : join(outDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')

    spinner.succeed(chalk.green(`Build complete → ${apkPath}`))
    console.log(`\n  ${chalk.cyan('capsule run android')}  to install on device/emulator\n`)
  })

export default command
