---
title: "Architecture"
audience: contributor
status: current
code:
  - packages/core/src/bridge.ts
  - packages/core/src/web-bridge.ts
  - packages/capsule-android/capsule/src/main/kotlin/dev/capsule/CapsuleActivity.kt
tests:
  - packages/core/src/__tests__/web-bridge.test.ts
---
# Phase 1 — Foundation ✅ Done

> **Goal**: A working `capsule dev` + `capsule build android` + hot reload loop.
> **Status**: ✅ Complete — all Phase 1 deliverables done, 36 TS tests + 24 Kotlin tests passing, app installed on real Samsung device.
>
> By the end of Phase 1, a developer can scaffold a React/Vue/Svelte/Vanilla app, run it on an Android emulator with <50ms hot reload, and build a signed APK.

---

## Phase 1 Deliverables

1. **Monorepo scaffold** — pnpm workspace + Turbo pipeline
2. **`@capsule/cli`** — `init`, `add android`, `sync`, `dev`, `build android`, `run android`
3. **`@capsule/core`** — JS bridge runtime + geolocation API (proof of concept)
4. **`capsule-android`** — Kotlin AAR (Activity + WebView + JS bridge)
5. **Project templates** — `react-ts`, `vue-ts`, `svelte-ts`, `vanilla-ts`

> **Docker images + GitHub CI/CD** are deferred to Phase 8 — Ecosystem. Phase 1 is fully local: real device (Samsung M62) + emulator.

---

## Step 1 — Monorepo Scaffold

### 1.1 Initialize the repo

```bash
# Inside WSL2, in the cloned capsule repo
cd ~/path/to/capsule   # or, from WSL: /mnt/<drive>/path/to/capsule

# Root package.json
pnpm init

# Create workspace config
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'packages/*'
# examples/ is its own pnpm workspace (examples/pnpm-workspace.yaml) — not listed here
EOF
```

### 1.2 Root `package.json`

```json
{
  "name": "capsule",
  "private": true,
  "scripts": {
    "build":     "turbo run build",
    "test":      "turbo run test",
    "typecheck": "turbo run typecheck",
    "lint":      "turbo run lint",
    "clean":     "turbo run clean"
  },
  "devDependencies": {
    "turbo":      "^2.0.0",
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0",
    "eslint":     "^9.0.0",
    "prettier":   "^3.0.0"
  }
}
```

### 1.3 `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "clean": {
      "cache": false
    }
  }
}
```

### 1.4 `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target":        "ES2022",
    "module":        "NodeNext",
    "moduleResolution": "NodeNext",
    "strict":        true,
    "declaration":   true,
    "declarationMap": true,
    "sourceMap":     true,
    "esModuleInterop": true,
    "skipLibCheck":  true
  }
}
```

### 1.5 Changesets (version management)

Capsule is a multi-package monorepo publishing to npm. Changesets coordinates version bumps across packages — when `@capsule/core` releases a new version, `@capsule/cli` (which depends on it) gets bumped correctly.

```bash
pnpm add -D -w @changesets/cli
pnpm changeset init
```

This creates `.changeset/config.json`. Commit the `.changeset/` directory. Usage:

```bash
# When you make a change that should ship:
pnpm changeset          # prompts: which packages? what bump? write a summary
# Commit the generated .changeset/*.md file with your code change

# To release:
pnpm changeset version  # bumps package.json versions + updates CHANGELOG.md
pnpm changeset publish  # publishes all bumped packages to npm
```

> **Phase 1**: Run `pnpm changeset init` during monorepo setup. No need to publish to npm yet — Phase 2 handles the first release. But record changes with `pnpm changeset` from day one so the CHANGELOG is accurate at first publish.

### 1.6 Create package directories

```bash
mkdir -p packages/cli/src
mkdir -p packages/core/src
mkdir -p packages/capsule-android  # Kotlin project — see Step 4
mkdir -p examples   # demo apps — their own pnpm workspace (examples/pnpm-workspace.yaml)
```

---

## Step 2 — `@capsule/core`

Build this first — the CLI imports its types.

### 2.1 Package setup

```bash
cd packages/core
pnpm init
```

`packages/core/package.json`:

```json
{
  "name": "@capsule/core",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types":   "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build":     "tsup",
    "typecheck": "tsc --noEmit",
    "test":      "vitest run"
  },
  "devDependencies": {
    "tsup":      "^8.0.0",
    "vitest":    "^2.0.0",
    "typescript": "*"
  }
}
```

### 2.2 Bridge protocol (`src/bridge.ts`)

Implements the JSON-RPC 2.0 bridge from `../project/known-issues.md` Issue 2.

```typescript
// packages/core/src/bridge.ts

type JsonRpcRequest = {
  jsonrpc: '2.0'
  id: string
  method: string
  params?: unknown
}

type JsonRpcSuccess = {
  jsonrpc: '2.0'
  id: string
  result: unknown
}

type JsonRpcError = {
  jsonrpc: '2.0'
  id: string
  error: { code: number; message: string; data?: unknown }
}

type JsonRpcNotification = {
  jsonrpc: '2.0'
  method: string
  params?: unknown
  // no id field — distinguishes notifications from responses
}

declare const __capsule_host: {
  postMessage: (json: string) => void
}

type ResponseHandler = (response: JsonRpcSuccess | JsonRpcError) => void
type NotificationHandler = (params: unknown) => void

class CapsuleBridge {
  private pendingRequests = new Map<string, ResponseHandler>()
  private notificationHandlers = new Map<string, Set<NotificationHandler>>()
  private requestCounter = 0
  private isNative = typeof __capsule_host !== 'undefined'

  constructor() {
    // Native layer calls this for all inbound messages (responses + notifications)
    ;(window as any).__capsuleReceive = (json: string) => {
      this.handleMessage(json)
    }
  }

  call<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.isNative) {
      return Promise.reject(new CapsuleError(1001, 'BRIDGE_UNAVAILABLE',
        'Not running in a Capsule native shell'))
    }

    return new Promise<T>((resolve, reject) => {
      const id = `capsule-${++this.requestCounter}-${Date.now()}`
      const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }

      this.pendingRequests.set(id, (response) => {
        if ('error' in response) {
          reject(new CapsuleError(response.error.code, response.error.message, response.error.data))
        } else {
          resolve(response.result as T)
        }
      })

      __capsule_host.postMessage(JSON.stringify(request))
    })
  }

  on(method: string, handler: NotificationHandler): () => void {
    if (!this.notificationHandlers.has(method)) {
      this.notificationHandlers.set(method, new Set())
    }
    this.notificationHandlers.get(method)!.add(handler)

    // Return unsubscribe function
    return () => {
      this.notificationHandlers.get(method)?.delete(handler)
    }
  }

  private handleMessage(json: string) {
    let msg: JsonRpcSuccess | JsonRpcError | JsonRpcNotification

    try {
      msg = JSON.parse(json)
    } catch {
      console.error('[Capsule] Failed to parse bridge message:', json)
      return
    }

    if (!('id' in msg)) {
      // Notification — no id field
      const notification = msg as JsonRpcNotification
      this.notificationHandlers.get(notification.method)?.forEach(h => h(notification.params))
      return
    }

    const handler = this.pendingRequests.get(msg.id)
    if (handler) {
      this.pendingRequests.delete(msg.id)
      handler(msg as JsonRpcSuccess | JsonRpcError)
    }
  }
}

export class CapsuleError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown
  ) {
    super(message)
    this.name = 'CapsuleError'
  }
}

// Singleton bridge — instantiated once per page
export const bridge = new CapsuleBridge()
```

### 2.3 Geolocation API (`src/geolocation.ts`)

First real capability — proves the bridge works end-to-end.

```typescript
// packages/core/src/geolocation.ts
import { bridge } from './bridge.js'

export interface GeolocationPosition {
  coords: {
    latitude: number
    longitude: number
    accuracy: number
    altitude: number | null
    altitudeAccuracy: number | null
    heading: number | null
    speed: number | null
  }
  timestamp: number
}

export interface GeolocationOptions {
  enableHighAccuracy?: boolean
  timeout?: number
  maximumAge?: number
}

export const geolocation = {
  async getCurrentPosition(options?: GeolocationOptions): Promise<GeolocationPosition> {
    return bridge.call<GeolocationPosition>('geolocation.getCurrentPosition', options ?? {})
  },

  watchPosition(
    callback: (position: GeolocationPosition) => void,
    options?: GeolocationOptions
  ): () => void {
    // Returns unsubscribe function
    const unsub = bridge.on('geolocation.positionUpdate', (params) => {
      callback(params as GeolocationPosition)
    })

    bridge.call('geolocation.watchPosition', options ?? {}).catch(() => unsub())

    return () => {
      unsub()
      bridge.call('geolocation.clearWatch', {}).catch(() => {})
    }
  }
}
```

### 2.4 Entry point (`src/index.ts`)

```typescript
// packages/core/src/index.ts
// Phase 1 — all 6 APIs implemented ✅
export { bridge, CapsuleError } from './bridge.js'
export { geolocation } from './geolocation.js'
export type { GeolocationPosition, GeolocationOptions } from './geolocation.js'
export { camera } from './camera.js'
export { haptics } from './haptics.js'
export { push } from './push.js'
export { biometrics } from './biometrics.js'
export { alerts } from './alerts.js'

// Phase 2: QuickJSBridge — same @capsule/core API works inside server route handlers
// The four Bridge implementations are: CapsuleBridge ✅, WebBridge ✅, FakeBridge ✅, QuickJSBridge ⬜
```

### 2.5 `tsup.config.ts`

```typescript
// packages/core/tsup.config.ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  treeshake: true,
  target: 'es2020',
  platform: 'browser',
})
```

---

## Step 3 — `@capsule/cli`

The CLI is the backbone. Build only the Phase 1 commands: `init`, `add`, `sync`, `dev`, `build android`, `run android`.

### 3.1 Package setup

```bash
cd packages/cli
pnpm init
```

`packages/cli/package.json`:

```json
{
  "name": "@capsule/cli",
  "version": "0.1.0",
  "bin": {
    "capsule": "./dist/index.js"
  },
  "scripts": {
    "build":     "tsup",
    "typecheck": "tsc --noEmit",
    "test":      "vitest run"
  },
  "dependencies": {
    "@capsule/core":    "workspace:*",
    "vite":            "^6.0.0",
    "jiti":            "^2.0.0",
    "semver":          "^7.6.0",
    "js-yaml":         "^4.1.0",
    "commander":       "^12.0.0",
    "prompts":         "^2.4.2",
    "chalk":           "^5.3.0",
    "ora":             "^8.0.0",
    "execa":           "^9.0.0",
    "fs-extra":        "^11.2.0",
    "qrcode-terminal": "^0.12.0"
  },
  "devDependencies": {
    "tsup":         "^8.0.0",
    "vitest":       "^2.0.0",
    "typescript":   "*",
    "@types/semver": "*",
    "@types/js-yaml": "*",
    "@types/fs-extra": "*",
    "@types/prompts": "*"
  }
}
```

### 3.2 CLI entry point (`src/index.ts`)

```typescript
#!/usr/bin/env node
// packages/cli/src/index.ts
import { program } from 'commander'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const { version } = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf8')
)

program
  .name('capsule')
  .description('Capsule CLI — app ships inside a managed native capsule')
  .version(version)

// Phase 1 commands
program.addCommand((await import('./commands/init.js')).default)
program.addCommand((await import('./commands/add.js')).default)
program.addCommand((await import('./commands/sync.js')).default)
program.addCommand((await import('./commands/dev.js')).default)
program.addCommand((await import('./commands/build.js')).default)
program.addCommand((await import('./commands/run.js')).default)
program.addCommand((await import('./commands/doctor.js')).default)

program.parse()
```

### 3.3 Config loading (`src/config.ts`)

```typescript
// packages/cli/src/config.ts
import { createJiti } from 'jiti'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

export interface CapsuleConfig {
  appId:   string
  appName: string
  version: {
    name:        string
    buildNumber: number
  }
  android?: {
    minSdk:     number
    targetSdk:  number
    compileSdk: number
    permissions?: string[]
    signing?: {
      storeFile?:     string
      storePassword?: string
      keyAlias?:      string
      keyPassword?:   string
    }
    gradleOverrides?: Record<string, unknown>
  }
  ios?: {
    deployment?: string
    bundleId?:   string
  }
  plugins?: Array<string | { path: string; trust?: string; overrides?: string }>
  codeSync?: {
    enabled:          boolean
    url?:             string
    apiKey?:          string
    channel?:         string
    strategy?:        'background' | 'immediate' | 'on-next-launch'
    checkOnForeground?: boolean
    mandatory?:       boolean
  }
  web?: {
    mobileReset?: boolean
  }
}

export function defineConfig(config: CapsuleConfig): CapsuleConfig {
  return config
}

export async function loadConfig(projectRoot: string): Promise<CapsuleConfig> {
  const configPath = join(projectRoot, 'capsule.config.ts')

  if (!existsSync(configPath)) {
    throw new Error(`capsule.config.ts not found in ${projectRoot}`)
  }

  const jiti = createJiti(projectRoot, { interopDefault: true })
  const mod = await jiti.import(configPath) as { default: CapsuleConfig }

  return mod.default
}
```

### 3.4 `capsule init` command

```typescript
// packages/cli/src/commands/init.ts
import { Command } from 'commander'
import prompts from 'prompts'
import chalk from 'chalk'
import ora from 'ora'
import { copySync, writeFileSync, ensureDirSync } from 'fs-extra'
import { join } from 'node:path'
import { execaSync } from 'execa'

const command = new Command('init')
  .argument('[name]', 'project directory name')
  .option('--template <template>', 'react-ts | vue-ts | svelte-ts | vanilla-ts', 'react-ts')
  .option('--app-id <appId>', 'reverse-domain app ID (e.g. com.yourcompany.app)')
  .description('Scaffold a new Capsule project')
  .action(async (name: string | undefined, opts) => {
    // Interactive prompts if args not provided
    const answers = await prompts([
      {
        type: name ? null : 'text',
        name: 'name',
        message: 'Project name',
        initial: 'my-app'
      },
      {
        type: opts.appId ? null : 'text',
        name: 'appId',
        message: 'App ID (reverse-domain)',
        initial: 'com.example.myapp'
      },
      {
        type: opts.template ? null : 'select',
        name: 'template',
        message: 'Template',
        choices: [
          { title: 'React + TypeScript', value: 'react-ts' },
          { title: 'Vue + TypeScript',   value: 'vue-ts' },
          { title: 'Svelte + TypeScript', value: 'svelte-ts' },
          { title: 'Vanilla TypeScript', value: 'vanilla-ts' },
        ]
      }
    ])

    const projectName = name ?? answers.name
    const appId = opts.appId ?? answers.appId
    const template = opts.template ?? answers.template

    const spinner = ora(`Creating ${projectName}...`).start()

    // Copy template files
    const templateDir = join(__dirname, '../../templates', template)
    const projectDir = join(process.cwd(), projectName)

    ensureDirSync(projectDir)
    copySync(templateDir, projectDir)

    // Write capsule.config.ts
    writeFileSync(join(projectDir, 'capsule.config.ts'), generateConfig(appId, projectName))

    // Write capsule.lock (empty — will be populated by capsule sync)
    writeFileSync(join(projectDir, 'capsule.lock'), generateInitialLock())

    // Write .gitignore
    writeFileSync(join(projectDir, '.gitignore'), GITIGNORE)

    spinner.text = 'Installing dependencies...'
    execaSync('pnpm', ['install'], { cwd: projectDir })

    spinner.succeed(chalk.green(`Created ${projectName}`))

    console.log(`
  ${chalk.bold('Next steps:')}
    ${chalk.cyan(`cd ${projectName}`)}
    ${chalk.cyan('capsule add android')}
    ${chalk.cyan('capsule dev')}
`)
  })

function generateConfig(appId: string, appName: string): string {
  return `import { defineConfig } from '@capsule/cli'

export default defineConfig({
  appId:   '${appId}',
  appName: '${appName}',

  version: {
    name:        '1.0.0',
    buildNumber: 1
  },

  android: {
    minSdk:     26,
    targetSdk:  35,
    compileSdk: 35,
  }
})
`
}

function generateInitialLock(): string {
  return `# capsule.lock
# Generated by @capsule/cli. Do not edit manually.
# Regenerate with: capsule sync
lockfileVersion: 1
# Run 'capsule add android' then 'capsule sync' to populate this file.
`
}

const GITIGNORE = `# Dependencies
node_modules/

# Generated by capsule — do not commit
.capsule/

# Build output
dist/

# Environment variables
.env
.env.local
*.env

# Logs
*.log
`

export default command
```

### 3.5 `capsule sync` — the core generator

This command reads `capsule.config.ts` + `capsule.lock` and generates `.capsule/android/` (a thin Gradle project wrapper).

Key files generated inside `.capsule/android/`:
- `settings.gradle.kts` — includes the AAR dependency
- `build.gradle.kts` — app module config derived from `capsule.config.ts`
- `AndroidManifest.xml` — generated from `appId` + `permissions`
- `app/src/main/res/values/strings.xml` — `appName`

This is the core of Capsule's promise — developers never edit these files.

See [cli.md § capsule sync](../reference/cli.md#capsule-sync) for what `capsule sync` generates; the generator itself is `packages/cli/src/sync/sync.ts`.

### 3.6 `capsule dev` — dev server

```
1. Load capsule.config.ts
2. Detect connected devices/emulators (adb devices)
3. Spawn Vite dev server (port 5173 by default)
4. Run: adb reverse tcp:5173 tcp:5173
5. Print: "Ready — app loading on emulator"
6. Watch for Ctrl+C → cleanup
```

If `--tunnel`: use `cloudflared tunnel --url http://localhost:5173` and print the HTTPS URL + QR code.

### 3.7 `capsule build android`

```
1. Load capsule.config.ts + capsule.lock
2. Run capsule sync (ensure .capsule/ is up to date)
3. Run: vite build → dist/
4. Copy dist/ → .capsule/android/app/src/main/assets/www/
5. Run: ./gradlew assembleDebug   (or bundleRelease / assembleRelease with --release)
6. Output: .capsule/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Step 4 — Android Shell (Kotlin AAR)

This is the core investment. The Kotlin library that hosts the WebView and implements the JS bridge.

### 4.1 Project setup

```bash
# packages/capsule-android/ — standard Android library project
# Use Android Studio to create a new Android Library module, or:

mkdir -p packages/capsule-android/capsule/src/main/kotlin/dev/capsule
mkdir -p packages/capsule-android/capsule/src/main/res/layout
mkdir -p packages/capsule-android/capsule/src/test/kotlin/dev/capsule
```

### 4.2 `packages/capsule-android/capsule/build.gradle.kts`

```kotlin
plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
    `maven-publish`   // for publishing to Maven / GHCR Packages
}

android {
    namespace   = "dev.capsule"
    compileSdk  = 35

    defaultConfig {
        minSdk = 21   // supports Android 5.0+ (shell minSdk floor)
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false  // consumers run R8, not the library
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.play.services.location)   // required by GeolocationHandler (FusedLocationProviderClient)
    testImplementation(libs.junit)
}
```

### 4.3 `CapsuleActivity.kt` — single entry point

```kotlin
// packages/capsule-android/capsule/src/main/kotlin/dev/capsule/CapsuleActivity.kt
package dev.capsule

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.View
import android.webkit.*
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

open class CapsuleActivity : AppCompatActivity() {

    protected lateinit var webView: WebView
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    // Override in generated .capsule/android/ wrapper to configure the shell
    open val capsuleConfig: CapsuleShellConfig
        get() = CapsuleShellConfig()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).also { wv ->
            wv.settings.apply {
                javaScriptEnabled        = true
                domStorageEnabled        = true
                allowFileAccess          = true
                allowContentAccess       = true
                mediaPlaybackRequiresUserGesture = false
                mixedContentMode         = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            }

            // Register the JS bridge
            wv.addJavascriptInterface(
                CapsuleBridge(this, scope, capsuleConfig),
                "__capsule_host"
            )

            wv.webViewClient = CapsuleWebViewClient()
            wv.webChromeClient = CapsuleWebChromeClient()

            setContentView(wv)
        }

        loadApp()

        // OnBackPressedDispatcher — replaces deprecated onBackPressed() (API 33+)
        onBackPressedDispatcher.addCallback(this) {
            if (webView.canGoBack()) webView.goBack()
            else isEnabled = false  // let system handle (closes activity)
        }
    }

    private fun loadApp() {
        val url = if (BuildConfig.DEBUG && capsuleConfig.devServerUrl != null) {
            capsuleConfig.devServerUrl!!    // e.g. http://10.0.2.2:5173
        } else {
            // Phase 2: CapsuleRuntime delegates here after the embedded server is bound:
            // "http://127.0.0.1:${capsuleConfig.port}/"
            // Phase 1 fallback: serve from bundled assets (file:// semantics; adequate for Phase 1)
            "file:///android_asset/www/index.html"
        }
        webView.loadUrl(url)
    }

    // Phase 2: CapsuleActivity becomes a thin shell that delegates to CapsuleRuntime:
    //
    //   override fun onCreate(savedInstanceState: Bundle?) {
    //       super.onCreate(savedInstanceState)
    //       runtime = CapsuleRuntime(bridge, server, jsRuntime, splash, codeSync)
    //       runtime.start(webView)
    //   }
    //
    // CapsuleRuntime owns the startup sequence: splash → embedded-server bind → QuickJS evaluate
    // → WebView navigate to http://127.0.0.1:{port}/. See 0001-embedded-runtime.md.

}
```

### 4.4 `CapsuleBridge.kt` — JSON-RPC 2.0 dispatcher

```kotlin
// packages/capsule-android/capsule/src/main/kotlin/dev/capsule/CapsuleBridge.kt
package dev.capsule

import android.content.Context
import android.webkit.JavascriptInterface
import android.webkit.WebView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*

class CapsuleBridge(
    private val context: Context,
    private val scope: CoroutineScope,
    private val config: CapsuleShellConfig
) {
    // Registry-based dispatch — enables capsule override command
    // Built-in handlers are registered first; overrides register on top
    internal val handlers = mutableMapOf<String, BridgeHandler>()
    private lateinit var webView: WebView

    init {
        registerBuiltIns()
    }

    fun attachWebView(wv: WebView) { webView = wv }

    @JavascriptInterface
    fun postMessage(json: String) {
        scope.launch {
            try {
                val request = Json.parseToJsonElement(json).jsonObject

                val id     = request["id"]?.jsonPrimitive?.content
                val method = request["method"]?.jsonPrimitive?.content
                    ?: return@launch sendError(null, 1001, "METHOD_MISSING")
                val params = request["params"] ?: JsonObject(emptyMap())

                val handler = handlers[method]
                    ?: return@launch sendError(id, 1002, "METHOD_NOT_FOUND",
                        "Unknown method: $method")

                try {
                    val result = handler.handle(params)
                    if (id != null) sendResult(id, result)
                } catch (e: CapsuleException) {
                    sendError(id, e.code, e.bridgeMessage, e.data)
                } catch (e: Exception) {
                    sendError(id, 1000, "INTERNAL_ERROR", e.message)
                }

            } catch (e: Exception) {
                sendError(null, 1000, "PARSE_ERROR", "Failed to parse message")
            }
        }
    }

    private fun registerBuiltIns() {
        // Phase 1: 6 built-in handlers (geolocation, camera, haptics, push, biometrics, alerts)
        GeolocationHandler(context).register(handlers)
        // Phase 4: NFC, Bluetooth, filesystem, SQLite db, background jobs
        // Phase 2: QuickJSBridge — server-side @capsule/core calls inside QuickJS
    }

    private fun sendResult(id: String, result: JsonElement) {
        val response = buildJsonObject {
            put("jsonrpc", "2.0")
            put("id", id)
            put("result", result)
        }.toString()
        dispatchToWebView(response)
    }

    private fun sendError(id: String?, code: Int, message: String, data: Any? = null) {
        val response = buildJsonObject {
            put("jsonrpc", "2.0")
            if (id != null) put("id", id) else put("id", JsonNull)
            putJsonObject("error") {
                put("code", code)
                put("message", message)
                if (data != null) put("data", data.toString())
            }
        }.toString()
        dispatchToWebView(response)
    }

    // Send a notification (event) to the web layer — no id field
    fun sendNotification(method: String, params: JsonElement) {
        val notification = buildJsonObject {
            put("jsonrpc", "2.0")
            put("method", method)
            put("params", params)
        }.toString()
        dispatchToWebView(notification)
    }

    private fun dispatchToWebView(json: String) {
        webView.post {
            // Use JSON.parse to avoid string injection — pass as a data URI argument
            webView.evaluateJavascript(
                "window.__capsuleReceive(${Json.encodeToString(json)})",
                null
            )
        }
    }
}

interface BridgeHandler {
    val method: String
    suspend fun handle(params: JsonElement): JsonElement
    fun register(registry: MutableMap<String, BridgeHandler>) {
        registry[method] = this
    }
}

class CapsuleException(
    val code: Int,
    val bridgeMessage: String,
    val data: Any? = null
) : Exception(bridgeMessage)
```

### 4.5 `GeolocationHandler.kt`

> Requires `com.google.android.gms:play-services-location` in the shell's `libs.versions.toml`. Add `implementation(libs.play.services.location)` to `build.gradle.kts` — already included in Step 4.2 above.

```kotlin
// packages/capsule-android/capsule/src/main/kotlin/dev/capsule/handlers/GeolocationHandler.kt
package dev.capsule.handlers

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import dev.capsule.BridgeHandler
import dev.capsule.CapsuleException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.json.*
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class GeolocationHandler(private val context: Context) : BridgeHandler {
    override val method = "geolocation.getCurrentPosition"

    override suspend fun handle(params: JsonElement): JsonElement {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED) {
            throw CapsuleException(2001, "PERMISSION_DENIED",
                mapOf("permission" to "ACCESS_FINE_LOCATION"))
        }

        val location = getLastLocation()
            ?: throw CapsuleException(3001, "LOCATION_UNAVAILABLE")

        return buildJsonObject {
            putJsonObject("coords") {
                put("latitude",         location.latitude)
                put("longitude",        location.longitude)
                put("accuracy",         location.accuracy.toDouble())
                put("altitude",         if (location.hasAltitude()) location.altitude else JsonNull)
                put("altitudeAccuracy", JsonNull)
                put("heading",          if (location.hasBearing()) location.bearing.toDouble() else JsonNull)
                put("speed",            if (location.hasSpeed()) location.speed.toDouble() else JsonNull)
            }
            put("timestamp", location.time)
        }
    }

    private suspend fun getLastLocation(): Location? = suspendCancellableCoroutine { cont ->
        LocationServices.getFusedLocationProviderClient(context)
            .lastLocation
            .addOnSuccessListener { location -> cont.resume(location) }
            .addOnFailureListener { e -> cont.resumeWithException(e) }
    }
}
```

### 4.6 Using the AAR Locally (Phase 1)

During Phase 1 you consume the AAR via the `CAPSULE_SHELL_OVERRIDE_PATH` env var — no GitHub release needed.

```bash
# Build the AAR locally
cd packages/capsule-android
./gradlew assembleDebug

# Point the CLI at it
export CAPSULE_SHELL_OVERRIDE_PATH=/path/to/capsule-android/capsule/build/outputs/aar/capsule-debug.aar
```

Publishing to GitHub Packages / GitHub Releases is Phase 8 (Ecosystem).

---

## Step 5 — Project Templates

Each template lives in `packages/cli/templates/<name>/`. Minimal Vite apps that import `@capsule/core`.

### `templates/react-ts/`

```
templates/react-ts/
  src/
    index.html
    main.tsx
    App.tsx
  public/
  vite.config.ts
  tsconfig.json
  package.json    ← @capsule/core as dep, vite as devDep
```

`vite.config.ts` in the template:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    host: true   // listen on all interfaces — required for LAN access
  }
})
```

`App.tsx` starter showing a live GPS coordinate:
```tsx
import { useState, useEffect } from 'react'
import { geolocation } from '@capsule/core'

export default function App() {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    geolocation.getCurrentPosition()
      .then(p => setPosition({ lat: p.coords.latitude, lng: p.coords.longitude }))
      .catch(console.error)
  }, [])

  return (
    <div style={{ padding: 24 }}>
      <h1>Capsule App</h1>
      {position
        ? <p>📍 {position.lat.toFixed(4)}, {position.lng.toFixed(4)}</p>
        : <p>Getting location...</p>
      }
    </div>
  )
}
```

---

## Step 6 — Docker Images *(Phase 8)*

> Deferred to Phase 8 — Ecosystem. See `docker.md` for the planned Dockerfiles.
> During Phase 1, builds run directly on your Windows 11 + WSL2 machine — no Docker required.

---

## Step 7 — GitHub Actions CI *(Phase 8)*

> Deferred to Phase 8 — Ecosystem. CI workflows (`ci.yml`, `release.yml`) will be added after the local MVP is running end-to-end on your real device and emulator.

---

## Step 8 — Local Development Shell Override

Before publishing a real release, you need to test the Kotlin AAR you're building locally. Add this to the CLI:

```typescript
// packages/cli/src/sync/resolve-shell.ts

// If CAPSULE_SHELL_OVERRIDE_PATH is set, use that AAR directly
// instead of resolving from GitHub Releases.
// For use during Capsule framework development only.
const override = process.env.CAPSULE_SHELL_OVERRIDE_PATH
if (override) {
  console.warn('[capsule] Using local shell override:', override)
  return { aarPath: override, version: 'local', sha256: 'override' }
}

// Normal path: resolve from GitHub Releases
```

Usage during development:

```bash
# Build the AAR locally
cd packages/capsule-android
./gradlew assembleDebug

# Point the CLI at it
export CAPSULE_SHELL_OVERRIDE_PATH=/path/to/capsule-android/capsule/build/outputs/aar/capsule-debug.aar

# Test
cd examples/react-ts
capsule sync && capsule dev
```

---

## Phase 1 Completion Checklist

```
Monorepo
[ ] pnpm workspace + Turbo configured
[ ] tsconfig.base.json shared
[ ] ESLint + Prettier configured at root

@capsule/core
[ ] Bridge (JSON-RPC 2.0) — send/receive, notifications, cancellation
[ ] CapsuleError class with code registry
[ ] geolocation.getCurrentPosition works end-to-end
[ ] tsup builds ESM + CJS + types

@capsule/cli
[ ] capsule init — scaffolds project, installs deps
[ ] capsule add android — generates .capsule/android/ wrapper
[ ] capsule sync — regenerates wrapper from capsule.config.ts + capsule.lock
[ ] capsule sync --frozen-lockfile — fails if lock stale
[ ] capsule dev — starts Vite, adb reverse, hot reload <50ms
[ ] capsule dev --tunnel — Cloudflare tunnel + QR code
[ ] capsule build android — debug APK
[ ] capsule build android --release — signed APK (debug keystore)
[ ] capsule run android — installs APK to emulator
[ ] capsule doctor — checks all tool versions
[ ] CAPSULE_SHELL_OVERRIDE_PATH env var works

capsule-android (Kotlin AAR)
[x] CapsuleActivity + WebView + back button + keyboard
[x] CapsuleBridge JSON-RPC 2.0 dispatcher
[x] Registry-based handler dispatch (enables capsule override)
[x] GeolocationHandler working
[x] 5 additional handlers (camera, haptics, push, biometrics, alerts)
[x] WebBridge — all 6 APIs work in browser dev mode
[x] Dev mode loads from dev server URL
[ ] Prod mode: Phase 2 — the embedded server (CivetWeb) serves from http://127.0.0.1:{port}/ (Phase 1: file:///android_asset/www/)
[ ] AAR publishable to Maven / GitHub Packages (Phase 8)

Templates
[ ] react-ts — builds, runs in emulator, hot reloads, GPS shown
[ ] vue-ts
[ ] svelte-ts
[ ] vanilla-ts

End-to-end test
[ ] capsule init my-app --template react-ts
[ ] capsule add android
[ ] capsule dev — app loads in emulator
[ ] Edit App.tsx — hot reload in <50ms
[ ] capsule build android — app-debug.apk produced
[ ] capsule run android — APK installed and running
[ ] GPS reads a location from the emulator
```

---

## Test Plan

Tests are **not optional** for a framework — every shipped API is a long-term contract.

### Unit tests (`vitest`)

**`@capsule/core`** — `packages/core/src/__tests__/`

| Test file | What it covers |
|-----------|----------------|
| `bridge.test.ts` | `call()` resolves on JSON-RPC success response; rejects on error response; rejects with `1001 BRIDGE_UNAVAILABLE` when `window.__capsule_host` is absent; `on()` routes notifications to the right handler; unsubscribe clears the handler |
| `geolocation.test.ts` | `getCurrentPosition()` calls `bridge.call('geolocation.getCurrentPosition', ...)` and forwards the result; propagates `CapsuleError` on reject |

Bridge unit tests mock `window.__capsule_host` and call `window.__capsuleReceive(json)` to simulate native responses. No actual native layer required.

**`@capsule/cli`** — `packages/cli/src/__tests__/`

| Test file | What it covers |
|-----------|----------------|
| `config.test.ts` | `loadConfig()` parses a valid `capsule.config.ts`; throws on missing file; throws on invalid schema |
| `sync.test.ts` | Generated `AndroidManifest.xml` contains correct `appId`; generated `build.gradle.kts` has correct `minSdk`/`targetSdk`; `--frozen-lockfile` throws when lock is stale |
| `resolve-shell.test.ts` | `CAPSULE_SHELL_OVERRIDE_PATH` returns the local path; warns to stderr |

CLI tests mock `fs-extra` and `execa`. No file system writes or process spawns.

### Instrumented tests (Android) — `packages/capsule-android/capsule/src/androidTest/`

| Test | What it covers |
|------|----------------|
| `BridgeDispatchTest.kt` | Valid JSON-RPC request → correct handler called; unknown method → error 1002; malformed JSON → error 1000 |
| `GeolocationHandlerTest.kt` | Permission denied → error 2001; location returned → correct JSON shape |

Run with: `./gradlew connectedAndroidTest` against emulator.

### E2E validation (manual, Phase 1)

The Phase 1 Completion Checklist above is the E2E test suite. Run it top-to-bottom on the emulator and on the real Samsung M62 before declaring Phase 1 done.

---

### MurmurHash3 cross-platform note *(record here for Phase 4)*

The rollout cohort hash (`codesync-internals.md`) must produce identical results in TypeScript (`murmurhash3js-revisited`) and Kotlin (`com.google.common.hash.Hashing.murmur3_32_fixed`). Before Phase 4, create a reference test vector file (`test/hash-vectors.json`) with ≥20 `{deviceId, seed, expected}` tuples and run it against both implementations in CI. Pin exact library versions. Mismatches silently bucket users into the wrong cohort.

---

## Next Phase

Phase 1 is complete. Next up:

→ See [roadmap.md](../project/roadmap.md) for Phase 2 (Embedded Runtime — embedded HTTP server + QuickJS + CapsuleRuntime).

Phase 2 entry point: `CapsuleRuntime` coordinator + interfaces + fakes (Step 1 in the roadmap).
See `0001-embedded-runtime.md` for full Phase 2 architecture and the 7-step implementation plan.
