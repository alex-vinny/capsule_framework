// Docs: docs/reference/cli.md
import { createJiti } from 'jiti'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

export interface CapsuleConfig {
  appId: string
  appName: string
  devPort?: number
  version: {
    name: string
    buildNumber: number
  }
  android?: {
    minSdk: number
    targetSdk: number
    compileSdk: number
    permissions?: string[]
    signing?: {
      storeFile?: string
      storePassword?: string
      keyAlias?: string
      keyPassword?: string
    }
    gradleOverrides?: Record<string, unknown>
    push?: {
      googleServicesFile?: string
    }
  }
  ios?: {
    deployment?: string
    bundleId?: string
  }
  /**
   * Deep links / universal links that route into the app. Cross-platform: the
   * Android sync generates `<intent-filter>`s (and sets `launchMode="singleTask"`)
   * now; the iOS bring-up (Phase 4) maps the same shape to `CFBundleURLTypes`
   * (schemes) + Associated Domains (universal links) in Info.plist.
   */
  deepLinks?: {
    /** Custom URL schemes, e.g. `['myapp']` registers `myapp://...`. */
    schemes?: string[]
    /** HTTPS App Links / Universal Links the app should claim. */
    universalLinks?: Array<{
      /** Host to match, e.g. `app.acme.com`. */
      host: string
      /** Optional path prefix to scope the match, e.g. `/invite`. */
      pathPrefix?: string
    }>
  }
  plugins?: Array<string | { path: string; trust?: string; overrides?: string }>
  codeSync?: {
    enabled: boolean
    url?: string
    apiKey?: string
    channel?: string
    strategy?: 'background' | 'immediate' | 'on-next-launch'
    checkOnForeground?: boolean
    mandatory?: boolean
  }
  web?: {
    mobileReset?: boolean
    buildCommand?: string // override default 'vite build', e.g. 'ng build --output-path=dist'
    devCommand?: string // override default vite dev server, e.g. 'ng serve --port 5177'
  }
  jobs?: Array<{
    id: string
    interval: string
    constraints?: {
      network?: 'required' | 'unmetered' | 'none'
      battery?: 'notLow' | 'charging' | 'none'
    }
    sync?: {
      url: string
      collection: string
      strategy: 'merge' | 'replace'
    }
    notify?: {
      from: string
      where?: Record<string, unknown>
      limit?: number
      notifications: Array<{
        trigger: { minutesBefore: number }
        title: string
        body: string
        idTemplate: string
      }>
    }
  }>
}

/** `capsule dev` / the generated app's dev-server URL use this when `devPort` is unset. */
export const DEFAULT_DEV_PORT = 5173

// ── Config reference descriptor ──────────────────────────────────────────────
// One entry per key of CapsuleConfig — the single source for the generated reference
// (docs/reference/generated/config.md, `pnpm gen`). The `allPathsDescribed` check below
// fails `tsc` when a key is added to the interface without an entry here.

type Primitive = string | number | boolean
type Join<P extends string, K extends string> = P extends '' ? K : `${P}.${K}`
type ArrayFields<E, P extends string> = Fields<Exclude<E, Primitive>, `${P}[]`>
type Fields<T, P extends string> = T extends readonly (infer E)[]
  ? ArrayFields<E, P>
  : T extends object
    ? string extends keyof T
      ? never // Record<string, …> — a leaf
      : ObjectPaths<T, P>
    : never
type ObjectPaths<T, P extends string> = {
  [K in keyof T & string]-?: Join<P, K> | Fields<NonNullable<T[K]>, Join<P, K>>
}[keyof T & string]

/** Every key of `capsule.config.ts` as a dotted path; `[]` marks array elements (`jobs[].id`). */
export type ConfigPath = ObjectPaths<CapsuleConfig, ''>

export interface ConfigField {
  key: ConfigPath
  /** TypeScript type as shown in the docs. */
  type: string
  /** Required within its parent object (a required key of an optional section). */
  required: boolean
  /** The value Capsule uses when the key is absent — only where code applies one. */
  default?: string
  description: string
}

export const CONFIG_FIELDS = [
  {
    key: 'appId',
    type: 'string',
    required: true,
    description:
      'Reverse-DNS application id, e.g. `com.acme.app` — the Android `applicationId`; also seeds the embedded server port.',
  },
  {
    key: 'appName',
    type: 'string',
    required: true,
    description: 'Display name shown under the app icon.',
  },
  {
    key: 'devPort',
    type: 'number',
    required: false,
    default: String(DEFAULT_DEV_PORT),
    description: 'Port of the web dev server that `capsule dev` and the debug app load.',
  },
  { key: 'version', type: 'object', required: true, description: 'App version.' },
  {
    key: 'version.name',
    type: 'string',
    required: true,
    description: 'User-visible version, e.g. `1.2.0` (Android `versionName`).',
  },
  {
    key: 'version.buildNumber',
    type: 'number',
    required: true,
    description: 'Monotonic build number (Android `versionCode`); also orders OTA bundles.',
  },

  {
    key: 'android',
    type: 'object',
    required: false,
    description: 'Android build settings — required to build for Android.',
  },
  {
    key: 'android.minSdk',
    type: 'number',
    required: true,
    description: 'Lowest Android API level the app installs on.',
  },
  {
    key: 'android.targetSdk',
    type: 'number',
    required: true,
    description: 'API level the app targets (Google Play sets a floor).',
  },
  {
    key: 'android.compileSdk',
    type: 'number',
    required: true,
    description: 'API level the app compiles against.',
  },
  {
    key: 'android.permissions',
    type: 'string[]',
    required: false,
    description:
      'Extra Android permissions, by short name (`CAMERA`) — merged with the ones Capsule adds for the APIs you use.',
  },
  {
    key: 'android.signing',
    type: 'object',
    required: false,
    description: 'Release signing. Prefer environment variables over literal passwords.',
  },
  {
    key: 'android.signing.storeFile',
    type: 'string',
    required: false,
    description: 'Path to the keystore.',
  },
  {
    key: 'android.signing.storePassword',
    type: 'string',
    required: false,
    description: 'Keystore password.',
  },
  {
    key: 'android.signing.keyAlias',
    type: 'string',
    required: false,
    description: 'Alias of the signing key.',
  },
  {
    key: 'android.signing.keyPassword',
    type: 'string',
    required: false,
    description: 'Password of the signing key.',
  },
  {
    key: 'android.gradleOverrides',
    type: 'Record<string, unknown>',
    required: false,
    description: 'Raw overrides merged into the generated Gradle build.',
  },
  {
    key: 'android.push',
    type: 'object',
    required: false,
    description: 'Push notification (FCM) settings.',
  },
  {
    key: 'android.push.googleServicesFile',
    type: 'string',
    required: false,
    description: 'Path to the Firebase `google-services.json`.',
  },

  {
    key: 'ios',
    type: 'object',
    required: false,
    description: 'iOS build settings (iOS shell in bring-up).',
  },
  { key: 'ios.deployment', type: 'string', required: false, description: 'Minimum iOS version.' },
  {
    key: 'ios.bundleId',
    type: 'string',
    required: false,
    description: 'iOS bundle identifier, when it differs from `appId`.',
  },

  {
    key: 'deepLinks',
    type: 'object',
    required: false,
    description: 'Deep links / universal links that route into the app.',
  },
  {
    key: 'deepLinks.schemes',
    type: 'string[]',
    required: false,
    description: "Custom URL schemes — `['myapp']` registers `myapp://…`.",
  },
  {
    key: 'deepLinks.universalLinks',
    type: 'object[]',
    required: false,
    description: 'HTTPS App Links / Universal Links the app claims.',
  },
  {
    key: 'deepLinks.universalLinks[].host',
    type: 'string',
    required: true,
    description: 'Host to match, e.g. `app.acme.com`.',
  },
  {
    key: 'deepLinks.universalLinks[].pathPrefix',
    type: 'string',
    required: false,
    description: 'Path prefix that scopes the match, e.g. `/invite`.',
  },

  {
    key: 'plugins',
    type: 'Array<string | object>',
    required: false,
    description:
      'Native plugins — a package name, or an object with a `path` (package name or local folder).',
  },
  {
    key: 'plugins[].path',
    type: 'string',
    required: true,
    description: 'Package name or local folder of the plugin.',
  },
  {
    key: 'plugins[].trust',
    type: 'string',
    required: false,
    description:
      "`'unverified'` acknowledges a plugin outside the `@capsule-community/*` scope (closed-source or commercial).",
  },
  {
    key: 'plugins[].overrides',
    type: 'string',
    required: false,
    description: 'Built-in API this plugin replaces at runtime, e.g. `camera`.',
  },

  {
    key: 'codeSync',
    type: 'object',
    required: false,
    description: 'OTA updates (CodeSync). Absent or `enabled: false` → no OTA client in the app.',
  },
  {
    key: 'codeSync.enabled',
    type: 'boolean',
    required: true,
    description: 'Turns OTA updates on.',
  },
  {
    key: 'codeSync.url',
    type: 'string',
    required: false,
    description: 'CodeSync server URL (self-hosted or hosted).',
  },
  {
    key: 'codeSync.apiKey',
    type: 'string',
    required: false,
    description: 'API key for the CodeSync server.',
  },
  {
    key: 'codeSync.channel',
    type: 'string',
    required: false,
    description: 'Release channel the app follows, e.g. `production`, `staging`.',
  },
  {
    key: 'codeSync.strategy',
    type: "'background' | 'immediate' | 'on-next-launch'",
    required: false,
    description: 'When a downloaded update is applied.',
  },
  {
    key: 'codeSync.checkOnForeground',
    type: 'boolean',
    required: false,
    description: 'Also check for updates whenever the app returns to the foreground.',
  },
  {
    key: 'codeSync.mandatory',
    type: 'boolean',
    required: false,
    description: 'Treat updates as mandatory by default (a bundle can override it).',
  },

  { key: 'web', type: 'object', required: false, description: 'Web bundle build settings.' },
  {
    key: 'web.mobileReset',
    type: 'boolean',
    required: false,
    default: 'true',
    description: 'Inject the ~150-byte mobile CSS reset into the built `index.html`.',
  },
  {
    key: 'web.buildCommand',
    type: 'string',
    required: false,
    default: '`vite build`',
    description:
      'Command that builds the web bundle into `dist/`, e.g. `ng build --output-path=dist`.',
  },
  {
    key: 'web.devCommand',
    type: 'string',
    required: false,
    default: 'the Vite dev server',
    description: 'Command that serves the web app in development, e.g. `ng serve --port 5177`.',
  },

  { key: 'jobs', type: 'object[]', required: false, description: 'Background jobs (planned).' },
  { key: 'jobs[].id', type: 'string', required: true, description: 'Job id.' },
  {
    key: 'jobs[].interval',
    type: 'string',
    required: true,
    description: 'How often the job runs.',
  },
  {
    key: 'jobs[].constraints',
    type: 'object',
    required: false,
    description: 'Conditions the job waits for.',
  },
  {
    key: 'jobs[].constraints.network',
    type: "'required' | 'unmetered' | 'none'",
    required: false,
    description: 'Network condition.',
  },
  {
    key: 'jobs[].constraints.battery',
    type: "'notLow' | 'charging' | 'none'",
    required: false,
    description: 'Battery condition.',
  },
  {
    key: 'jobs[].sync',
    type: 'object',
    required: false,
    description: 'Sync a remote collection into local storage.',
  },
  { key: 'jobs[].sync.url', type: 'string', required: true, description: 'Source URL.' },
  {
    key: 'jobs[].sync.collection',
    type: 'string',
    required: true,
    description: 'Local collection to fill.',
  },
  {
    key: 'jobs[].sync.strategy',
    type: "'merge' | 'replace'",
    required: true,
    description: 'How fetched records combine with existing ones.',
  },
  {
    key: 'jobs[].notify',
    type: 'object',
    required: false,
    description: 'Schedule local notifications from local data.',
  },
  { key: 'jobs[].notify.from', type: 'string', required: true, description: 'Collection to read.' },
  {
    key: 'jobs[].notify.where',
    type: 'Record<string, unknown>',
    required: false,
    description: 'Filter on the records.',
  },
  {
    key: 'jobs[].notify.limit',
    type: 'number',
    required: false,
    description: 'Maximum records to schedule for.',
  },
  {
    key: 'jobs[].notify.notifications',
    type: 'object[]',
    required: true,
    description: 'Notifications to schedule per record.',
  },
  {
    key: 'jobs[].notify.notifications[].trigger',
    type: 'object',
    required: true,
    description: 'When the notification fires.',
  },
  {
    key: 'jobs[].notify.notifications[].trigger.minutesBefore',
    type: 'number',
    required: true,
    description: 'Minutes before the record time.',
  },
  {
    key: 'jobs[].notify.notifications[].title',
    type: 'string',
    required: true,
    description: 'Notification title (template).',
  },
  {
    key: 'jobs[].notify.notifications[].body',
    type: 'string',
    required: true,
    description: 'Notification body (template).',
  },
  {
    key: 'jobs[].notify.notifications[].idTemplate',
    type: 'string',
    required: true,
    description:
      'Template for a stable notification id, so reschedules replace instead of duplicate.',
  },
] as const satisfies readonly ConfigField[]

type DescribedPath = (typeof CONFIG_FIELDS)[number]['key']
// Compile-time exhaustiveness: if this errors, the type shows the config keys missing above.
const allPathsDescribed: [Exclude<ConfigPath, DescribedPath>] extends [never]
  ? true
  : Exclude<ConfigPath, DescribedPath> = true
void allPathsDescribed

export function defineConfig(config: CapsuleConfig): CapsuleConfig {
  return config
}

export async function loadConfig(projectRoot: string): Promise<CapsuleConfig> {
  const configPath = join(projectRoot, 'capsule.config.ts')

  if (!existsSync(configPath)) {
    throw new Error(`capsule.config.ts not found in ${projectRoot}`)
  }

  const jiti = createJiti(projectRoot, { interopDefault: true })
  const mod = (await jiti.import(configPath)) as { default: CapsuleConfig }

  return mod.default
}
