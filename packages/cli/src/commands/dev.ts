// Docs: docs/reference/cli.md
import { Command } from 'commander'
import chalk from 'chalk'
import { execa } from 'execa'
import { createServer } from 'vite'
import { join } from 'node:path'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { DEFAULT_DEV_PORT, loadConfig } from '../config.js'
import { startRouteServer } from '../dev-routes-server.js'

const SIDECAR_OFFSET = 1000

function log(verbose: boolean, msg: string) {
  if (verbose) console.log(chalk.dim(msg))
}

const command = new Command('dev')
  .option('--port <port>', 'dev server port', String(DEFAULT_DEV_PORT))
  .option('--tunnel', 'expose via Cloudflare tunnel (prints QR)')
  .option('--qr', 'print QR code for LAN access')
  .option('--verbose', 'print commands and timing')
  .description('Start dev server with hot reload on device/emulator')
  .action(async (opts) => {
    const verbose: boolean = !!opts.verbose
    const projectRoot = process.cwd()
    const config = await loadConfig(projectRoot)

    const port =
      opts.port !== String(DEFAULT_DEV_PORT)
        ? parseInt(opts.port)
        : (config.devPort ?? DEFAULT_DEV_PORT)
    const sidecarPort = port + SIDECAR_OFFSET

    // ── Route sidecar ─────────────────────────────────────────────────────────
    const sidecar = startRouteServer(projectRoot, sidecarPort)
    console.log(
      chalk.green(`Route sidecar on :${sidecarPort}`) +
        chalk.dim('  (/_capsule/rpc · /api/* · /__capsule.js)')
    )

    // ── adb reverse ──────────────────────────────────────────────────────────
    try {
      log(verbose, `  $ adb reverse tcp:${port} tcp:${port}`)
      await execa('adb', ['reverse', `tcp:${port}`, `tcp:${port}`])
      await execa('adb', ['reverse', `tcp:${sidecarPort}`, `tcp:${sidecarPort}`])
      console.log(chalk.green(`adb reverse OK`) + chalk.dim(` (ports ${port}, ${sidecarPort})`))
    } catch {
      console.warn(
        chalk.yellow('adb reverse failed — emulator may not connect. Is an emulator running?')
      )
    }

    // ── tunnel / QR ──────────────────────────────────────────────────────────
    if (opts.tunnel) {
      const tunnel = execa('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
        stderr: 'pipe',
      })

      tunnel.stderr?.on('data', (chunk: Buffer) => {
        const line = chunk.toString()
        const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
        if (match) {
          const url = match[0]
          console.log(chalk.green('\nTunnel ready:'), url)
          if (opts.qr || opts.tunnel) printQr(url)
        }
      })
    } else if (opts.qr) {
      const { networkInterfaces } = await import('node:os')
      const ip = Object.values(networkInterfaces())
        .flat()
        .find((i) => i?.family === 'IPv4' && !i.internal)?.address
      if (ip) {
        const url = `http://${ip}:${port}`
        console.log(chalk.green('\nLAN URL:'), url)
        printQr(url)
      }
    }

    // ── dev server ───────────────────────────────────────────────────────────
    let devCmd = config.web?.devCommand
    let extraEnv: Record<string, string> = {}

    if (devCmd) {
      // Non-Vite: generate Angular proxy config if ng serve is the dev command
      if (devCmd.includes('ng serve')) {
        const proxyConfig = {
          '/api': { target: `http://localhost:${sidecarPort}`, secure: false, changeOrigin: true },
          '/_capsule': {
            target: `http://localhost:${sidecarPort}`,
            secure: false,
            changeOrigin: true,
          },
          '/__capsule.js': {
            target: `http://localhost:${sidecarPort}`,
            secure: false,
            changeOrigin: true,
          },
        }
        const capsuleDir = join(projectRoot, '.capsule')
        if (!existsSync(capsuleDir)) mkdirSync(capsuleDir, { recursive: true })
        writeFileSync(join(capsuleDir, 'proxy.json'), JSON.stringify(proxyConfig, null, 2))
        if (!devCmd.includes('--proxy-config')) {
          devCmd = `${devCmd} --proxy-config .capsule/proxy.json`
        }
        log(verbose, `  Generated .capsule/proxy.json → sidecar :${sidecarPort}`)
      } else {
        const { startDevProxy } = await import('../dev-proxy-server.js')
        const bundlerPort = port + 1
        if (devCmd.includes('webpack serve') || devCmd.includes('rspack serve')) {
          devCmd = `${devCmd} --port ${bundlerPort}`
        }
        extraEnv = { CAPSULE_INTERNAL_PORT: String(bundlerPort) }
        startDevProxy(bundlerPort, sidecarPort, port)
        console.log(chalk.green(`Dev proxy on :${port}`) + chalk.dim(` → bundler :${bundlerPort}`))
      }

      log(verbose, `  $ ${devCmd}`)
      const [bin, ...args] = devCmd.split(' ')
      const proc = execa(bin, args, {
        cwd: projectRoot,
        stdout: 'inherit',
        stderr: 'inherit',
        env: { ...process.env, ...extraEnv },
      })
      console.log(chalk.green(`\nDev server running on port ${port}`))
      console.log('Hot reload active — edit files in src/ to see changes\n')
      process.on('SIGINT', () => {
        proc.kill()
        sidecar.close()
        process.exit(0)
      })
      await proc
    } else {
      // Vite: proxy sidecar routes + inject __capsule.js into every HTML page
      const capsuleDevPlugin = {
        name: 'capsule-dev-routes',
        transformIndexHtml(html: string): string {
          return html.replace('</head>', `  <script src="/__capsule.js"></script>\n  </head>`)
        },
      }

      log(verbose, `  $ pnpm exec vite --port ${port} --host`)
      const server = await createServer({
        root: projectRoot,
        server: {
          port,
          host: true,
          strictPort: true,
          // Don't watch generated build dirs. The Android Gradle build writes
          // into .capsule/android/.gradle; if Vite's watcher holds handles there,
          // Gradle's atomic rename of dependencies-accessors fails on Windows
          // ("Could not move temporary workspace to immutable location"), so
          // `capsule dev` and `capsule build android` can't run concurrently.
          watch: { ignored: ['**/.capsule/**', '**/dist/**', '**/.gradle/**'] },
          proxy: {
            '/api': { target: `http://localhost:${sidecarPort}`, changeOrigin: true },
            '/_capsule': { target: `http://localhost:${sidecarPort}`, changeOrigin: true },
            '/__capsule.js': { target: `http://localhost:${sidecarPort}`, changeOrigin: true },
          },
        },
        plugins: [capsuleDevPlugin],
      })
      await server.listen()
      console.log(chalk.green(`\nDev server running on port ${port}`))
      console.log('Hot reload active — edit files in src/ to see changes\n')
      if (verbose) {
        console.log(
          chalk.dim(`  Overlay injected: dev.capsule — tap LOG button on device to view console\n`)
        )
      }
      process.on('SIGINT', () =>
        server.close().then(() => {
          sidecar.close()
          process.exit(0)
        })
      )
    }
  })

async function printQr(url: string) {
  const qrcode = await import('qrcode-terminal')
  qrcode.default.generate(url, { small: true })
}

export default command
