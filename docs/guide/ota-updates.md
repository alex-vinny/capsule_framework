---
title: "Over-the-air updates"
audience: app-developer
status: current
code:
  - packages/core/src/codesync.ts
  - packages/cli/src/commands/codesync.ts
  - packages/codesync-api/src/**
tests:
  - packages/core/src/__tests__/codesync.test.ts
---
# Over-the-air updates (CodeSync)

> Ship web-layer fixes to installed apps without a store review. This page is the how-to for app
> developers. The protocol, server and on-device internals are in
> [codesync-internals.md](../contributing/codesync-internals.md).

CodeSync replaces the **web bundle** an installed app runs: everything in `www/` (HTML, JS, CSS,
assets) plus the QuickJS route bundle `server/bundle.js`. Both always travel together as one ZIP,
so the client and its `/api` routes can never drift apart.

Anything native needs a store release instead: the Capsule shell version, permissions, plugins,
native SDK changes. See [publishing.md](publishing.md) for the two release layers, and
[ota-policy-and-liability.md](../project/business/ota-policy-and-liability.md) for what the stores
allow you to change over the air.

---

## Status: what works today

CodeSync is being built in pieces. Each piece below exists and is tested on its own, but
**an update does not reach a device end to end yet**. The gaps are listed in
[codesync-internals.md § Known gaps](../contributing/codesync-internals.md#known-gaps).

| Piece | State |
|---|---|
| `codeSync` block in `capsule.config.ts` | Built. `enabled`, `url` and `apiKey` are read by `capsule codesync publish`; the other fields are typed but not read yet. |
| `capsule codesync publish` | Built: builds, zips and uploads one bundle. |
| Self-hosted server `@capsule/codesync-api` | Built: a file-based server for one app (publish, channels, rollback, pause). |
| On-device client (Android) | Built and unit-tested: check, rollout, download, SHA-256 check, atomic install. Not switched on in apps that `capsule sync` generates. |
| On-device client (iOS) | Client core built and tested on Linux; not wired into the iOS bridge yet. |
| Automatic crash-loop rollback | Built (Android). |
| `codesync` JS module | Built: `checkForUpdate()`, `getStatus()`, `applyUpdate()`. |
| Hosted service (Capsule Cloud), dashboard, staged rollouts from the CLI, targeting, mandatory updates, differential updates | Planned (Phase 6). |

---

## 1. Pick a server

You need a CodeSync server the app can reach and the CLI can publish to.

- **Self-host:** run `@capsule/codesync-api` from this repo (licensed AGPL-3.0). It stores
  bundles on local disk, so one small instance is enough for development and small fleets.
- **Hosted:** a managed Capsule Cloud service is planned (Phase 6). The server is open source, so
  you can always run your own instead.

Run the self-hosted server locally:

```sh
pnpm --filter @capsule/codesync-api run build
CODESYNC_API_KEY=dev-local pnpm --filter @capsule/codesync-api run start   # listens on :3000
```

On Windows PowerShell set the key first: `$env:CODESYNC_API_KEY='dev-local'`. Bundles and the
release manifest land in `packages/codesync-api/storage/`, or in `CODESYNC_STORAGE_DIR` when set.

---

## 2. Configure the app

Add a `codeSync` block to `capsule.config.ts`:

```typescript
export default {
  appId: 'com.example.myapp',
  appName: 'My App',
  version: { name: '1.0.1', buildNumber: 2 },

  codeSync: {
    enabled: true,
    url: process.env.CODESYNC_URL,         // e.g. http://localhost:3000 or your own server
    apiKey: process.env.CODESYNC_API_KEY,  // publish-time only, never shipped in the app
  },
}
```

Keep the key out of git. Put it in `.env.local` (already in the template's `.gitignore`) or in
your CI secrets:

```sh
# .env.local
CODESYNC_URL=http://localhost:3000
CODESYNC_API_KEY=dev-local
```

The API key is used only by the CLI when you publish. It is never compiled into the app: devices
read updates without a key.

Every field, with its type: [config reference](../reference/generated/config.md) (`codeSync.*`).
`channel`, `strategy`, `checkOnForeground` and `mandatory` are accepted today but have no effect
yet. They are reserved for the update strategies described under
[Mandatory updates and strategies](#mandatory-updates-and-strategies).

---

## 3. Publish an update

```sh
capsule codesync publish --channel staging --notes "Fix checkout button"
```

The command:

1. builds the web app (`vite build`, or your `web.buildCommand`);
2. bundles the QuickJS routes into `server/bundle.js` when `src/server/routes/` exists;
3. writes a `capsule-bundle.json` manifest from `version.name` and `version.buildNumber`;
4. zips `www/`, `server/` and the manifest, and uploads the ZIP to the server.

**Bump the version before every publish.** The server keeps one bundle per `version.name` and
rejects a name it already has (HTTP 409). Raise `version.buildNumber` too: devices only install a
bundle whose build number is higher than the one they run.

All flags: [CLI reference](../reference/generated/cli.md) (`capsule codesync publish`).

---

## 4. Use channels

A channel is a named release line, such as `production` or `staging`. Each publish goes to one
channel (`--channel`, default `production`), and the server tracks the latest bundle per channel.

A typical flow is to publish to `staging`, test on internal builds that follow `staging`, then
publish the same version to `production`. A one-step `capsule codesync promote` is planned.

---

## 5. Roll back or pause

**Automatic.** If the app fails to start three times within 60 seconds after an update, the shell
restores the previous bundle on the next launch. A launch counts as healthy once the WebView
finishes loading the page, so your code needs no extra call. You never write rollback logic.

**Manual.** The self-hosted server rolls a channel back to its previous release, or pauses it.
There is no CLI command for this yet, so call the server directly:

```sh
curl -X POST http://localhost:3000/rollback -H "x-api-key: $CODESYNC_API_KEY" \
     -H "content-type: application/json" -d '{"channel":"production"}'
curl -X POST http://localhost:3000/pause    -H "x-api-key: $CODESYNC_API_KEY" \
     -H "content-type: application/json" -d '{"channel":"production"}'
curl -X POST http://localhost:3000/resume   -H "x-api-key: $CODESYNC_API_KEY" \
     -H "content-type: application/json" -d '{"channel":"production"}'
```

`GET /releases?channel=production` lists what was published. The full endpoint list is in
[codesync-internals.md § Self-hosted server](../contributing/codesync-internals.md#self-hosted-server).

---

## 6. Check for updates from app code

The shell checks on its own. Use the `codesync` module when you want your UI to react:

```typescript
import { codesync } from '@capsule/core'

const update = await codesync.checkForUpdate()   // CodeSyncUpdate | null
if (update) {
  console.log(`Version ${update.version} (build ${update.buildNumber}) is ready`)
  await codesync.applyUpdate()                   // takes effect on the next resume
}

const status = await codesync.getStatus()        // 'idle' | 'checking' | 'downloading' | …
```

The methods exist only when the shell was built with CodeSync enabled. Otherwise, and in the
browser during development, the call fails with `METHOD_NOT_FOUND` (1002). Types: [core API reference](../reference/generated/core/README.md).

---

## Mandatory updates and strategies

**Planned.** These options are defined in the config type but not implemented yet:

| Option | Planned behaviour |
|---|---|
| `strategy: 'background'` | Download silently, apply on the next resume. |
| `strategy: 'immediate'` | Prompt the user and reload now. |
| `strategy: 'on-next-launch'` | Apply on the next cold start only. |
| `checkOnForeground` | Check every time the app returns to the foreground. |
| `mandatory` | Treat updates as required unless a bundle says otherwise. |

The device already receives a per-bundle `mandatory` flag and rollout percentage from the check
response (see [codesync-internals.md](../contributing/codesync-internals.md#update-check-endpoint)),
so these options build on data that is already on the wire.

---

## Self-hosting or hosted: what changes

| | Self-hosted `@capsule/codesync-api` | Capsule Cloud (planned) |
|---|---|---|
| Runs on | Your machine or server, one process | Managed service |
| Storage | Local disk (`storage/`) | Object storage and CDN |
| Access | One shared API key (`CODESYNC_API_KEY`) | Per-organization keys from the portal |
| Rollouts, targeting, dashboard | Not available | Planned |
| License | AGPL-3.0 | Service terms |

The portal and cloud control-plane design is in
[server-design/overview.md](../project/server-design/overview.md).

---

## See also

- [codesync-internals.md](../contributing/codesync-internals.md): bundle format, wire protocol, server, device flow, known gaps, planned design.
- [publishing.md](publishing.md): store releases (Layer 1) alongside OTA (Layer 2).
- [0001-embedded-runtime.md](../decisions/0001-embedded-runtime.md): why the bundle can be replaced at all.
