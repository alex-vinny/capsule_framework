// Docs: docs/reference/cli.md, docs/guide/ota-updates.md, docs/contributing/codesync-internals.md
import { Command } from 'commander'
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs'
import { join, relative, basename } from 'node:path'
import { execa } from 'execa'
import { createHash } from 'node:crypto'
import { loadConfig } from '../config.js'
import { zipDirectory } from '../lib/zip.js'
import fsExtra from 'fs-extra'
import { build } from 'esbuild'
import ora from 'ora'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'

// Helper function to convert a src/server/routes/*.ts file path to its /api/ URL path.
function filePathToApiPath(filePath: string, routesDir: string): string {
  const rel = relative(routesDir, filePath)
  const withoutExt = rel.replace(/\.ts$/, '')
  return '/api/' + withoutExt.replace(/\\/g, '/')
}

// Function to bundle server routes and return the path to the generated bundle.js
async function bundleServerRoutes(
  projectRoot: string,
  outDir: string,
  verbose: boolean
): Promise<string> {
  const rpcRoutesDir = join(projectRoot, 'src', 'routes')
  const httpRoutesDir = join(projectRoot, 'src', 'server', 'routes')

  // Collect all .ts files under the routes directories
  const rpcFiles: string[] = []
  const httpFiles: string[] = []

  function collectTsFiles(dir: string, arr: string[]) {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        collectTsFiles(full, arr)
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        arr.push(full)
      }
    }
  }

  collectTsFiles(rpcRoutesDir, rpcFiles)
  collectTsFiles(httpRoutesDir, httpFiles)

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

  const bundled = result.outputFiles[0].text
  const js =
    bundled +
    '\nvar dispatch = capsuleRouter.dispatch;' +
    '\nvar addRoute = capsuleRouter.addRoute;' +
    '\nvar handleHttpRequest = capsuleRouter.handleHttpRoute;' +
    '\nvar addHttpRoute = capsuleRouter.addHttpRoute;\n'

  ensureDirSync(outDir)
  writeFileSync(join(outDir, 'bundle.js'), js)

  return join(outDir, 'bundle.js')
}

function ensureDirSync(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

async function buildWebBundle(
  projectRoot: string,
  config: Awaited<ReturnType<typeof loadConfig>>
): Promise<string> {
  const spinner = ora('Building web bundle...').start()
  const buildCmd = config.web?.buildCommand
  const webStart = Date.now()

  if (buildCmd) {
    const [bin, ...args] = buildCmd.split(' ')
    await execa(bin, args, { cwd: projectRoot, stdout: 'pipe', stderr: 'pipe' })
  } else {
    await execa('pnpm', ['exec', 'vite', 'build'], {
      cwd: projectRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    })
  }
  spinner.succeed(
    `Web bundle built → dist/${config.web?.buildCommand ? '' : `(vite) (${Date.now() - webStart}ms)`}`
  )

  return join(projectRoot, 'dist')
}

const command = new Command('codesync').description('CodeSync OTA update commands')

command
  .command('publish')
  .description('Publish a new bundle')
  .option('--channel <channel>', 'OTA channel (e.g., production, staging)', 'production')
  .option('--notes <notes>', 'Release notes (optional)')
  .action(async (opts) => {
    const projectRoot = process.cwd()
    const config = await loadConfig(projectRoot)

    if (!config.codeSync?.enabled) {
      console.error('CodeSync is not enabled in capsule.config.ts')
      process.exit(1)
    }

    const url = config.codeSync.url
    if (!url) {
      console.error('CodeSync URL is not configured')
      process.exit(1)
    }

    const apiKey = config.codeSync.apiKey
    if (!apiKey) {
      console.error('CodeSync API key is not configured')
      process.exit(1)
    }

    // Create a unique temporary directory in the OS temp folder
    const tmpRoot = tmpdir()
    const tmpId = randomUUID()
    const baseTmpDir = join(tmpRoot, `capsule-codesync-${tmpId}`)

    try {
      // Step 1: Build web bundle
      const distDir = await buildWebBundle(projectRoot, config)

      // Step 2: Bundle server routes (if exists)
      let serverBundlePath: string | null = null
      const serverRoutesDir = join(projectRoot, 'src', 'server', 'routes')
      if (existsSync(serverRoutesDir)) {
        const serverTmpDir = join(baseTmpDir, 'server')
        ensureDirSync(serverTmpDir)
        serverBundlePath = await bundleServerRoutes(projectRoot, serverTmpDir, false)
      }

      // Step 3: Create temporary directory for OTA bundle contents
      const otaTmpDir = join(baseTmpDir, 'ota')
      ensureDirSync(otaTmpDir)

      // www/ directory
      const wwwDir = join(otaTmpDir, 'www')
      ensureDirSync(wwwDir)
      // Copy dist/ to www/
      fsExtra.copySync(distDir, wwwDir, { overwrite: true, errorOnExist: false })

      // server/ directory (if we have a server bundle)
      if (serverBundlePath) {
        const serverDir = join(otaTmpDir, 'server')
        ensureDirSync(serverDir)
        fsExtra.copySync(serverBundlePath, join(serverDir, 'bundle.js'), {
          overwrite: true,
          errorOnExist: false,
        })
      }

      // capsule-bundle.json
      const manifest = {
        version: config.version.name,
        buildNumber: config.version.buildNumber,
        createdAt: new Date().toISOString(),
        capsuleSchemaVersion: 1,
      }
      writeFileSync(join(otaTmpDir, 'capsule-bundle.json'), JSON.stringify(manifest, null, 2))

      // Step 4: Create the ZIP file
      const zipPath = join(baseTmpDir, 'bundle.zip')
      try {
        await zipDirectory(otaTmpDir, zipPath)
      } catch (err) {
        throw new Error(
          `Failed to create bundle ZIP: ${err instanceof Error ? err.message : String(err)}`
        )
      }

      // Step 5: Compute SHA-256 of the ZIP
      const hash = createHash('sha256')
      const zipBuffer = readFileSync(zipPath)
      hash.update(zipBuffer)
      const hashHex = hash.digest('hex')

      // Step 6: Prepare the request
      const endpoint = `${url}/publish` // Assuming the endpoint is at /publish

      // Node's global FormData/Blob (Node 18+): the third append() argument is the file name.
      const form = new FormData()
      form.append('bundle', new Blob([zipBuffer], { type: 'application/zip' }), 'bundle.zip')
      form.append('sha256', hashHex)
      form.append('version', config.version.name)
      form.append('buildNumber', String(config.version.buildNumber))
      form.append('channel', opts.channel)
      if (opts.notes) {
        form.append('notes', opts.notes)
      }

      // Step 7: Send the request
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: form,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Failed to publish bundle: ${response.status} ${response.statusText}\n${errorText}`
        )
      }

      const result = await response.json()
      console.log('Bundle published successfully:', result)
    } finally {
      // Clean up temporary files and directory
      try {
        rmSync(baseTmpDir, { recursive: true, force: true })
      } catch {
        // Best effort cleanup; ignore errors
      }
    }
  })

export default command
