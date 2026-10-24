> Generated from `packages/core/src` by `pnpm gen` — do not edit.

# @capsule/core

`@capsule/core` — the JavaScript API an app uses to reach the native shell.

Each native API is a ready-made singleton (`camera`, `db`, `push`, …). Inside the Capsule
shell calls go over the native bridge; in a plain browser a web fallback answers instead, so an
app can be developed without a device. Server routes for the on-device `/api` bundle live in
the `@capsule/core/routes` entry point.

## Classes

### CapsuleError

The error every Capsule API rejects with: a numeric `code` from [CapsuleErrorCode](#capsuleerrorcode-1) plus optional `data`.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new CapsuleError(
   code, 
   message, 
   data?
): CapsuleError;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `code` | `number` |
| `message` | `string` |
| `data?` | `unknown` |

###### Returns

[`CapsuleError`](#capsuleerror)

###### Overrides

```ts
Error.constructor
```

#### Properties

##### code

```ts
readonly code: number;
```

##### data?

```ts
readonly optional data?: unknown;
```

#### Methods

##### from()

```ts
static from(entry, data?): CapsuleError;
```

Builds the error for one [CapsuleErrorCode](#capsuleerrorcode-1) entry.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `entry` | \{ `code`: `number`; `message`: `string`; \} |
| `entry.code` | `number` |
| `entry.message?` | `string` |
| `data?` | `unknown` |

###### Returns

[`CapsuleError`](#capsuleerror)

***

### FakeBridge

Test double for Bridge. Configure responses per method, inspect recorded calls.

#### Implements

- [`Bridge`](#bridge)

#### Constructors

##### Constructor

```ts
new FakeBridge(): FakeBridge;
```

###### Returns

[`FakeBridge`](#fakebridge)

#### Properties

##### calls

```ts
readonly calls: CallRecord[] = [];
```

#### Methods

##### call()

```ts
call<T>(method, params?): Promise<T>;
```

Sends a request to the native shell and resolves with its `result`. Rejects with a
[CapsuleError](#capsuleerror) carrying the native error code — `BRIDGE_UNAVAILABLE` outside the shell.

###### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` | `unknown` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `method` | `string` |
| `params?` | `unknown` |

###### Returns

`Promise`\<`T`\>

###### Implementation of

[`Bridge`](#bridge).[`call`](#call-1)

##### emit()

```ts
emit(method, params): void;
```

Emit a notification to all registered listeners (for watch/subscribe tests).

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `method` | `string` |
| `params` | `unknown` |

###### Returns

`void`

##### mockReject()

```ts
mockReject(method, error): this;
```

Register a rejected error for a method.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `method` | `string` |
| `error` | [`CapsuleError`](#capsuleerror) |

###### Returns

`this`

##### mockResolve()

```ts
mockResolve(method, value): this;
```

Register a resolved response for a method.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `method` | `string` |
| `value` | `unknown` |

###### Returns

`this`

##### on()

```ts
on(method, handler): () => void;
```

Subscribes to a native notification; returns the function that unsubscribes.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `method` | `string` |
| `handler` | [`NotificationHandler`](#notificationhandler) |

###### Returns

() => `void`

###### Implementation of

[`Bridge`](#bridge).[`on`](#on-1)

## Interfaces

### AiAvailability

The honest answer to "can this app use AI here?" — `reason` explains anything but `ready`.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-reason"></a> `reason?` | `string` |
| <a id="property-status"></a> `status` | [`AiStatus`](#aistatus) |
| <a id="property-tier"></a> `tier` | [`AiTier`](#aitier) |

***

### AiGenerateOptions

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-maxtokens"></a> `maxTokens?` | `number` | Upper bound on the reply length, in model tokens. |
| <a id="property-prompt"></a> `prompt` | `string` | - |
| <a id="property-temperature"></a> `temperature?` | `number` | Sampling temperature; lower is more deterministic. |

***

### AiModule

On-device / hybrid text generation. The shell picks the tier (on-device first); check
[availability](#availability) before offering AI features — on most devices today the answer is
`unavailable`, and calls then reject with `AI_UNAVAILABLE`.

#### Methods

##### availability()

```ts
availability(): Promise<AiAvailability>;
```

Which tier would serve a request right now, and whether it is ready.

###### Returns

`Promise`\<[`AiAvailability`](#aiavailability)\>

##### generate()

```ts
generate(options): Promise<AiResult>;
```

Generates a complete reply. Rejects with `AI_UNAVAILABLE` when no tier is ready.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`AiGenerateOptions`](#aigenerateoptions) |

###### Returns

`Promise`\<[`AiResult`](#airesult)\>

##### prepare()

```ts
prepare(): Promise<AiAvailability>;
```

Makes the best tier ready when it can be (e.g. downloads the OS model — may take minutes on
first use), then resolves with the resulting availability.

###### Returns

`Promise`\<[`AiAvailability`](#aiavailability)\>

##### stream()

```ts
stream(options): AsyncGenerator<string, AiResult, undefined>;
```

Yields the reply piece by piece as the model produces it; the generator's return value is
the complete [AiResult](#airesult). Breaking out of the loop stops listening (the device still
finishes the reply in the background).

```ts
for await (const piece of ai.stream({ prompt })) output.textContent += piece
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`AiGenerateOptions`](#aigenerateoptions) |

###### Returns

`AsyncGenerator`\<`string`, [`AiResult`](#airesult), `undefined`\>

***

### AiResult

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-finishreason"></a> `finishReason` | [`AiFinishReason`](#aifinishreason) |
| <a id="property-text"></a> `text` | `string` |

***

### AlertButton

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-label"></a> `label` | `string` |
| <a id="property-role"></a> `role?` | [`AlertButtonRole`](#alertbuttonrole) |

***

### AlertOptions

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-buttons"></a> `buttons?` | [`AlertButton`](#alertbutton)[] |
| <a id="property-message"></a> `message` | `string` |
| <a id="property-style"></a> `style?` | [`AlertStyle`](#alertstyle) |
| <a id="property-title"></a> `title?` | `string` |

***

### AlertResult

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-action"></a> `action` | `string` |

***

### AlertsModule

#### Methods

##### show()

```ts
show(options): Promise<AlertResult>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`AlertOptions`](#alertoptions) |

###### Returns

`Promise`\<[`AlertResult`](#alertresult)\>

***

### AlertStyle

Per-dialog visual style.

IMPORTANT — this is NOT a CSS layer. Every property maps to a specific,
tested native API call. Properties not listed here are not supported on
any platform; they are intentionally absent (not forgotten). Unsupported
things include: per-button colors, custom fonts, layout/padding,
entry/exit animations, and dialog width.

Colors: hex string — `#RGB`, `#RRGGBB`, or `#AARRGGBB` (alpha-first).
Sizes:  sp on Android (scale-independent pixels), pt on iOS.
Lengths: dp on Android, pt on iOS.

Each property documents its exact platform behaviour below.
Properties marked "iOS: not supported" are silently ignored on iOS —
they do not throw, but they have no visual effect.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-accentcolor"></a> `accentColor?` | `string` | Button text color — applied to all button slots. Per-button colors are not supported by either platform's native dialog API. Android: `getButton(slot).setTextColor()` — fully supported. iOS: `UIAlertController.view.tintColor` — fully supported. |
| <a id="property-backgroundcolor"></a> `backgroundColor?` | `string` | Dialog panel background color. Android: `GradientDrawable` on `dialog.window` — fully supported. iOS: NOT SUPPORTED — `UIAlertController` background is system-controlled and cannot be changed via public API. Setting this has no effect on iOS. |
| <a id="property-buttonallcaps"></a> `buttonAllCaps?` | `boolean` | Whether button labels are rendered in uppercase. Android: `Button.isAllCaps` — fully supported. Platform default is `true`. iOS: NOT SUPPORTED — iOS buttons are always mixed-case. This property is silently ignored on iOS. |
| <a id="property-cornerradius"></a> `cornerRadius?` | `number` | Dialog panel corner radius in dp (Android) / pt (iOS). Android: `GradientDrawable.cornerRadius` on `dialog.window` — fully supported. iOS: NOT SUPPORTED — `UIAlertController` corner radius is system-controlled and overridden by internal masking. Setting this has no effect on iOS. |
| <a id="property-dimamount"></a> `dimAmount?` | `number` | Backdrop scrim opacity behind the dialog. Range: `0.0` (fully transparent) → `1.0` (fully opaque black). Values outside this range are clamped. Platform default is ~0.5. Android: `Window.setDimAmount()` — fully supported. iOS: NOT SUPPORTED — `UIAlertController` scrim is system-controlled. Setting this has no effect on iOS. |
| <a id="property-messagecolor"></a> `messageColor?` | `string` | Message body text color. Android: `TextView(android.R.id.message).setTextColor()` — fully supported. iOS: `NSAttributedString` on `alertController.setValue` — fully supported. |
| <a id="property-messagesize"></a> `messageSize?` | `number` | Message body text size in sp (Android) / pt (iOS). Android: `TextView.setTextSize(COMPLEX_UNIT_SP, value)` — fully supported. iOS: `NSAttributedString` font attribute — fully supported. |
| <a id="property-titlecolor"></a> `titleColor?` | `string` | Title text color. Android: `TextView(android.R.id.title).setTextColor()` — fully supported. iOS: `NSAttributedString` on `alertController.setValue` — fully supported. |
| <a id="property-titlesize"></a> `titleSize?` | `number` | Title text size in sp (Android) / pt (iOS). Android: `TextView.setTextSize(COMPLEX_UNIT_SP, value)` — fully supported. iOS: `NSAttributedString` font attribute — fully supported. |

***

### AppModule

App lifecycle + deep links. **Infrastructure**, not just an API: push
tap-routing and OTA foreground re-checks both build on the events emitted here.

- [onStateChange](#onstatechange) / [onResume](#onresume) / [onPause](#onpause) — foreground &
  background transitions. On Android these come from `ProcessLifecycleOwner`,
  so internal activity transitions (e.g. opening the camera picker) do **not**
  spuriously fire background/foreground.
- [onUrlOpen](#onurlopen) — a deep link arriving while the app is already running.
- [getLaunchUrl](#getlaunchurl) — the deep link the app was *cold-started* with
  (consumed once; resolves `null` afterwards or on a normal launch).

#### Methods

##### getLaunchUrl()

```ts
getLaunchUrl(): Promise<{
  url: string | null;
}>;
```

The URL the app was *cold-started* with via a deep link, or `null` for a
normal launch. Consume-once: a second call resolves `null`.

Cold-start links surface **here** and **not** through [onUrlOpen](#onurlopen) (which
fires only for links arriving while the app is already running) — so route on
both at startup to cover every entry path:

```ts
const { url } = await app.getLaunchUrl()
if (url) route(url)            // launched by a deep link
app.onUrlOpen(({ url }) => route(url))  // links while running
```

###### Returns

`Promise`\<\{
  `url`: `string` \| `null`;
\}\>

##### getState()

```ts
getState(): Promise<AppState>;
```

Query the current foreground state on demand.

###### Returns

`Promise`\<[`AppState`](#appstate)\>

##### onPause()

```ts
onPause(callback): () => void;
```

Sugar over [onStateChange](#onstatechange): fires only when the app leaves the foreground.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `callback` | () => `void` |

###### Returns

() => `void`

##### onResume()

```ts
onResume(callback): () => void;
```

Sugar over [onStateChange](#onstatechange): fires only when the app returns to the foreground.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `callback` | () => `void` |

###### Returns

() => `void`

##### onStateChange()

```ts
onStateChange(callback): () => void;
```

Subscribe to every foreground/background transition. Returns an unsubscribe fn.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `callback` | (`state`) => `void` |

###### Returns

() => `void`

##### onUrlOpen()

```ts
onUrlOpen(callback): () => void;
```

Subscribe to deep links delivered while the app is running. Returns an unsubscribe fn.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `callback` | (`event`) => `void` |

###### Returns

() => `void`

***

### AppState

Foreground/background state of the app.

Deliberately a **binary** contract: Android (resumed/paused/stopped) and iOS
(active/inactive/background) disagree on the middle states, but both agree on
"is the app in the foreground and interactive?". Modelling that single bit
keeps the cross-platform seam honest — the same listener fires identically on
both platforms. A richer `state` enum can be layered on later without breaking
this shape.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-isactive"></a> `isActive` | `boolean` | `true` while the app is foregrounded and receiving input. |

***

### Bridge

Contract that all modules depend on. Allows injection of FakeBridge in tests.

Messages are JSON-RPC 2.0 over the WebView: requests carry an `id` and get exactly one
response; notifications carry no `id` and fan out to every `on()` subscriber.

#### Methods

##### call()

```ts
call<T>(method, params?): Promise<T>;
```

Sends a request to the native shell and resolves with its `result`. Rejects with a
[CapsuleError](#capsuleerror) carrying the native error code — `BRIDGE_UNAVAILABLE` outside the shell.

###### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` | `unknown` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `method` | `string` |
| `params?` | `unknown` |

###### Returns

`Promise`\<`T`\>

##### on()

```ts
on(method, handler): () => void;
```

Subscribes to a native notification; returns the function that unsubscribes.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `method` | `string` |
| `handler` | [`NotificationHandler`](#notificationhandler) |

###### Returns

() => `void`

***

### CameraModule

#### Methods

##### capturePhoto()

```ts
capturePhoto(options?): Promise<CameraPhoto>;
```

Launch the system camera and return the captured photo. Requires the
`CAMERA` runtime permission — rejects with `PERMISSION_DENIED` if refused,
`OPERATION_CANCELLED` if the user backs out.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`CaptureOptions`](#captureoptions) |

###### Returns

`Promise`\<[`CameraPhoto`](#cameraphoto)\>

##### pickImage()

```ts
pickImage(options?): Promise<CameraPhoto>;
```

Pick an existing image from the device. Uses the system photo picker, so it
needs no storage permission. Rejects with `OPERATION_CANCELLED` if dismissed.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`PickOptions`](#pickoptions) |

###### Returns

`Promise`\<[`CameraPhoto`](#cameraphoto)\>

***

### CameraPhoto

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-dataurl"></a> `dataUrl?` | `string` | Present only when `result: 'dataUrl'` was requested. |
| <a id="property-format"></a> `format` | [`ImageFormat`](#imageformat) | - |
| <a id="property-height"></a> `height` | `number` | - |
| <a id="property-size"></a> `size` | `number` | Size of the encoded image in bytes. |
| <a id="property-webpath"></a> `webPath` | `string` | Directly usable as an `<img src>` (see [ResultType](#resulttype)). |
| <a id="property-width"></a> `width` | `number` | - |

***

### Capabilities

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-capabilities"></a> `capabilities` | [`CapabilityMap`](#capabilitymap) | Per-capability native version, e.g. `{ app: 1, camera: 1, filesystem: 1 }`. |

***

### CapabilitiesModule

Reports which native capabilities — and at what version — the **installed
shell** provides. This is the OTA-gating contract (Phase 6): a Server Code
Push bundle can refuse to call a native API the user's shell predates, rather
than failing at runtime with `METHOD_NOT_FOUND`. Each native module declares
its own version; the shell answers the aggregate here.

#### Methods

##### get()

```ts
get(): Promise<Capabilities>;
```

Fetch the full capability → version map from the shell.

###### Returns

`Promise`\<[`Capabilities`](#capabilities)\>

##### has()

```ts
has(name, minVersion?): Promise<boolean>;
```

`true` if the shell provides `name` at version ≥ `minVersion` (default 1).

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `name` | `string` | `undefined` |
| `minVersion` | `number` | `1` |

###### Returns

`Promise`\<`boolean`\>

***

### CaptureOptions

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-facing"></a> `facing?` | `"front"` \| `"back"` | Preferred lens. Best-effort — the system camera ultimately decides. Default 'back'. |
| <a id="property-maxheight"></a> `maxHeight?` | `number` | - |
| <a id="property-maxwidth"></a> `maxWidth?` | `number` | Downscale so the image's longest edge is at most this many pixels. |
| <a id="property-quality"></a> `quality?` | `number` | JPEG/WebP compression quality, 0..1. Default 0.9. |
| <a id="property-result"></a> `result?` | [`ResultType`](#resulttype) | How to return the bytes. Default 'webPath'. |
| <a id="property-savetogallery"></a> `saveToGallery?` | `boolean` | Also persist the captured photo to the device gallery. Default false. |

***

### ClipboardModule

The system clipboard (plain text). Use the `clipboard` singleton.

#### Methods

##### read()

```ts
read(): Promise<string | null>;
```

Returns the clipboard text, or `null` when the clipboard is empty or holds no text.

###### Returns

`Promise`\<`string` \| `null`\>

##### write()

```ts
write(text): Promise<void>;
```

Replaces the clipboard contents with `text`.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

###### Returns

`Promise`\<`void`\>

***

### CodeSyncCheckResult

Result of a manual update check.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-status-1"></a> `status` | [`CodeSyncStatus`](#codesyncstatus) | Current status of the update check. |
| <a id="property-update"></a> `update?` | [`CodeSyncUpdate`](#codesyncupdate) | Information about an available update, if any. |

***

### CodeSyncModule

#### Methods

##### applyUpdate()

```ts
applyUpdate(): Promise<void>;
```

Apply a previously downloaded update.
This should be called after `checkForUpdate()` returns an update and the user has chosen to install it.

###### Returns

`Promise`\<`void`\>

A promise that resolves when the update has been applied.

##### checkForUpdate()

```ts
checkForUpdate(): Promise<CodeSyncUpdate | null>;
```

Manually check for an available OTA update.

###### Returns

`Promise`\<[`CodeSyncUpdate`](#codesyncupdate) \| `null`\>

A promise that resolves to information about an available update, or null if no update is available.

##### getStatus()

```ts
getStatus(): Promise<CodeSyncStatus>;
```

Get the current status of the OTA update system.

###### Returns

`Promise`\<[`CodeSyncStatus`](#codesyncstatus)\>

A promise that resolves to the current status.

***

### CodeSyncUpdate

Information about an available update.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-buildnumber"></a> `buildNumber` | `number` | Build number of the available update. |
| <a id="property-mandatory"></a> `mandatory` | `boolean` | Whether the update is mandatory. |
| <a id="property-notes"></a> `notes?` | `string` | Release notes (if provided). |
| <a id="property-rolloutpercent"></a> `rolloutPercent` | `number` | Rollout percentage for this update. |
| <a id="property-version"></a> `version` | `string` | Version string (semver) of the available update. |

***

### DbModule

#### Methods

##### schema()

```ts
schema(version, migrate): void;
```

Registers migration `version` (an integer ≥ 1) for tables you manage with `db.sql`. Pending
migrations run in version order, each in its own transaction, before the next database
operation; the applied version is kept in SQLite's `PRAGMA user_version`. Add a new version
for each change — never edit one that has shipped.

If the database is already at a version newer than any registered (e.g. after an OTA rollback
to an older bundle), every operation fails with `SCHEMA_VERSION_REGRESSION`.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `version` | `number` |
| `migrate` | [`Migration`](#migration) |

###### Returns

`void`

##### sql()

```ts
sql<T>(strings, ...values): Promise<T>;
```

Runs one SQL statement. Interpolated values become bound parameters.

Resolves to the rows for a statement that returns columns (SELECT, PRAGMA, `RETURNING`…),
otherwise to a [SqlRunResult](#sqlrunresult).

```ts
const recent = await db.sql<Note[]>`SELECT * FROM notes WHERE ts > ${since} ORDER BY ts DESC`
await db.sql`UPDATE notes SET pinned = ${true} WHERE id = ${id}`
```

###### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` | [`SqlRunResult`](#sqlrunresult) \| [`SqlRow`](#sqlrow)[] |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `strings` | `TemplateStringsArray` |
| ...`values` | [`SqlValue`](#sqlvalue)[] |

###### Returns

`Promise`\<`T`\>

##### transaction()

```ts
transaction<T>(fn): Promise<T>;
```

Runs `fn` in a transaction: committed when it resolves, rolled back when it throws (the
error is rethrown). Resolves to `fn`'s result.

The database runs one thing at a time: while a transaction is open, other `db.sql` and
`db.transaction` calls wait for it. So inside `fn` use **`tx.sql`** — awaiting `db.sql` or a
nested `db.transaction` there would wait for the transaction it is part of, forever.

###### Type Parameters

| Type Parameter |
| ------ |
| `T` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `fn` | (`tx`) => `Promise`\<`T`\> |

###### Returns

`Promise`\<`T`\>

***

### DeviceInfo

What `device.getInfo()` reports about the device the app runs on.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-isvirtual"></a> `isVirtual` | `boolean` | `true` on an emulator or simulator. |
| <a id="property-manufacturer"></a> `manufacturer` | `string` | Device manufacturer, e.g. `Google`. |
| <a id="property-model"></a> `model` | `string` | Device model name, e.g. `Pixel 8` (Android `Build.MODEL`). |
| <a id="property-osversion"></a> `osVersion` | `string` | User-visible OS version, e.g. `15`. |
| <a id="property-platform"></a> `platform` | `"android"` \| `"ios"` \| `"web"` | Where the app is running; `web` is the browser fallback outside the shell. |
| <a id="property-sdkversion"></a> `sdkVersion` | `number` | Platform API level (Android `Build.VERSION.SDK_INT`). |
| <a id="property-webviewversion"></a> `webViewVersion` | `string` \| `null` | Version of the system WebView that renders the app, or `null` when it cannot be read. |

***

### DeviceModule

Device facts. Use the `device` singleton.

#### Methods

##### getInfo()

```ts
getInfo(): Promise<DeviceInfo>;
```

Reads the device facts once; they do not change while the app runs.

###### Returns

`Promise`\<[`DeviceInfo`](#deviceinfo)\>

***

### DirectoryOption

#### Extended by

- [`ReadFileOptions`](#readfileoptions)
- [`WriteFileOptions`](#writefileoptions)
- [`MkdirOptions`](#mkdiroptions)
- [`RmdirOptions`](#rmdiroptions)
- [`DownloadFileOptions`](#downloadfileoptions)

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-directory"></a> `directory?` | [`FilesystemDirectory`](#filesystemdirectory) | Logical root to resolve `path` against. Default `'data'`. |

***

### DownloadFileOptions

#### Extends

- [`DirectoryOption`](#directoryoption)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-directory-1"></a> `directory?` | [`FilesystemDirectory`](#filesystemdirectory) | Logical root to resolve `path` against. Default `'data'`. | [`DirectoryOption`](#directoryoption).[`directory`](#property-directory) |
| <a id="property-path"></a> `path` | `string` | Destination path, relative to `directory`. | - |
| <a id="property-recursive"></a> `recursive?` | `boolean` | Create missing parent directories. Default `true`. | - |
| <a id="property-url"></a> `url` | `string` | Remote URL to fetch. Requires the INTERNET permission (declared by the CLI). | - |

***

### FileEntry

One entry returned by [FilesystemModule.readdir](#readdir).

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-name"></a> `name` | `string` | Entry name (last path segment), not the full path. |
| <a id="property-size-1"></a> `size` | `number` | Size in bytes (0 for directories). |
| <a id="property-type"></a> `type` | `"file"` \| `"directory"` | - |
| <a id="property-uri"></a> `uri` | `string` | Directly usable as a fetch/`<img src>` target where supported. |

***

### FileStat

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-mtime"></a> `mtime` | `number` | Last-modified time, epoch milliseconds. |
| <a id="property-size-2"></a> `size` | `number` | Size of the encoded file in bytes (0 for directories). |
| <a id="property-type-1"></a> `type` | `"file"` \| `"directory"` | - |
| <a id="property-uri-1"></a> `uri` | `string` | - |

***

### FilesystemModule

App-private filesystem. Foundational native API: later capabilities
(downloads, media serving, SQLite) build on it. Errors reject with a
[CapsuleError](#capsuleerror): `FILE_NOT_FOUND` (5001), `FILE_IO_ERROR` (5002),
`PATH_NOT_ALLOWED` (5003 — a path escaping its directory root).

#### Methods

##### appendFile()

```ts
appendFile(
   path, 
   data, 
   options?
): Promise<void>;
```

Append `data` to a file, creating it (and parents) if needed.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |
| `data` | `string` |
| `options?` | [`WriteFileOptions`](#writefileoptions) |

###### Returns

`Promise`\<`void`\>

##### deleteFile()

```ts
deleteFile(path, options?): Promise<void>;
```

Delete a single file. Rejects with `FILE_NOT_FOUND` if it does not exist.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |
| `options?` | [`DirectoryOption`](#directoryoption) |

###### Returns

`Promise`\<`void`\>

##### downloadFile()

```ts
downloadFile(options): Promise<FileStat>;
```

Download a remote URL straight to a file, bypassing the JS bridge for the bytes.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`DownloadFileOptions`](#downloadfileoptions) |

###### Returns

`Promise`\<[`FileStat`](#filestat)\>

##### getUri()

```ts
getUri(path, options?): Promise<string>;
```

Resolve the platform URI for a path without touching the filesystem.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |
| `options?` | [`DirectoryOption`](#directoryoption) |

###### Returns

`Promise`\<`string`\>

##### mkdir()

```ts
mkdir(path, options?): Promise<void>;
```

Create a directory.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |
| `options?` | [`MkdirOptions`](#mkdiroptions) |

###### Returns

`Promise`\<`void`\>

##### readdir()

```ts
readdir(path, options?): Promise<FileEntry[]>;
```

List the entries of a directory.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |
| `options?` | [`DirectoryOption`](#directoryoption) |

###### Returns

`Promise`\<[`FileEntry`](#fileentry)[]\>

##### readFile()

```ts
readFile(path, options?): Promise<string>;
```

Read a file and return its contents decoded per `options.encoding`.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |
| `options?` | [`ReadFileOptions`](#readfileoptions) |

###### Returns

`Promise`\<`string`\>

##### rmdir()

```ts
rmdir(path, options?): Promise<void>;
```

Remove a directory (empty unless `recursive: true`).

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |
| `options?` | [`RmdirOptions`](#rmdiroptions) |

###### Returns

`Promise`\<`void`\>

##### stat()

```ts
stat(path, options?): Promise<FileStat>;
```

Stat a file or directory. Rejects with `FILE_NOT_FOUND` if absent.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |
| `options?` | [`DirectoryOption`](#directoryoption) |

###### Returns

`Promise`\<[`FileStat`](#filestat)\>

##### writeFile()

```ts
writeFile(
   path, 
   data, 
   options?
): Promise<{
  uri: string;
}>;
```

Write `data` to a file, creating it (and parents) if needed. Returns its URI.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |
| `data` | `string` |
| `options?` | [`WriteFileOptions`](#writefileoptions) |

###### Returns

`Promise`\<\{
  `uri`: `string`;
\}\>

***

### GeolocationModule

Device location. Use the `geolocation` singleton; needs the location permission.

#### Methods

##### getCurrentPosition()

```ts
getCurrentPosition(options?): Promise<GeolocationPosition>;
```

Gets one fresh location fix. Rejects with `PERMISSION_DENIED` or `LOCATION_UNAVAILABLE`.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`GeolocationOptions`](#geolocationoptions) |

###### Returns

`Promise`\<[`GeolocationPosition`](#geolocationposition)\>

##### watchPosition()

```ts
watchPosition(callback, options?): () => void;
```

Calls `callback` with each new fix until the returned function is called.
Only the browser fallback implements it today; in the Android shell the watch call fails and
the subscription is dropped (`capabilities` reports what the shell provides).

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `callback` | (`position`) => `void` |
| `options?` | [`GeolocationOptions`](#geolocationoptions) |

###### Returns

() => `void`

***

### GeolocationOptions

Options in the browser Geolocation API shape. The browser fallback honours them; the Android
shell currently ignores them and always asks for a high-accuracy fix.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-enablehighaccuracy"></a> `enableHighAccuracy?` | `boolean` |
| <a id="property-maximumage"></a> `maximumAge?` | `number` |
| <a id="property-timeout"></a> `timeout?` | `number` |

***

### GeolocationPosition

A location fix, shaped like the browser `GeolocationPosition`.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-coords"></a> `coords` | `object` | - |
| `coords.accuracy` | `number` | Horizontal accuracy radius in metres. |
| `coords.altitude` | `number` \| `null` | Metres above the WGS 84 ellipsoid, or `null` when unknown. |
| `coords.altitudeAccuracy` | `number` \| `null` | - |
| `coords.heading` | `number` \| `null` | - |
| `coords.latitude` | `number` | Degrees, WGS 84. |
| `coords.longitude` | `number` | Degrees, WGS 84. |
| `coords.speed` | `number` \| `null` | - |
| <a id="property-timestamp"></a> `timestamp` | `number` | When the fix was taken, in milliseconds since the Unix epoch. |

***

### HapticsModule

Haptic feedback. Use the `haptics` singleton.

#### Methods

##### vibrate()

```ts
vibrate(style?): Promise<void>;
```

Plays one haptic effect; does nothing on devices without a vibrator.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `style` | [`HapticStyle`](#hapticstyle) | `'medium'` |

###### Returns

`Promise`\<`void`\>

***

### MkdirOptions

#### Extends

- [`DirectoryOption`](#directoryoption)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-directory-2"></a> `directory?` | [`FilesystemDirectory`](#filesystemdirectory) | Logical root to resolve `path` against. Default `'data'`. | [`DirectoryOption`](#directoryoption).[`directory`](#property-directory) |
| <a id="property-recursive-1"></a> `recursive?` | `boolean` | Create missing intermediate directories. Default `true`. | - |

***

### NetworkModule

Network reachability + change feed. Mirrors [AppModule](#appmodule): a request/
response query plus a push subscription.

- [getStatus](#getstatus-1) — read the current reachability on demand.
- [onStatusChange](#onstatuschange) — subscribe to transitions. There is **no replay on
  subscribe** (consistent with `app.onStateChange`): call [getStatus](#getstatus-1)
  once at startup if you need the initial value.

#### Methods

##### getStatus()

```ts
getStatus(): Promise<NetworkStatus>;
```

Query the current reachability on demand.

###### Returns

`Promise`\<[`NetworkStatus`](#networkstatus)\>

##### onStatusChange()

```ts
onStatusChange(callback): () => void;
```

Subscribe to every connectivity transition. Returns an unsubscribe fn.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `callback` | (`status`) => `void` |

###### Returns

() => `void`

***

### NetworkStatus

A snapshot of network reachability.

`connected` is the single bit both platforms agree on; `connectionType`
refines it. The invariant `connectionType === 'none' ⇔ !connected` always
holds — a `none` transport means offline, and any other transport means online.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-connected"></a> `connected` | `boolean` | `true` while the device has a usable internet connection. |
| <a id="property-connectiontype"></a> `connectionType` | [`ConnectionType`](#connectiontype) | The active transport, or `none` when offline / `unknown` when undetermined. |

***

### NotificationChannel

An Android notification channel (API 26+). Channel ops are **no-ops on iOS**,
which has no channel concept — calling them is safe and simply does nothing.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-description"></a> `description?` | `string` | - |
| <a id="property-id"></a> `id` | `string` | - |
| <a id="property-importance"></a> `importance` | `"default"` \| `"min"` \| `"low"` \| `"high"` \| `"max"` | - |
| <a id="property-lightcolor"></a> `lightColor?` | `string` | Hex `#RRGGBB` for the notification LED (when the device has one). |
| <a id="property-lights"></a> `lights?` | `boolean` | - |
| <a id="property-name-1"></a> `name` | `string` | - |
| <a id="property-sound"></a> `sound?` | `string` | - |
| <a id="property-vibration"></a> `vibration?` | `boolean` | - |

***

### PickOptions

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-maxheight-1"></a> `maxHeight?` | `number` | - |
| <a id="property-maxwidth-1"></a> `maxWidth?` | `number` | - |
| <a id="property-quality-1"></a> `quality?` | `number` | JPEG/WebP re-compression quality, 0..1. Default 0.9. |
| <a id="property-result-1"></a> `result?` | [`ResultType`](#resulttype) | How to return the bytes. Default 'webPath'. |

***

### PushMessage

A push message, as it arrives in the foreground ([PushModule.onMessage](#onmessage))
or behind a tap ([PushModule.onNotificationTap](#onnotificationtap) /
[PushModule.getLaunchNotification](#getlaunchnotification)).

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-badge"></a> `badge?` | `number` | iOS only — the badge count the server requested. |
| <a id="property-body"></a> `body?` | `string` | - |
| <a id="property-data"></a> `data?` | `Record`\<`string`, `string`\> | Custom key-value data payload from the server. |
| <a id="property-id-1"></a> `id` | `string` | - |
| <a id="property-launchnotification"></a> `launchNotification?` | `boolean` | `true` when this message caused the app to launch or resume (a tap). |
| <a id="property-sound-1"></a> `sound?` | `string` | - |
| <a id="property-title-1"></a> `title?` | `string` | - |

***

### PushModule

Remote push notifications (FCM / APNs).

**Tap routing mirrors `app` deep links** (the same cold/warm split #3 proved on
device): a tap on a notification that *cold-launches* the app surfaces through
the consume-once [getLaunchNotification](#getlaunchnotification); a tap while the app is already
running/backgrounded fires [onNotificationTap](#onnotificationtap). Route on both at startup
to cover every entry path, just like `app.getLaunchUrl` + `app.onUrlOpen`:

```ts
const { message } = await push.getLaunchNotification()
if (message) route(message)               // launched by a notification tap
push.onNotificationTap((msg) => route(msg)) // taps while running
push.onMessage((msg) => toast(msg))         // foreground arrivals
```

Channel methods are Android-only (API 26+) and silently no-op on iOS.

#### Methods

##### checkPermissions()

```ts
checkPermissions(): Promise<{
  notifications: PermissionStatus;
}>;
```

Read the current notification permission without prompting.

###### Returns

`Promise`\<\{
  `notifications`: [`PermissionStatus`](#permissionstatus);
\}\>

##### createChannel()

```ts
createChannel(channel): Promise<void>;
```

Create (or update) an Android notification channel. No-op on iOS.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `channel` | [`NotificationChannel`](#notificationchannel) |

###### Returns

`Promise`\<`void`\>

##### getLaunchNotification()

```ts
getLaunchNotification(): Promise<{
  message: PushMessage | null;
}>;
```

The notification tap that *cold-launched* the app, or `null` for a normal
launch. Consume-once: a second call resolves `null`. Mirrors
[AppModule.getLaunchUrl](#getlaunchurl) — see the class doc for the get-then-subscribe
startup pattern.

###### Returns

`Promise`\<\{
  `message`: [`PushMessage`](#pushmessage) \| `null`;
\}\>

##### listChannels()

```ts
listChannels(): Promise<NotificationChannel[]>;
```

List the app's Android notification channels. Resolves `[]` on iOS.

###### Returns

`Promise`\<[`NotificationChannel`](#notificationchannel)[]\>

##### onMessage()

```ts
onMessage(callback): Unsubscribe;
```

Subscribe to push messages arriving while the app is foregrounded. Returns an unsubscribe fn.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `callback` | (`message`) => `void` |

###### Returns

[`Unsubscribe`](#unsubscribe)

##### onNotificationTap()

```ts
onNotificationTap(callback): Unsubscribe;
```

Subscribe to taps on notifications while the app is running/backgrounded (warm).

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `callback` | (`message`) => `void` |

###### Returns

[`Unsubscribe`](#unsubscribe)

##### onRegistrationError()

```ts
onRegistrationError(callback): Unsubscribe;
```

Subscribe to asynchronous registration failures (e.g. an FCM token refresh error).

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `callback` | (`error`) => `void` |

###### Returns

[`Unsubscribe`](#unsubscribe)

##### register()

```ts
register(): Promise<PushToken>;
```

Register for remote push. Resolves the platform token, or rejects `PUSH_REGISTRATION_FAILED`.

###### Returns

`Promise`\<[`PushToken`](#pushtoken)\>

##### removeAllDeliveredNotifications()

```ts
removeAllDeliveredNotifications(): Promise<void>;
```

Clear every notification this app has posted to the tray/Notification Center.

###### Returns

`Promise`\<`void`\>

##### removeChannel()

```ts
removeChannel(id): Promise<void>;
```

Delete an Android notification channel by id. No-op on iOS.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

`Promise`\<`void`\>

##### requestPermissions()

```ts
requestPermissions(): Promise<{
  notifications: PermissionStatus;
}>;
```

Prompt for notification permission (Android 13+ / iOS). Returns the resulting status.

###### Returns

`Promise`\<\{
  `notifications`: [`PermissionStatus`](#permissionstatus);
\}\>

***

### PushToken

A remote-push registration token.

- `android` — an FCM registration token.
- `ios` — an APNs device token (Phase 4).

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-platform-1"></a> `platform` | `"android"` \| `"ios"` | - |
| <a id="property-value"></a> `value` | `string` | FCM registration token (Android) or APNs device token (iOS). |

***

### ReadFileOptions

#### Extends

- [`DirectoryOption`](#directoryoption)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-directory-3"></a> `directory?` | [`FilesystemDirectory`](#filesystemdirectory) | Logical root to resolve `path` against. Default `'data'`. | [`DirectoryOption`](#directoryoption).[`directory`](#property-directory) |
| <a id="property-encoding"></a> `encoding?` | [`FileEncoding`](#fileencoding) | How to decode the bytes. Default `'utf8'`. | - |

***

### RmdirOptions

#### Extends

- [`DirectoryOption`](#directoryoption)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-directory-4"></a> `directory?` | [`FilesystemDirectory`](#filesystemdirectory) | Logical root to resolve `path` against. Default `'data'`. | [`DirectoryOption`](#directoryoption).[`directory`](#property-directory) |
| <a id="property-recursive-2"></a> `recursive?` | `boolean` | Remove a non-empty directory and its contents. Default `false`. | - |

***

### SqlRunResult

Result of a statement that returns no columns (INSERT, UPDATE, DELETE, DDL, …).

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-insertid"></a> `insertId?` | `number` | Rowid of the last row this statement inserted; absent if it inserted none. |
| <a id="property-rowsaffected"></a> `rowsAffected` | `number` | Rows inserted, updated or deleted, including by triggers. 0 for DDL. |

***

### StorageModule

Persistent string key/value storage, private to the app (Android `SharedPreferences`).
Survives restarts and app updates; cleared when the app is uninstalled. Use the `storage`
singleton. Store structured data as JSON, or use `db` for anything relational.

#### Methods

##### clear()

```ts
clear(): Promise<void>;
```

Deletes every key this app stored.

###### Returns

`Promise`\<`void`\>

##### get()

```ts
get(key): Promise<string | null>;
```

Returns the value stored under `key`, or `null` when there is none.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |

###### Returns

`Promise`\<`string` \| `null`\>

##### keys()

```ts
keys(): Promise<string[]>;
```

Lists every stored key, in no particular order.

###### Returns

`Promise`\<`string`[]\>

##### remove()

```ts
remove(key): Promise<void>;
```

Deletes `key`; a missing key is not an error.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |

###### Returns

`Promise`\<`void`\>

##### set()

```ts
set(key, value): Promise<void>;
```

Stores `value` under `key`, replacing any previous value.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |
| `value` | `string` |

###### Returns

`Promise`\<`void`\>

***

### Transaction

The handle a [DbModule.transaction](#transaction) callback runs its statements on.

#### Methods

##### sql()

```ts
sql<T>(strings, ...values): Promise<T>;
```

###### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` | [`SqlRunResult`](#sqlrunresult) \| [`SqlRow`](#sqlrow)[] |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `strings` | `TemplateStringsArray` |
| ...`values` | [`SqlValue`](#sqlvalue)[] |

###### Returns

`Promise`\<`T`\>

***

### UrlOpenEvent

Payload for a deep link / universal link delivered while the app is running.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-url-1"></a> `url` | `string` | The full incoming URL, e.g. `myapp://order/42` or `https://acme.com/order/42`. |

***

### WriteFileOptions

#### Extends

- [`DirectoryOption`](#directoryoption)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-directory-5"></a> `directory?` | [`FilesystemDirectory`](#filesystemdirectory) | Logical root to resolve `path` against. Default `'data'`. | [`DirectoryOption`](#directoryoption).[`directory`](#property-directory) |
| <a id="property-encoding-1"></a> `encoding?` | [`FileEncoding`](#fileencoding) | How `data` is encoded. Default `'utf8'`. | - |
| <a id="property-recursive-3"></a> `recursive?` | `boolean` | Create missing parent directories. Default `true`. | - |

## Type Aliases

### AiFinishReason

```ts
type AiFinishReason = "stop" | "length" | "other";
```

`length` — `maxTokens` cut the reply short.

***

### AiStatus

```ts
type AiStatus = "ready" | "downloadable" | "downloading" | "unavailable";
```

- `ready` — `generate`/`stream` work now.
- `downloadable` — supported, but the model must be downloaded first: call [AiModule.prepare](#prepare).
- `downloading` — the model download is in progress; [AiModule.prepare](#prepare) waits for it.
- `unavailable` — not supported here; `reason` says why.

***

### AiTier

```ts
type AiTier = "os-native" | "bundled" | "cloud" | "unavailable";
```

Which kind of backend serves AI requests (adr-003):

- `os-native` — the OS model: Gemini Nano via AICore (Android), Apple Foundation Models (iOS).
  **Flagships only** (Pixel 8+, Galaxy S24+, iPhone 15 Pro+ …) — most devices don't have it.
- `bundled` — a small model shipped with the app (Phase 6, not yet available).
- `cloud` — Capsule OTA cloud inference (Phase 6, not yet available).
- `unavailable` — no tier can serve on this device / shell build.

***

### AlertButtonRole

```ts
type AlertButtonRole = "default" | "cancel" | "destructive";
```

***

### CallRecord

```ts
type CallRecord = object;
```

One recorded bridge call.

#### Properties

##### method

```ts
method: string;
```

##### params

```ts
params: unknown;
```

***

### CapabilityMap

```ts
type CapabilityMap = Record<string, number>;
```

A map of native capability name → version implemented by the installed shell.
The version is bumped whenever a capability's native surface changes in a way
pushed JS might depend on (a new method, a changed payload).

***

### CodeSyncStatus

```ts
type CodeSyncStatus = 
  | "idle"
  | "checking"
  | "download ready"
  | "downloading"
  | "download failed"
  | "applying"
  | "update applied"
  | "error";
```

Status of an OTA update check.

***

### ConnectionType

```ts
type ConnectionType = "wifi" | "cellular" | "ethernet" | "none" | "unknown";
```

Transport currently carrying the connection.

- `wifi` / `cellular` / `ethernet` — connected over that transport.
- `none` — no connectivity. Always paired with `connected: false`.
- `unknown` — connected, but the transport could not be determined (e.g. the
  browser exposes `navigator.onLine` but not `navigator.connection`).

***

### FileEncoding

```ts
type FileEncoding = "utf8" | "base64";
```

How file bytes cross the bridge. `utf8` for text, `base64` for binary.

***

### FilesystemDirectory

```ts
type FilesystemDirectory = "data" | "cache" | "documents";
```

Logical storage location. Apps address files by `(directory, relative path)`
rather than absolute paths, so the same code resolves correctly on Android,
iOS, and the browser fallback.

All three map to **app-private** storage that is deliberately kept *outside*
the OTA-swappable bundle dirs (`www/` + `server/bundle.js`) — a code-push
bundle swap never touches user data written here.

- `data` — persistent app data. Survives until explicitly deleted.
- `cache` — same API, but the OS may reclaim it under storage pressure.
- `documents` — persistent, user-facing documents (export targets).

***

### HapticStyle

```ts
type HapticStyle = 
  | "light"
  | "medium"
  | "heavy"
  | "success"
  | "warning"
  | "error"
  | "selection";
```

Feedback pattern for `haptics.vibrate()`. Impact styles (`light`, `medium`, `heavy`) and
notification styles (`success`, `warning`, `error`) map to the closest platform effect;
`selection` is the lightest tick.

***

### ImageFormat

```ts
type ImageFormat = "jpeg" | "png" | "webp";
```

The format the returned image bytes are encoded in.

***

### Migration

```ts
type Migration = (tx) => Promise<void>;
```

One schema step for [DbModule.schema](#schema), run inside a transaction.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `tx` | [`Transaction`](#transaction-1) |

#### Returns

`Promise`\<`void`\>

***

### NotificationHandler

```ts
type NotificationHandler = (params) => void;
```

Receives the `params` of a native notification (an event pushed without a request).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `params` | `unknown` |

#### Returns

`void`

***

### PermissionStatus

```ts
type PermissionStatus = "granted" | "denied" | "prompt" | "prompt-with-rationale";
```

Permission status — aligned with the W3C Permissions API (mirrors 021-CoreAPI).

***

### ResultType

```ts
type ResultType = "webPath" | "dataUrl";
```

How the photo bytes are handed back to the caller.

- `webPath` — a string directly usable as an `<img src>`. Today this is a
  `data:` URL (works in dev, browser, and embedded modes alike); a future
  release serves it over the embedded HTTP server (`/capsule/media/...`) so
  large photos stay off the JS bridge — the field name will not change.
- `dataUrl` — forces a base64 `data:` URL and also populates `CameraPhoto.dataUrl`.

***

### SqlColumnValue

```ts
type SqlColumnValue = null | number | string | Uint8Array;
```

A value read back from a column (SQLite's storage classes).

***

### SqlRow

```ts
type SqlRow = Record<string, SqlColumnValue>;
```

One result row: column name → value. Alias duplicate column names (`a.id AS aId`).

***

### SqlValue

```ts
type SqlValue = null | number | string | boolean | Uint8Array | ArrayBuffer;
```

A value that can be bound to a `?` placeholder. Booleans are stored as 1 / 0.

***

### Unsubscribe

```ts
type Unsubscribe = () => void;
```

Returned by every event listener. Call it to stop receiving events.

#### Returns

`void`

## Variables

### ai

```ts
const ai: AiModule;
```

On-device AI (tiered) — `availability()`, `prepare()`, `generate()` with token streaming.

***

### AiMethods

```ts
const AiMethods: object;
```

Bridge method names — single source of truth, shared with WebBridge and the native handlers.
`streamChunk` is a **notification** (native → JS, no response), tagged with the `streamId`
the caller passed to `stream`.

#### Type Declaration

##### AVAILABILITY

```ts
readonly AVAILABILITY: "ai.availability" = 'ai.availability';
```

##### GENERATE

```ts
readonly GENERATE: "ai.generate" = 'ai.generate';
```

##### PREPARE

```ts
readonly PREPARE: "ai.prepare" = 'ai.prepare';
```

##### STREAM

```ts
readonly STREAM: "ai.stream" = 'ai.stream';
```

##### STREAM\_CHUNK

```ts
readonly STREAM_CHUNK: "ai.streamChunk" = 'ai.streamChunk';
```

***

### alerts

```ts
const alerts: AlertsModule;
```

Native alert dialogs: `alerts.show()` with buttons, roles and styles.

***

### app

```ts
const app: AppModule;
```

App lifecycle and deep links — state, pause/resume events, launch URL, `onUrlOpen`.

***

### AppMethods

```ts
const AppMethods: object;
```

Bridge method names — single source of truth, shared with WebBridge and the
native handlers. `stateChange` and `urlOpen` are **notifications** (native →
JS push, no response), the rest are request/response.

#### Type Declaration

##### GET\_LAUNCH\_URL

```ts
readonly GET_LAUNCH_URL: "app.getLaunchUrl" = 'app.getLaunchUrl';
```

##### GET\_STATE

```ts
readonly GET_STATE: "app.getState" = 'app.getState';
```

##### STATE\_CHANGE

```ts
readonly STATE_CHANGE: "app.stateChange" = 'app.stateChange';
```

##### URL\_OPEN

```ts
readonly URL_OPEN: "app.urlOpen" = 'app.urlOpen';
```

***

### bridge

```ts
const bridge: Bridge;
```

***

### camera

```ts
const camera: CameraModule;
```

Camera and photo library — `capturePhoto()` and `pickImage()`.

***

### capabilities

```ts
const capabilities: CapabilitiesModule;
```

Which native APIs (and versions) the running shell provides — `get()` / `has()`.

***

### CapabilitiesMethods

```ts
const CapabilitiesMethods: object;
```

#### Type Declaration

##### GET

```ts
readonly GET: "capsule.getCapabilities" = 'capsule.getCapabilities';
```

***

### CapsuleErrorCode

```ts
const CapsuleErrorCode: object;
```

Every error code the bridge can return, grouped in ranges by area (1xxx bridge, 2xxx
permission, 3xxx location, 4xxx media, 5xxx filesystem, 6xxx push, 7xxx AI, 8xxx database).
Compare a caught [CapsuleError](#capsuleerror)'s `code` against `CapsuleErrorCode.X.code`.

#### Type Declaration

##### AI\_GENERATION\_FAILED

```ts
readonly AI_GENERATION_FAILED: object;
```

A ready model errored mid-request.

###### AI\_GENERATION\_FAILED.code

```ts
readonly code: 7002 = 7002;
```

###### AI\_GENERATION\_FAILED.message

```ts
readonly message: "AI_GENERATION_FAILED" = 'AI_GENERATION_FAILED';
```

##### AI\_UNAVAILABLE

```ts
readonly AI_UNAVAILABLE: object;
```

No tier can generate here, or the model still needs `ai.prepare()`; the reason is in `data`.

###### AI\_UNAVAILABLE.code

```ts
readonly code: 7001 = 7001;
```

###### AI\_UNAVAILABLE.message

```ts
readonly message: "AI_UNAVAILABLE" = 'AI_UNAVAILABLE';
```

##### BRIDGE\_UNAVAILABLE

```ts
readonly BRIDGE_UNAVAILABLE: object;
```

Not running inside the Capsule shell (no native host), so there is no bridge to call.

###### BRIDGE\_UNAVAILABLE.code

```ts
readonly code: 1000 = 1000;
```

###### BRIDGE\_UNAVAILABLE.message

```ts
readonly message: "BRIDGE_UNAVAILABLE" = 'BRIDGE_UNAVAILABLE';
```

##### CAMERA\_UNAVAILABLE

```ts
readonly CAMERA_UNAVAILABLE: object;
```

The device has no usable camera, or no app can take the picture.

###### CAMERA\_UNAVAILABLE.code

```ts
readonly code: 4001 = 4001;
```

###### CAMERA\_UNAVAILABLE.message

```ts
readonly message: "CAMERA_UNAVAILABLE" = 'CAMERA_UNAVAILABLE';
```

##### FILE\_IO\_ERROR

```ts
readonly FILE_IO_ERROR: object;
```

Reading or writing failed (disk full, not a directory, …).

###### FILE\_IO\_ERROR.code

```ts
readonly code: 5002 = 5002;
```

###### FILE\_IO\_ERROR.message

```ts
readonly message: "FILE_IO_ERROR" = 'FILE_IO_ERROR';
```

##### FILE\_NOT\_FOUND

```ts
readonly FILE_NOT_FOUND: object;
```

The path does not exist.

###### FILE\_NOT\_FOUND.code

```ts
readonly code: 5001 = 5001;
```

###### FILE\_NOT\_FOUND.message

```ts
readonly message: "FILE_NOT_FOUND" = 'FILE_NOT_FOUND';
```

##### INTERNAL\_ERROR

```ts
readonly INTERNAL_ERROR: object;
```

The native handler failed unexpectedly.

###### INTERNAL\_ERROR.code

```ts
readonly code: 1003 = 1003;
```

###### INTERNAL\_ERROR.message

```ts
readonly message: "INTERNAL_ERROR" = 'INTERNAL_ERROR';
```

##### LOCATION\_UNAVAILABLE

```ts
readonly LOCATION_UNAVAILABLE: object;
```

No location fix could be obtained (services off, no signal, timeout).

###### LOCATION\_UNAVAILABLE.code

```ts
readonly code: 3001 = 3001;
```

###### LOCATION\_UNAVAILABLE.message

```ts
readonly message: "LOCATION_UNAVAILABLE" = 'LOCATION_UNAVAILABLE';
```

##### MEDIA\_PROCESSING\_FAILED

```ts
readonly MEDIA_PROCESSING_FAILED: object;
```

The photo was taken or picked but could not be decoded, resized or encoded.

###### MEDIA\_PROCESSING\_FAILED.code

```ts
readonly code: 4002 = 4002;
```

###### MEDIA\_PROCESSING\_FAILED.message

```ts
readonly message: "MEDIA_PROCESSING_FAILED" = 'MEDIA_PROCESSING_FAILED';
```

##### METHOD\_NOT\_FOUND

```ts
readonly METHOD_NOT_FOUND: object;
```

No native handler is registered for the method — the shell lacks this API or version.

###### METHOD\_NOT\_FOUND.code

```ts
readonly code: 1002 = 1002;
```

###### METHOD\_NOT\_FOUND.message

```ts
readonly message: "METHOD_NOT_FOUND" = 'METHOD_NOT_FOUND';
```

##### OPERATION\_CANCELLED

```ts
readonly OPERATION_CANCELLED: object;
```

The user dismissed a system UI (camera, picker, biometric prompt, …). Deliberately
cross-cutting: reused by every foreground API, not camera-specific.

###### OPERATION\_CANCELLED.code

```ts
readonly code: 2002 = 2002;
```

###### OPERATION\_CANCELLED.message

```ts
readonly message: "OPERATION_CANCELLED" = 'OPERATION_CANCELLED';
```

##### PARSE\_ERROR

```ts
readonly PARSE_ERROR: object;
```

The native side could not parse the request.

###### PARSE\_ERROR.code

```ts
readonly code: 1001 = 1001;
```

###### PARSE\_ERROR.message

```ts
readonly message: "PARSE_ERROR" = 'PARSE_ERROR';
```

##### PATH\_NOT\_ALLOWED

```ts
readonly PATH_NOT_ALLOWED: object;
```

A path that resolves outside its directory root (e.g. via `..`).

###### PATH\_NOT\_ALLOWED.code

```ts
readonly code: 5003 = 5003;
```

###### PATH\_NOT\_ALLOWED.message

```ts
readonly message: "PATH_NOT_ALLOWED" = 'PATH_NOT_ALLOWED';
```

##### PERMISSION\_DENIED

```ts
readonly PERMISSION_DENIED: object;
```

The user (or a policy) denied the runtime permission the call needs.

###### PERMISSION\_DENIED.code

```ts
readonly code: 2001 = 2001;
```

###### PERMISSION\_DENIED.message

```ts
readonly message: "PERMISSION_DENIED" = 'PERMISSION_DENIED';
```

##### PUSH\_REGISTRATION\_FAILED

```ts
readonly PUSH_REGISTRATION_FAILED: object;
```

Registering with the push service (FCM / APNs) failed; denial is `PERMISSION_DENIED`.

###### PUSH\_REGISTRATION\_FAILED.code

```ts
readonly code: 6001 = 6001;
```

###### PUSH\_REGISTRATION\_FAILED.message

```ts
readonly message: "PUSH_REGISTRATION_FAILED" = 'PUSH_REGISTRATION_FAILED';
```

##### SCHEMA\_VERSION\_REGRESSION

```ts
readonly SCHEMA_VERSION_REGRESSION: object;
```

The database's schema version is newer than every `db.schema()` the app registers
(e.g. an OTA rollback to an older bundle).

###### SCHEMA\_VERSION\_REGRESSION.code

```ts
readonly code: 8002 = 8002;
```

###### SCHEMA\_VERSION\_REGRESSION.message

```ts
readonly message: "SCHEMA_VERSION_REGRESSION" = 'SCHEMA_VERSION_REGRESSION';
```

##### SQL\_ERROR

```ts
readonly SQL_ERROR: object;
```

SQLite rejected the statement (syntax, constraint, missing table…); details in `data`.

###### SQL\_ERROR.code

```ts
readonly code: 8001 = 8001;
```

###### SQL\_ERROR.message

```ts
readonly message: "SQL_ERROR" = 'SQL_ERROR';
```

***

### clipboard

```ts
const clipboard: ClipboardModule;
```

System clipboard — `clipboard.read()` / `clipboard.write()`.

***

### codesync

```ts
const codesync: CodeSyncModule;
```

Over-the-air bundle updates — `checkForUpdate()`, `applyUpdate()`, `getStatus()`.

***

### CodeSyncMethods

```ts
const CodeSyncMethods: object;
```

Bridge method names for the CodeSync module — single source of truth, shared with WebBridge.

#### Type Declaration

##### APPLY\_UPDATE

```ts
readonly APPLY_UPDATE: "codesync.applyUpdate" = 'codesync.applyUpdate';
```

##### CHECK\_FOR\_UPDATE

```ts
readonly CHECK_FOR_UPDATE: "codesync.checkForUpdate" = 'codesync.checkForUpdate';
```

##### GET\_STATUS

```ts
readonly GET_STATUS: "codesync.getStatus" = 'codesync.getStatus';
```

***

### db

```ts
const db: DbModule;
```

On-device SQLite — tagged-template `` db.sql`…` `` (values always bound), `transaction()`, `schema()`.

***

### DbMethods

```ts
const DbMethods: object;
```

#### Type Declaration

##### BEGIN

```ts
readonly BEGIN: "db.begin" = 'db.begin';
```

##### COMMIT

```ts
readonly COMMIT: "db.commit" = 'db.commit';
```

##### ROLLBACK

```ts
readonly ROLLBACK: "db.rollback" = 'db.rollback';
```

##### SQL

```ts
readonly SQL: "db.sql" = 'db.sql';
```

***

### device

```ts
const device: DeviceModule;
```

Device facts — `device.getInfo()` (platform, OS version, model, …).

***

### filesystem

```ts
const filesystem: FilesystemModule;
```

App-sandboxed files — read, write, append, stat, list, mkdir/rmdir, delete, download.

***

### geolocation

```ts
const geolocation: GeolocationModule;
```

Device location — `getCurrentPosition()` and `watchPosition()`.

***

### haptics

```ts
const haptics: HapticsModule;
```

Haptic feedback — `haptics.vibrate(style)`.

***

### network

```ts
const network: NetworkModule;
```

Connectivity — `getStatus()` and `onStatusChange()`.

***

### NetworkMethods

```ts
const NetworkMethods: object;
```

Bridge method names — single source of truth, shared with WebBridge and the
native handlers. `statusChange` is a **notification** (native → JS push, no
response); `getStatus` is request/response.

#### Type Declaration

##### GET\_STATUS

```ts
readonly GET_STATUS: "network.getStatus" = 'network.getStatus';
```

##### STATUS\_CHANGE

```ts
readonly STATUS_CHANGE: "network.statusChange" = 'network.statusChange';
```

***

### push

```ts
const push: PushModule;
```

Push notifications — permissions, registration token, channels, message and tap events.

***

### PushMethods

```ts
const PushMethods: object;
```

Bridge method names — single source of truth, shared with WebBridge and the
native handlers. The first block is request/response; the second block is
**notifications** (native → JS push, no response) delivered over the shared
`BridgeEventEmitter`, exactly like `network.statusChange` / `app.urlOpen`.

#### Type Declaration

##### CHECK\_PERMISSIONS

```ts
readonly CHECK_PERMISSIONS: "push.checkPermissions" = 'push.checkPermissions';
```

##### CREATE\_CHANNEL

```ts
readonly CREATE_CHANNEL: "push.createChannel" = 'push.createChannel';
```

##### GET\_LAUNCH\_NOTIFICATION

```ts
readonly GET_LAUNCH_NOTIFICATION: "push.getLaunchNotification" = 'push.getLaunchNotification';
```

##### LIST\_CHANNELS

```ts
readonly LIST_CHANNELS: "push.listChannels" = 'push.listChannels';
```

##### MESSAGE

```ts
readonly MESSAGE: "push.message" = 'push.message';
```

##### NOTIFICATION\_TAP

```ts
readonly NOTIFICATION_TAP: "push.notificationTap" = 'push.notificationTap';
```

##### REGISTER

```ts
readonly REGISTER: "push.register" = 'push.register';
```

##### REGISTRATION\_ERROR

```ts
readonly REGISTRATION_ERROR: "push.registrationError" = 'push.registrationError';
```

##### REMOVE\_ALL\_DELIVERED

```ts
readonly REMOVE_ALL_DELIVERED: "push.removeAllDeliveredNotifications" = 'push.removeAllDeliveredNotifications';
```

##### REMOVE\_CHANNEL

```ts
readonly REMOVE_CHANNEL: "push.removeChannel" = 'push.removeChannel';
```

##### REQUEST\_PERMISSIONS

```ts
readonly REQUEST_PERMISSIONS: "push.requestPermissions" = 'push.requestPermissions';
```

***

### storage

```ts
const storage: StorageModule;
```

Persistent key/value storage — `get`, `set`, `remove`, `keys`, `clear`.
