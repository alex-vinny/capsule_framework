// Docs: docs/reference/cli.md
import fsExtra from 'fs-extra'
const { ensureDirSync, writeFileSync, copySync, removeSync } = fsExtra
import { join, dirname } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execa } from 'execa'
import { DEFAULT_DEV_PORT, loadConfig, CapsuleConfig } from '../config.js'
import { resolveShell } from './resolve-shell.js'
import { ANDROID_TOOLCHAIN, type AndroidToolchain } from '../platform/android-toolchain.js'

interface CapsuleLock {
  capsuleVersion: string
  shell: {
    platform: 'android'
    aarHash: string
  }
  configHash: string
}

function hashFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function hashConfig(config: CapsuleConfig): string {
  return createHash('sha256').update(JSON.stringify(config)).digest('hex')
}

// Walk up from the AAR path looking for a dir that contains gradlew.bat
// e.g. .../capsule-android/capsule/build/outputs/aar/capsule-debug.aar
//   → .../capsule-android/ (4 levels up)
function resolveShellProjectRoot(aarPath: string): string | null {
  let dir = dirname(aarPath)
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'gradlew.bat')) || existsSync(join(dir, 'gradlew'))) return dir
    dir = dirname(dir)
  }
  return null
}

export interface SyncOptions {
  frozenLockfile?: boolean
}

export async function syncProject(projectRoot: string, opts: SyncOptions = {}) {
  const lockPath = join(projectRoot, 'capsule.lock')
  const config = await loadConfig(projectRoot)
  const shell = await resolveShell('local')

  if (opts.frozenLockfile) {
    if (!existsSync(lockPath)) {
      throw new Error('--frozen-lockfile: capsule.lock not found. Run `capsule sync` first.')
    }
    const lock: CapsuleLock = JSON.parse(readFileSync(lockPath, 'utf8'))
    const errors: string[] = []

    if (lock.shell.aarHash !== hashFile(shell.aarPath)) {
      errors.push('shell AAR has changed')
    }
    if (lock.configHash !== hashConfig(config)) {
      errors.push('capsule.config.ts has changed')
    }
    if (errors.length > 0) {
      throw new Error(
        `--frozen-lockfile: .capsule/ is out of date:\n${errors.map((e) => `  - ${e}`).join('\n')}\n\nRun \`capsule sync\` to update.`
      )
    }
    console.log('[capsule] Lock file verified — .capsule/ is up to date.')
    return
  }

  if (config.android) {
    await syncAndroid(projectRoot, config, shell.aarPath)
  }
  // Phase 2: if (config.ios) await syncIos(projectRoot, config)

  const lock: CapsuleLock = {
    capsuleVersion: '0.1.0',
    shell: {
      platform: 'android',
      aarHash: hashFile(shell.aarPath),
    },
    configHash: hashConfig(config),
  }
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n')
  console.log('[capsule] capsule.lock updated.')
}

async function syncAndroid(projectRoot: string, config: CapsuleConfig, aarPath: string) {
  const outDir = join(projectRoot, '.capsule', 'android')

  // Remove only generated source/config — never touch build/ (Gradle daemon holds locks on .dex)
  removeSync(join(outDir, 'app', 'src'))
  removeSync(join(outDir, 'app', 'build.gradle.kts'))
  removeSync(join(outDir, 'build.gradle.kts'))
  removeSync(join(outDir, 'settings.gradle.kts'))
  removeSync(join(outDir, 'gradle.properties'))
  removeSync(join(outDir, 'libs'))
  removeSync(join(outDir, 'gradle', 'libs.versions.toml'))
  ensureDirSync(join(outDir, 'app', 'src', 'main', 'res', 'values'))
  ensureDirSync(join(outDir, 'app', 'src', 'main', 'assets', 'www'))
  ensureDirSync(join(outDir, 'libs'))
  ensureDirSync(join(outDir, 'gradle'))
  writeFileSync(join(outDir, 'gradle', 'libs.versions.toml'), generateVersionCatalog())

  const android = config.android!

  copySync(aarPath, join(outDir, 'libs', 'capsule.aar'))

  writeFileSync(join(outDir, 'settings.gradle.kts'), generateSettings(config.appName))
  writeFileSync(join(outDir, 'build.gradle.kts'), generateRootBuild())
  writeFileSync(join(outDir, 'app', 'build.gradle.kts'), generateAppBuild(config))

  writeFileSync(
    join(outDir, 'app', 'src', 'main', 'AndroidManifest.xml'),
    generateManifest(config.appId, android.permissions ?? [], config.deepLinks)
  )

  writeFileSync(
    join(outDir, 'app', 'src', 'main', 'res', 'values', 'strings.xml'),
    generateStrings(config.appName)
  )

  // FileProvider path config for camera capture (referenced by the manifest provider).
  ensureDirSync(join(outDir, 'app', 'src', 'main', 'res', 'xml'))
  writeFileSync(
    join(outDir, 'app', 'src', 'main', 'res', 'xml', 'capsule_file_paths.xml'),
    generateFilePaths()
  )

  ensureDirSync(join(outDir, 'app', 'src', 'main', 'kotlin', ...config.appId.split('.')))
  writeFileSync(
    join(outDir, 'app', 'src', 'main', 'kotlin', ...config.appId.split('.'), 'MainActivity.kt'),
    generateMainActivity(config.appId)
  )

  // On-device smoke test (run with: capsule test --device  /  gradlew connectedAndroidTest)
  ensureDirSync(join(outDir, 'app', 'src', 'androidTest', 'kotlin', ...config.appId.split('.')))
  writeFileSync(
    join(outDir, 'app', 'src', 'androidTest', 'kotlin', ...config.appId.split('.'), 'SmokeTest.kt'),
    generateSmokeTest(config.appId)
  )

  writeFileSync(join(outDir, 'gradle.properties'), GRADLE_PROPERTIES)

  // Copy Gradle wrapper from the shell project
  // The wrapper files are identical for all projects using the same Gradle version.
  // In Phase 2 these will be bundled as static assets inside @capsule/cli.
  const shellProjectRoot = resolveShellProjectRoot(aarPath)
  if (shellProjectRoot) {
    copySync(join(shellProjectRoot, 'gradlew'), join(outDir, 'gradlew'))
    copySync(join(shellProjectRoot, 'gradlew.bat'), join(outDir, 'gradlew.bat'))
    copySync(join(shellProjectRoot, 'gradle', 'wrapper'), join(outDir, 'gradle', 'wrapper'))
  } else {
    await execa('gradle', ['wrapper', '--gradle-version', ANDROID_TOOLCHAIN.gradle], {
      cwd: outDir,
    })
  }
}

// ─── Code generators ────────────────────────────────────────────────────────

// Catalog entries the generated app references (generateRootBuild / generateAppBuild). Their
// versions come from the library's own catalog (ANDROID_TOOLCHAIN), so an app is always built
// with the toolchain the AAR was built and tested with. The AAR is a local file, so its
// implementation deps are not transitive — the app must declare each runtime one itself.
export const APP_LIBRARIES = [
  'androidx-core-ktx',
  'androidx-appcompat',
  'androidx-lifecycle-process',
  'kotlinx-coroutines-android',
  'kotlinx-serialization-json',
  'play-services-location',
  'okhttp',
  'guava',
  'mlkit-genai-prompt',
  'androidx-exifinterface',
  'androidx-test-ext-junit',
  'androidx-test-runner',
  'espresso-web',
] as const

export const APP_PLUGINS = [
  'android-application',
  'android-library',
  'kotlin-android',
  'kotlin-serialization',
] as const

/** The app's gradle/libs.versions.toml: the APP_* entries, with the versions they reference. */
export function generateVersionCatalog(toolchain: AndroidToolchain = ANDROID_TOOLCHAIN): string {
  const pick = <T>(entries: Record<string, T>, key: string): T => {
    const entry = entries[key]
    if (entry === undefined) {
      throw new Error(`"${key}" is missing from the library's libs.versions.toml`)
    }
    return entry
  }
  const libraries = APP_LIBRARIES.map((key) => [key, pick(toolchain.libraries, key)] as const)
  const plugins = APP_PLUGINS.map((key) => [key, pick(toolchain.plugins, key)] as const)

  // [versions] holds only the refs the picked entries use, in first-use order.
  const versions = new Map<string, string>()
  for (const [, entry] of [...plugins, ...libraries]) {
    if (entry.versionRef !== undefined) versions.set(entry.versionRef, entry.version)
  }
  const version = (entry: { version: string; versionRef?: string }) =>
    entry.versionRef !== undefined
      ? `version.ref = "${entry.versionRef}"`
      : `version = "${entry.version}"`

  return [
    '[versions]',
    ...[...versions].map(([key, value]) => `${key} = "${value}"`),
    '',
    '[libraries]',
    ...libraries.map(
      ([key, lib]) => `${key} = { group = "${lib.group}", name = "${lib.name}", ${version(lib)} }`
    ),
    '',
    '[plugins]',
    ...plugins.map(([key, plugin]) => `${key} = { id = "${plugin.id}", ${version(plugin)} }`),
    '',
  ].join('\n')
}

function generateSettings(appName: string): string {
  return `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "${appName}"
include(":app")
`
}

function generateRootBuild(): string {
  return `plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
}
`
}

function generateAppBuild(config: CapsuleConfig): string {
  const android = config.android!
  const devPort = config.devPort ?? DEFAULT_DEV_PORT
  const devServerUrl = `http://localhost:${devPort}` // adb reverse maps this to the host

  return `import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace         = "${config.appId}"
    compileSdk        = ${android.compileSdk}

    defaultConfig {
        applicationId = "${config.appId}"
        minSdk        = ${android.minSdk}
        targetSdk     = ${android.targetSdk}
        versionCode   = ${config.version.buildNumber}
        versionName   = "${config.version.name}"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        // Debug keystore is always present on dev machines — used for local release builds too.
        getByName("debug") {
            storeFile     = file(System.getProperty("user.home") + "/.android/debug.keystore")
            storePassword = "android"
            keyAlias      = "androiddebugkey"
            keyPassword   = "android"
        }
    }

    buildTypes {
        debug {
            buildConfigField("String", "CAPSULE_DEV_SERVER_URL", "\\"${devServerUrl}\\"")
        }
        release {
            buildConfigField("String", "CAPSULE_DEV_SERVER_URL", "null")
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { buildConfig = true }
}

// kotlinOptions {} was removed in Kotlin 2.2; compilerOptions is its replacement.
kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

dependencies {
    implementation(files("../libs/capsule.aar"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.lifecycle.process)
    // AAR runtime deps — implementation deps in AARs are not transitive
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.play.services.location)
    implementation(libs.okhttp)
    implementation(libs.guava)
    implementation(libs.mlkit.genai.prompt)
    implementation(libs.androidx.exifinterface)

    // On-device smoke test (capsule's generated SmokeTest) — test-only, not in the APK
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.espresso.web)
}
`
}

// Normal permissions included automatically (no runtime dialog, just manifest declaration).
// INTERNET backs filesystem.downloadFile (and any app networking) and
// ACCESS_NETWORK_STATE backs network.getStatus / network.statusChange
// (ConnectivityManager). Both are normal permissions, so declaring them shows no
// dialog and is harmless when unused.
const AUTO_PERMISSIONS = ['VIBRATE', 'INTERNET', 'ACCESS_NETWORK_STATE']

// CAMERA backs camera.capturePhoto and is declared unconditionally, alongside the
// camera <uses-feature> and FileProvider below — without it the runtime permission
// CameraCaptureHandler requests is undeclared and Android denies it outright (no
// dialog), so every capturePhoto() would reject with PERMISSION_DENIED. CAMERA is a
// dangerous permission, but merely declaring it shows no dialog; the handler only
// prompts on the first capturePhoto() call, so apps that never use the camera are
// unaffected (and uses-feature required="false" keeps them installable everywhere).
const CAMERA_PERMISSION = 'CAMERA'

// Builds the deep-link <intent-filter> blocks appended to MainActivity. Custom
// schemes and https universal links each get a VIEW + DEFAULT + BROWSABLE filter;
// universal links add autoVerify so Android can validate the App Links assetlinks.
function generateDeepLinkFilters(deepLinks?: CapsuleConfig['deepLinks']): string {
  if (!deepLinks) return ''
  const blocks: string[] = []

  for (const scheme of deepLinks.schemes ?? []) {
    blocks.push(`
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${scheme}" />
            </intent-filter>`)
  }

  for (const link of deepLinks.universalLinks ?? []) {
    const pathPrefix = link.pathPrefix
      ? `\n                <data android:pathPrefix="${link.pathPrefix}" />`
      : ''
    blocks.push(`
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" />
                <data android:host="${link.host}" />${pathPrefix}
            </intent-filter>`)
  }

  return blocks.join('')
}

// Exported for unit testing — pure string generation, no I/O.
export function generateManifest(
  appId: string,
  permissions: string[],
  deepLinks?: CapsuleConfig['deepLinks']
): string {
  const all = [...new Set([...AUTO_PERMISSIONS, CAMERA_PERMISSION, ...permissions])]
  const permissionLines = all
    .map((p) => `    <uses-permission android:name="android.permission.${p}" />`)
    .join('\n')

  // Declared non-required so a device without a camera can still install the app
  // (the camera API simply errors at runtime there). Harmless when unused.
  const cameraFeature =
    '    <uses-feature android:name="android.hardware.camera" android:required="false" />'

  const deepLinkFilters = generateDeepLinkFilters(deepLinks)
  // singleTask so a warm deep link is routed to the existing Activity via
  // onNewIntent (app.urlOpen) instead of spawning a duplicate Activity instance.
  const launchMode = deepLinkFilters ? '\n            android:launchMode="singleTask"' : ''

  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

${permissionLines}
${cameraFeature}

    <application
        android:label="@string/app_name"
        android:theme="@style/Theme.AppCompat.Light.NoActionBar"
        android:usesCleartextTraffic="true">

        <activity
            android:name=".MainActivity"
            android:exported="true"${launchMode}
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>${deepLinkFilters}
        </activity>

        <!-- Backs camera.capturePhoto: hands the system camera a writable Uri into
             our cache. Authority matches AndroidCameraProvider (\${applicationId}.capsule.fileprovider). -->
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${appId}.capsule.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/capsule_file_paths" />
        </provider>

    </application>
</manifest>
`
}

// Scopes the FileProvider to the camera cache dir AndroidCameraProvider writes to.
function generateFilePaths(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<paths>
    <cache-path name="capsule_camera" path="capsule/camera/" />
</paths>
`
}

function generateStrings(appName: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${appName}</string>
</resources>
`
}

function generateMainActivity(appId: string): string {
  return `package ${appId}

import dev.capsule.CapsuleActivity
import dev.capsule.CapsuleShellConfig

class MainActivity : CapsuleActivity() {
    override val capsuleConfig = CapsuleShellConfig(
        devServerUrl = if (BuildConfig.DEBUG) BuildConfig.CAPSULE_DEV_SERVER_URL else null
    )
}
`
}

function generateSmokeTest(appId: string): string {
  return `package ${appId}

import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.web.assertion.WebViewAssertions.webMatches
import androidx.test.espresso.web.sugar.Web.onWebView
import androidx.test.espresso.web.webdriver.DriverAtoms.findElement
import androidx.test.espresso.web.webdriver.DriverAtoms.getText
import androidx.test.espresso.web.webdriver.Locator
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.not
import org.junit.Test
import org.junit.runner.RunWith

/**
 * On-device smoke test — the one layer that genuinely needs a real device/emulator.
 * Launches the app and asserts the WebView actually painted non-blank content,
 * catching blank-screen / WebView-attach / asset-load / JS-crash regressions that
 * the unit, component, and QuickJS-fidelity tests cannot see.
 *
 * Deliberately content-agnostic (asserts "rendered something", not a specific
 * string): this file is regenerated on every \`capsule sync\`, so it can't be
 * hand-tailored to a customized UI. For richer on-device assertions, add your
 * own androidTest alongside this one.
 *
 *   debug   — loads the dev server, so run \`capsule dev\` first (adb reverse must be up)
 *   release — loads the embedded bundle and is fully self-contained
 *
 * Run with:  ./gradlew :app:connectedDebugAndroidTest
 */
@RunWith(AndroidJUnit4::class)
class SmokeTest {
    @Test
    fun app_renders_in_webview() {
        ActivityScenario.launch(MainActivity::class.java).use {
            onWebView()
                .forceJavascriptEnabled()
                .withElement(findElement(Locator.TAG_NAME, "body"))
                // non-empty body text ⇒ the SPA mounted and painted (not a blank/crashed screen)
                .check(webMatches(getText(), not(equalTo(""))))
        }
    }
}
`
}

// Gradle's own daemon default (512 MB heap, 384 MB metaspace) runs out in release lint/R8.
const GRADLE_PROPERTIES = `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
android.nonTransitiveRClass=true
kotlin.code.style=official
`
