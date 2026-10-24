# @capsule/core — the app-facing API

The TypeScript API that runs inside the app's web layer and talks to the native shell
over the bridge. Every API follows the **interface + provider + Fake** pattern
(pure-JS fake for tests/dev, native provider in the shell).

## Key files

| Path | API |
|---|---|
| `src/app.ts` | app lifecycle + deep links (`getState`, `onStateChange`, `getLaunchUrl`, `onUrlOpen`) |
| `src/camera.ts` | camera capture / image picker |
| `src/filesystem.ts` | filesystem (read/write/download; `data`/`cache`/`documents` roots) |
| `src/network.ts` | network status + change events |
| `src/push.ts` | push notifications (Slice 1 seam; FCM in Phase 3 #4) |
| `src/capabilities.ts` | CapabilityRegistry (`getCapabilities` — OTA gating) |
| `src/bridge.ts` · `src/web-bridge.ts` | native bridge protocol + web-side adapter |
| `src/router.ts`, `src/storage.ts`, `src/clipboard.ts`, `src/haptics.ts`, `src/device.ts`, `src/geolocation.ts`, `src/alerts.ts` | remaining API surfaces |
| `src/errors.ts` | shared error types · `src/testing/` · `src/__tests__/` | fake + vitest suites |

## Build & test

```bash
pnpm --filter @capsule/core run build
pnpm --filter @capsule/core run test
```

## Docs

Canonical references: [`docs/concepts/architecture.md`](../../docs/concepts/architecture.md) and
[`docs/reference/core-api.md`](../../docs/reference/core-api.md).
Adding a new native API end-to-end: [`docs/contributing/workflows/add-native-api/`](../../docs/contributing/workflows/add-native-api/).
