# `capsule.config.ts` reference

> Generated from `CONFIG_FIELDS` in `packages/cli/src/config.ts` by `pnpm gen` — do not edit.

The project config is a TypeScript module default-exporting a `CapsuleConfig`
(wrap it in `defineConfig()` for type checking). **Required** means required within its
parent: a required key of an optional section is only required when that section is present.
`[]` marks the elements of an array.

## Top-level keys

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `appId` | `string` | yes | — | Reverse-DNS application id, e.g. `com.acme.app` — the Android `applicationId`; also seeds the embedded server port. |
| `appName` | `string` | yes | — | Display name shown under the app icon. |
| `devPort` | `number` | no | 5173 | Port of the web dev server that `capsule dev` and the debug app load. |

## `version`

App version.

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `version` | `object` | yes | — | App version. |
| `version.name` | `string` | yes | — | User-visible version, e.g. `1.2.0` (Android `versionName`). |
| `version.buildNumber` | `number` | yes | — | Monotonic build number (Android `versionCode`); also orders OTA bundles. |

## `android`

Android build settings — required to build for Android.

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `android` | `object` | no | — | Android build settings — required to build for Android. |
| `android.minSdk` | `number` | yes | — | Lowest Android API level the app installs on. |
| `android.targetSdk` | `number` | yes | — | API level the app targets (Google Play sets a floor). |
| `android.compileSdk` | `number` | yes | — | API level the app compiles against. |
| `android.permissions` | `string[]` | no | — | Extra Android permissions, by short name (`CAMERA`) — merged with the ones Capsule adds for the APIs you use. |
| `android.signing` | `object` | no | — | Release signing. Prefer environment variables over literal passwords. |
| `android.signing.storeFile` | `string` | no | — | Path to the keystore. |
| `android.signing.storePassword` | `string` | no | — | Keystore password. |
| `android.signing.keyAlias` | `string` | no | — | Alias of the signing key. |
| `android.signing.keyPassword` | `string` | no | — | Password of the signing key. |
| `android.gradleOverrides` | `Record<string, unknown>` | no | — | Raw overrides merged into the generated Gradle build. |
| `android.push` | `object` | no | — | Push notification (FCM) settings. |
| `android.push.googleServicesFile` | `string` | no | — | Path to the Firebase `google-services.json`. |

## `ios`

iOS build settings (iOS shell in bring-up).

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `ios` | `object` | no | — | iOS build settings (iOS shell in bring-up). |
| `ios.deployment` | `string` | no | — | Minimum iOS version. |
| `ios.bundleId` | `string` | no | — | iOS bundle identifier, when it differs from `appId`. |

## `deepLinks`

Deep links / universal links that route into the app.

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `deepLinks` | `object` | no | — | Deep links / universal links that route into the app. |
| `deepLinks.schemes` | `string[]` | no | — | Custom URL schemes — `['myapp']` registers `myapp://…`. |
| `deepLinks.universalLinks` | `object[]` | no | — | HTTPS App Links / Universal Links the app claims. |
| `deepLinks.universalLinks[].host` | `string` | yes | — | Host to match, e.g. `app.acme.com`. |
| `deepLinks.universalLinks[].pathPrefix` | `string` | no | — | Path prefix that scopes the match, e.g. `/invite`. |

## `plugins`

Native plugins — a package name, or an object with a `path` (package name or local folder).

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `plugins` | Array<string \| object> | no | — | Native plugins — a package name, or an object with a `path` (package name or local folder). |
| `plugins[].path` | `string` | yes | — | Package name or local folder of the plugin. |
| `plugins[].trust` | `string` | no | — | `'unverified'` acknowledges a plugin outside the `@capsule-community/*` scope (closed-source or commercial). |
| `plugins[].overrides` | `string` | no | — | Built-in API this plugin replaces at runtime, e.g. `camera`. |

## `codeSync`

OTA updates (CodeSync). Absent or `enabled: false` → no OTA client in the app.

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `codeSync` | `object` | no | — | OTA updates (CodeSync). Absent or `enabled: false` → no OTA client in the app. |
| `codeSync.enabled` | `boolean` | yes | — | Turns OTA updates on. |
| `codeSync.url` | `string` | no | — | CodeSync server URL (self-hosted or hosted). |
| `codeSync.apiKey` | `string` | no | — | API key for the CodeSync server. |
| `codeSync.channel` | `string` | no | — | Release channel the app follows, e.g. `production`, `staging`. |
| `codeSync.strategy` | 'background' \| 'immediate' \| 'on-next-launch' | no | — | When a downloaded update is applied. |
| `codeSync.checkOnForeground` | `boolean` | no | — | Also check for updates whenever the app returns to the foreground. |
| `codeSync.mandatory` | `boolean` | no | — | Treat updates as mandatory by default (a bundle can override it). |

## `web`

Web bundle build settings.

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `web` | `object` | no | — | Web bundle build settings. |
| `web.mobileReset` | `boolean` | no | true | Inject the ~150-byte mobile CSS reset into the built `index.html`. |
| `web.buildCommand` | `string` | no | `vite build` | Command that builds the web bundle into `dist/`, e.g. `ng build --output-path=dist`. |
| `web.devCommand` | `string` | no | the Vite dev server | Command that serves the web app in development, e.g. `ng serve --port 5177`. |

## `jobs`

Background jobs (planned).

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `jobs` | `object[]` | no | — | Background jobs (planned). |
| `jobs[].id` | `string` | yes | — | Job id. |
| `jobs[].interval` | `string` | yes | — | How often the job runs. |
| `jobs[].constraints` | `object` | no | — | Conditions the job waits for. |
| `jobs[].constraints.network` | 'required' \| 'unmetered' \| 'none' | no | — | Network condition. |
| `jobs[].constraints.battery` | 'notLow' \| 'charging' \| 'none' | no | — | Battery condition. |
| `jobs[].sync` | `object` | no | — | Sync a remote collection into local storage. |
| `jobs[].sync.url` | `string` | yes | — | Source URL. |
| `jobs[].sync.collection` | `string` | yes | — | Local collection to fill. |
| `jobs[].sync.strategy` | 'merge' \| 'replace' | yes | — | How fetched records combine with existing ones. |
| `jobs[].notify` | `object` | no | — | Schedule local notifications from local data. |
| `jobs[].notify.from` | `string` | yes | — | Collection to read. |
| `jobs[].notify.where` | `Record<string, unknown>` | no | — | Filter on the records. |
| `jobs[].notify.limit` | `number` | no | — | Maximum records to schedule for. |
| `jobs[].notify.notifications` | `object[]` | yes | — | Notifications to schedule per record. |
| `jobs[].notify.notifications[].trigger` | `object` | yes | — | When the notification fires. |
| `jobs[].notify.notifications[].trigger.minutesBefore` | `number` | yes | — | Minutes before the record time. |
| `jobs[].notify.notifications[].title` | `string` | yes | — | Notification title (template). |
| `jobs[].notify.notifications[].body` | `string` | yes | — | Notification body (template). |
| `jobs[].notify.notifications[].idTemplate` | `string` | yes | — | Template for a stable notification id, so reschedules replace instead of duplicate. |
