---
title: "Workflow: author a plugin"
audience: contributor
status: draft
---
# CONTEXT — author-plugin (stage contract)

Author a third-party SDK-wrapper plugin (community integration), distinct from a core
native API: it ships outside `@capsule/core` and is wired in via `capsule.config.ts`.
Area index: `../CONTEXT.md`.

> **Status: forward contract.** The plugin model is specified in `plugin-authoring.md`, but
> the `capsule plugin check|call|publish` CLI tooling is **not implemented yet** (post-Phase-1).
> Steps 8+ describe the intended flow; verify the CLI supports them before relying on it.

## Inputs (load these first)

| Source | Why |
|--------|-----|
| `../../plugin-authoring.md` | The authoring guide: file structure, manifest fields, the worked example. |
| `../../../guide/plugins.md` | Dispatch model, binary vs source mode, language feasibility, what already exists. |

## Process (ordered)

1. **Scaffold** → `capsule-plugins/<name>/` with `capsule-plugin.json`, `android/<Name>.kt`, `ios/<Name>.swift`, `web/index.ts`.
2. **Manifest** → `capsule-plugin.json`: name, version, platforms, `android.{permissions,dependencies,minSdk}`, `ios.infoPlist`, `sourceRepo` (npm mode). Fields per `031` §"Plugin Manifest".
3. **Android** → `android/<Name>.kt` extends `CapsulePlugin(bridge)`; methods `@BridgeMethod`, params via `call.getString()`/…, respond with `call.resolve()` / `call.reject(code,msg)`.
4. **iOS** → `ios/<Name>.swift` — same `CapsulePlugin` + `@BridgeMethod` API.
5. **Web bridge** → `web/index.ts` exports a typed object calling `bridge.call('<name>.method', …)`, JSDoc'd.
6. **Wire in** → add to the `plugins` array in `capsule.config.ts` (`'./capsule-plugins/<name>'` source mode, or `'@scope/<name>'` npm mode).
7. **Sync** → `capsule sync` merges deps into `.capsule/android/build.gradle.kts` and permissions into the manifest.
8. **AUDIT** → `capsule plugin check <name>` (every `@BridgeMethod` has a matching web export); `capsule plugin call <name> <method> '<json>'` exercises it on a running emulator without writing JS.

## Outputs

`capsule-plugins/<name>/{capsule-plugin.json,android,ios,web}`; regenerated `.capsule/android/`
(gradle + manifest). Optional: published npm package when `@scope/` + `sourceRepo` are set
(`capsule plugin publish`).

## Checkpoints (human)

- `capsule plugin check` clean and `capsule plugin call` resolves on the emulator.
- **Device build/test handed to the user**: `capsule build android` produces a valid APK, app
  loads, plugin callable, no crash.
- Decide binary vs source distribution up front (`030` §"Plugin Dispatch") — it changes packaging.
