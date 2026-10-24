# Docs ↔ code map

> Generated from the front matter of every page under docs/ (scripts/gen/docs-map.mjs) by `pnpm gen` — do not edit.

66 pages (43 current · 5 draft · 8 planned · 10 record). How the metadata works and the checks that keep it true:
[conventions](../../_core/conventions.md#doc-metadata).

## Pages

| Page | Title | Audience | Status | Code | Tests |
|---|---|---|---|---|---|
| [CONTEXT.md](../../CONTEXT.md) | Context map | contributor | current | — | — |
| [_core/conventions.md](../../_core/conventions.md) | Documentation conventions | contributor | current | `scripts/docs-check.mjs`<br>`scripts/docs-lint/**`<br>`scripts/gen/docs-map.mjs` | `scripts/docs-lint/**/*.test.mjs` |
| [concepts/architecture.md](../../concepts/architecture.md) | Architecture | contributor | current | `packages/core/src/bridge.ts`<br>`packages/core/src/web-bridge.ts`<br>`packages/capsule-android/capsule/src/main/kotlin/dev/capsule/CapsuleActivity.kt` | `packages/core/src/__tests__/web-bridge.test.ts` |
| [concepts/capsule-vs-ionic-capacitor.md](../../concepts/capsule-vs-ionic-capacitor.md) | Capsule vs Ionic/Capacitor | everyone | current | — | — |
| [concepts/extensibility-and-positioning.md](../../concepts/extensibility-and-positioning.md) | Extensibility and positioning | maintainer | draft | — | — |
| [concepts/ionic-framework7-migration.md](../../concepts/ionic-framework7-migration.md) | Migrating Ionic and Framework7 apps | app-developer | planned | — | — |
| [concepts/primers/civetweb.md](../../concepts/primers/civetweb.md) | CivetWeb in Capsule | contributor | current | `packages/native/civetweb/**`<br>`packages/capsule-android/capsule/src/main/cpp/capsule_server_jni.c`<br>`packages/capsule-android/capsule/src/main/kotlin/dev/capsule/runtime/CivetwebServer.kt`<br>`packages/capsule-android/capsule/src/main/kotlin/dev/capsule/runtime/RequestRouter.kt`<br>`packages/capsule-ios/Sources/dev/capsule/runtime/CivetwebServer.swift`<br>`packages/capsule-ios/Sources/dev/capsule/runtime/RequestRouter.swift`<br>`Package.swift` | `packages/capsule-android/capsule/src/androidTest/kotlin/dev/capsule/runtime/CivetwebServerTest.kt`<br>`packages/capsule-android/capsule/src/test/kotlin/dev/capsule/runtime/RequestRouterTest.kt`<br>`packages/capsule-android/capsule/src/test/kotlin/dev/capsule/runtime/ParseHeadersTest.kt`<br>`packages/capsule-ios/Tests/CapsuleTests/runtime/CivetwebServerTests.swift`<br>`packages/capsule-ios/Tests/CapsuleTests/runtime/RequestRouterTests.swift` |
| [concepts/primers/index.md](../../concepts/primers/index.md) | Primers | contributor | current | — | — |
| [concepts/primers/jni-and-cpp.md](../../concepts/primers/jni-and-cpp.md) | JNI, C and C++ in Capsule | contributor | current | `packages/capsule-android/capsule/src/main/cpp/**`<br>`packages/capsule-android/capsule/src/main/kotlin/dev/capsule/runtime/QuickJSEngineImpl.kt` | — |
| [concepts/primers/kotlin-for-csharp-devs.md](../../concepts/primers/kotlin-for-csharp-devs.md) | Kotlin for C# and TypeScript developers | contributor | current | — | — |
| [concepts/primers/quickjs.md](../../concepts/primers/quickjs.md) | QuickJS in Capsule | contributor | current | `packages/native/quickjs/**`<br>`packages/capsule-android/capsule/src/main/cpp/quickjs_jni.c`<br>`packages/capsule-android/capsule/src/main/kotlin/dev/capsule/runtime/QuickJS*.kt`<br>`packages/core/src/router.ts` | `packages/capsule-android/capsule/src/androidTest/kotlin/dev/capsule/runtime/QuickJS*Test.kt` |
| [concepts/principles.md](../../concepts/principles.md) | Principles | everyone | current | — | — |
| [contributing/ci.md](../../contributing/ci.md) | CI | contributor | current | `.github/workflows/**`<br>`scripts/verify.mjs` | — |
| [contributing/codesync-internals.md](../../contributing/codesync-internals.md) | CodeSync internals | contributor | current | `packages/codesync-api/src/**`<br>`packages/codesync-api/api-spec.yaml`<br>`packages/cli/src/commands/codesync.ts`<br>`packages/cli/src/lib/zip.ts`<br>`packages/core/src/codesync.ts`<br>`packages/capsule-android/capsule/src/main/kotlin/dev/capsule/codesync/**`<br>`packages/capsule-android/capsule/src/main/kotlin/dev/capsule/runtime/CrashLoopGuard.kt`<br>`packages/capsule-android/capsule/src/main/kotlin/dev/capsule/runtime/*BundleStore.kt`<br>`packages/capsule-ios/Sources/dev/capsule/codesync/**` | `packages/codesync-api/tests/**`<br>`packages/capsule-android/capsule/src/test/kotlin/dev/capsule/codesync/**`<br>`packages/capsule-ios/Tests/CapsuleTests/codesync/**`<br>`packages/core/src/__tests__/codesync.test.ts`<br>`packages/cli/src/__tests__/zip.test.ts` |
| [contributing/commands.md](../../contributing/commands.md) | Commands | contributor | current | `package.json`<br>`scripts/*.mjs` | — |
| [contributing/docker.md](../../contributing/docker.md) | Docker strategy | contributor | draft | — | — |
| [contributing/environment.md](../../contributing/environment.md) | Development environment | contributor | current | `scripts/dev-env.mjs`<br>`scripts/with-env.mjs`<br>`scripts/lib/env.mjs`<br>`.env.example` | `scripts/lib/env.test.mjs` |
| [contributing/index.md](../../contributing/index.md) | Contributing | contributor | current | — | — |
| [contributing/ios-bring-up.md](../../contributing/ios-bring-up.md) | iOS bring-up | contributor | current | `Package.swift`<br>`packages/capsule-ios/Sources/dev/capsule/*.swift` | — |
| [contributing/platform-parity.md](../../contributing/platform-parity.md) | Android and iOS parity | contributor | current | — | — |
| [contributing/plugin-authoring.md](../../contributing/plugin-authoring.md) | Plugin authoring | contributor | draft | — | — |
| [contributing/release.md](../../contributing/release.md) | Release | maintainer | current | `LICENSE`<br>`NOTICE`<br>`packages/codesync-api/LICENSE` | — |
| [contributing/template-authoring.md](../../contributing/template-authoring.md) | Template authoring | contributor | current | `packages/cli/src/commands/init.ts`<br>`packages/cli/templates/**` | — |
| [contributing/testing.md](../../contributing/testing.md) | Testing | contributor | current | `packages/cli/src/commands/test.ts`<br>`packages/cli/src/testing.ts`<br>`packages/cli/assets/testing/**`<br>`packages/core/src/testing/**` | — |
| [contributing/upkeep.md](../../contributing/upkeep.md) | Dependency and tooling upkeep | maintainer | current | `scripts/upkeep/**`<br>`packages/cli/src/platform/**`<br>`scripts/update-civetweb.mjs`<br>`scripts/update-quickjs.mjs`<br>`scripts/gen/android-toolchain.mjs`<br>`renovate.json` | `scripts/upkeep/**/*.test.mjs`<br>`packages/cli/src/__tests__/requirements.test.ts`<br>`packages/cli/src/__tests__/store-check.test.ts`<br>`packages/cli/src/__tests__/android-toolchain.test.ts` |
| [contributing/workflows/CONTEXT.md](../../contributing/workflows/CONTEXT.md) | Workflows | contributor | current | — | — |
| [contributing/workflows/add-native-api/CONTEXT.md](../../contributing/workflows/add-native-api/CONTEXT.md) | Workflow: add a native API | contributor | current | — | — |
| [contributing/workflows/author-plugin/CONTEXT.md](../../contributing/workflows/author-plugin/CONTEXT.md) | Workflow: author a plugin | contributor | draft | — | — |
| [contributing/workflows/upkeep-sweep/CONTEXT.md](../../contributing/workflows/upkeep-sweep/CONTEXT.md) | Workflow: upkeep sweep | maintainer | current | `scripts/upkeep/**` | — |
| [decisions/0001-embedded-runtime.md](../../decisions/0001-embedded-runtime.md) | ADR-001: Embedded runtime architecture | contributor | record | — | — |
| [decisions/0002-capsule-ui.md](../../decisions/0002-capsule-ui.md) | ADR-002: Capsule UI | contributor | record | — | — |
| [decisions/0003-ai-and-agents.md](../../decisions/0003-ai-and-agents.md) | ADR-003: On-device AI and agents | contributor | record | — | — |
| [decisions/0004-web-serving-transport.md](../../decisions/0004-web-serving-transport.md) | ADR-004: Web-serving transport and HTTP fidelity | contributor | record | — | — |
| [decisions/index.md](../../decisions/index.md) | Decisions | everyone | current | — | — |
| [decisions/log.md](../../decisions/log.md) | Decision log | contributor | record | — | — |
| [guide/ai.md](../../guide/ai.md) | On-device AI | app-developer | current | `packages/core/src/ai.ts`<br>`packages/capsule-android/capsule/src/main/kotlin/dev/capsule/ai/**`<br>`packages/capsule-android/capsule/src/main/kotlin/dev/capsule/handlers/ai/**`<br>`packages/capsule-ios/Sources/dev/capsule/ai/**` | `packages/core/src/__tests__/ai.test.ts`<br>`packages/capsule-android/capsule/src/test/kotlin/dev/capsule/ai/**`<br>`packages/capsule-android/capsule/src/test/kotlin/dev/capsule/handlers/ai/**`<br>`packages/capsule-android/capsule/src/androidTest/kotlin/dev/capsule/ai/**`<br>`packages/capsule-ios/Tests/CapsuleTests/ai/**` |
| [guide/alerts-styling.md](../../guide/alerts-styling.md) | Alert styling | app-developer | current | `packages/core/src/alerts.ts`<br>`packages/capsule-android/capsule/src/main/kotlin/dev/capsule/alerts/**`<br>`packages/capsule-android/capsule/src/main/kotlin/dev/capsule/handlers/alerts/**` | `packages/core/src/__tests__/alerts.test.ts` |
| [guide/database.md](../../guide/database.md) | Database (SQLite) | app-developer | current | `packages/core/src/db.ts`<br>`packages/capsule-android/capsule/src/main/kotlin/dev/capsule/db/**`<br>`packages/capsule-android/capsule/src/main/kotlin/dev/capsule/handlers/db/**`<br>`packages/capsule-ios/Sources/dev/capsule/sqlite/**` | `packages/core/src/__tests__/db.test.ts`<br>`packages/capsule-android/capsule/src/test/kotlin/dev/capsule/handlers/db/**`<br>`packages/capsule-android/capsule/src/androidTest/kotlin/dev/capsule/db/**`<br>`packages/capsule-ios/Tests/CapsuleTests/sqlite/**` |
| [guide/hello-world.md](../../guide/hello-world.md) | Hello World | app-developer | current | — | — |
| [guide/installation.md](../../guide/installation.md) | Installation | app-developer | current | — | — |
| [guide/mobile-css-reset.md](../../guide/mobile-css-reset.md) | Mobile CSS reset | app-developer | current | `packages/cli/src/mobile-css-reset.ts` | `packages/cli/src/__tests__/mobile-css-reset.test.ts` |
| [guide/ota-updates.md](../../guide/ota-updates.md) | Over-the-air updates | app-developer | current | `packages/core/src/codesync.ts`<br>`packages/cli/src/commands/codesync.ts`<br>`packages/codesync-api/src/**` | `packages/core/src/__tests__/codesync.test.ts` |
| [guide/plugins.md](../../guide/plugins.md) | Plugin system | contributor | planned | — | — |
| [guide/publishing.md](../../guide/publishing.md) | Store publishing | app-developer | planned | — | — |
| [guide/push-notifications.md](../../guide/push-notifications.md) | Push notifications | app-developer | current | `packages/core/src/push.ts`<br>`packages/capsule-android/capsule/src/main/kotlin/dev/capsule/push/**`<br>`packages/capsule-android/capsule/src/main/kotlin/dev/capsule/handlers/push/**` | `packages/core/src/__tests__/push.test.ts`<br>`packages/capsule-android/capsule/src/test/kotlin/dev/capsule/push/**`<br>`packages/capsule-android/capsule/src/test/kotlin/dev/capsule/handlers/push/**` |
| [guide/quickstart.md](../../guide/quickstart.md) | Quickstart | app-developer | current | — | — |
| [index.md](../../index.md) | Documentation index | everyone | current | — | — |
| [project/business/business-model.md](../../project/business/business-model.md) | Business model | maintainer | current | — | — |
| [project/business/ota-policy-and-liability.md](../../project/business/ota-policy-and-liability.md) | OTA policy and liability | maintainer | current | — | — |
| [project/business/pricing.md](../../project/business/pricing.md) | Pricing, payments and trial | maintainer | draft | — | — |
| [project/history.md](../../project/history.md) | Build history | contributor | record | — | — |
| [project/incidents/2026-10-embedded-server-startup.md](../../project/incidents/2026-10-embedded-server-startup.md) | Incident: embedded server startup (2026-10) | contributor | record | — | — |
| [project/infrastructure.md](../../project/infrastructure.md) | Infrastructure and hosting economics | maintainer | planned | — | — |
| [project/known-issues.md](../../project/known-issues.md) | Known issues | contributor | current | — | — |
| [project/research/2026-06-24-planning-brainstorm.md](../../project/research/2026-06-24-planning-brainstorm.md) | Planning brainstorm (2026-06-24) | maintainer | record | — | — |
| [project/research/chatgpt-first-impressions.md](../../project/research/chatgpt-first-impressions.md) | ChatGPT first impressions | maintainer | record | — | — |
| [project/research/chatgpt-plugin-compatibility.md](../../project/research/chatgpt-plugin-compatibility.md) | Capacitor/Cordova compatibility strategy | maintainer | record | — | — |
| [project/roadmap.md](../../project/roadmap.md) | Roadmap | everyone | current | — | — |
| [project/server-design/database.md](../../project/server-design/database.md) | Server design: database | maintainer | planned | — | — |
| [project/server-design/file-storage.md](../../project/server-design/file-storage.md) | Server design: file storage | maintainer | planned | — | — |
| [project/server-design/overview.md](../../project/server-design/overview.md) | Server design: portal and self-hosting | maintainer | planned | — | — |
| [project/server-design/workers.md](../../project/server-design/workers.md) | Server design: background workers | maintainer | planned | — | — |
| [project/state.md](../../project/state.md) | Project state | contributor | current | — | — |
| [reference/cli.md](../../reference/cli.md) | CLI | app-developer | current | `packages/cli/src/program.ts`<br>`packages/cli/src/config.ts`<br>`packages/cli/src/commands/**`<br>`packages/cli/src/sync/**` | `packages/cli/src/__tests__/**` |
| [reference/core-api.md](../../reference/core-api.md) | Core API | app-developer | current | `packages/core/src/*.ts` | `packages/core/src/__tests__/**` |
| [reference/lockfile.md](../../reference/lockfile.md) | capsule.lock | app-developer | current | `packages/cli/src/commands/add.ts`<br>`packages/cli/src/commands/init.ts` | — |

## Code folders → pages

Which pages to update when you change a file in a folder. A folder is listed when a file in it
matches a page's `code:` globs.

| Folder | Documented in |
|---|---|
| `(repo root)/` | [concepts/primers/civetweb.md](../../concepts/primers/civetweb.md)<br>[contributing/commands.md](../../contributing/commands.md)<br>[contributing/environment.md](../../contributing/environment.md)<br>[contributing/ios-bring-up.md](../../contributing/ios-bring-up.md)<br>[contributing/release.md](../../contributing/release.md)<br>[contributing/upkeep.md](../../contributing/upkeep.md) |
| `.github/workflows/` | [contributing/ci.md](../../contributing/ci.md) |
| `packages/capsule-android/capsule/src/main/cpp/` | [concepts/primers/civetweb.md](../../concepts/primers/civetweb.md)<br>[concepts/primers/jni-and-cpp.md](../../concepts/primers/jni-and-cpp.md)<br>[concepts/primers/quickjs.md](../../concepts/primers/quickjs.md) |
| `packages/capsule-android/capsule/src/main/kotlin/dev/capsule/` | [concepts/architecture.md](../../concepts/architecture.md) |
| `packages/capsule-android/capsule/src/main/kotlin/dev/capsule/ai/` | [guide/ai.md](../../guide/ai.md) |
| `packages/capsule-android/capsule/src/main/kotlin/dev/capsule/alerts/` | [guide/alerts-styling.md](../../guide/alerts-styling.md) |
| `packages/capsule-android/capsule/src/main/kotlin/dev/capsule/codesync/` | [contributing/codesync-internals.md](../../contributing/codesync-internals.md) |
| `packages/capsule-android/capsule/src/main/kotlin/dev/capsule/db/` | [guide/database.md](../../guide/database.md) |
| `packages/capsule-android/capsule/src/main/kotlin/dev/capsule/handlers/ai/` | [guide/ai.md](../../guide/ai.md) |
| `packages/capsule-android/capsule/src/main/kotlin/dev/capsule/handlers/alerts/` | [guide/alerts-styling.md](../../guide/alerts-styling.md) |
| `packages/capsule-android/capsule/src/main/kotlin/dev/capsule/handlers/db/` | [guide/database.md](../../guide/database.md) |
| `packages/capsule-android/capsule/src/main/kotlin/dev/capsule/handlers/push/` | [guide/push-notifications.md](../../guide/push-notifications.md) |
| `packages/capsule-android/capsule/src/main/kotlin/dev/capsule/push/` | [guide/push-notifications.md](../../guide/push-notifications.md) |
| `packages/capsule-android/capsule/src/main/kotlin/dev/capsule/runtime/` | [concepts/primers/civetweb.md](../../concepts/primers/civetweb.md)<br>[concepts/primers/jni-and-cpp.md](../../concepts/primers/jni-and-cpp.md)<br>[concepts/primers/quickjs.md](../../concepts/primers/quickjs.md)<br>[contributing/codesync-internals.md](../../contributing/codesync-internals.md) |
| `packages/capsule-ios/Sources/dev/capsule/` | [contributing/ios-bring-up.md](../../contributing/ios-bring-up.md) |
| `packages/capsule-ios/Sources/dev/capsule/ai/` | [guide/ai.md](../../guide/ai.md) |
| `packages/capsule-ios/Sources/dev/capsule/codesync/` | [contributing/codesync-internals.md](../../contributing/codesync-internals.md) |
| `packages/capsule-ios/Sources/dev/capsule/runtime/` | [concepts/primers/civetweb.md](../../concepts/primers/civetweb.md) |
| `packages/capsule-ios/Sources/dev/capsule/sqlite/` | [guide/database.md](../../guide/database.md) |
| `packages/cli/assets/testing/_shared/src/test/` | [contributing/testing.md](../../contributing/testing.md) |
| `packages/cli/assets/testing/angular-ts/` | [contributing/testing.md](../../contributing/testing.md) |
| `packages/cli/assets/testing/jquery-bootstrap/` | [contributing/testing.md](../../contributing/testing.md) |
| `packages/cli/assets/testing/jquery-bootstrap/src/test/` | [contributing/testing.md](../../contributing/testing.md) |
| `packages/cli/assets/testing/react-ts/` | [contributing/testing.md](../../contributing/testing.md) |
| `packages/cli/assets/testing/react-ts/src/test/` | [contributing/testing.md](../../contributing/testing.md) |
| `packages/cli/assets/testing/svelte-ts/` | [contributing/testing.md](../../contributing/testing.md) |
| `packages/cli/assets/testing/svelte-ts/src/test/` | [contributing/testing.md](../../contributing/testing.md) |
| `packages/cli/assets/testing/vanilla-js/` | [contributing/testing.md](../../contributing/testing.md) |
| `packages/cli/assets/testing/vanilla-js/src/test/` | [contributing/testing.md](../../contributing/testing.md) |
| `packages/cli/assets/testing/vanilla-ts/` | [contributing/testing.md](../../contributing/testing.md) |
| `packages/cli/assets/testing/vanilla-ts/src/test/` | [contributing/testing.md](../../contributing/testing.md) |
| `packages/cli/assets/testing/vue-ts/` | [contributing/testing.md](../../contributing/testing.md) |
| `packages/cli/assets/testing/vue-ts/src/test/` | [contributing/testing.md](../../contributing/testing.md) |
| `packages/cli/src/` | [contributing/testing.md](../../contributing/testing.md)<br>[guide/mobile-css-reset.md](../../guide/mobile-css-reset.md)<br>[reference/cli.md](../../reference/cli.md) |
| `packages/cli/src/commands/` | [contributing/codesync-internals.md](../../contributing/codesync-internals.md)<br>[contributing/template-authoring.md](../../contributing/template-authoring.md)<br>[contributing/testing.md](../../contributing/testing.md)<br>[guide/ota-updates.md](../../guide/ota-updates.md)<br>[reference/cli.md](../../reference/cli.md)<br>[reference/lockfile.md](../../reference/lockfile.md) |
| `packages/cli/src/lib/` | [contributing/codesync-internals.md](../../contributing/codesync-internals.md) |
| `packages/cli/src/platform/` | [contributing/upkeep.md](../../contributing/upkeep.md) |
| `packages/cli/src/sync/` | [reference/cli.md](../../reference/cli.md) |
| `packages/cli/templates/react-ts/` | [contributing/template-authoring.md](../../contributing/template-authoring.md) |
| `packages/cli/templates/react-ts/src/` | [contributing/template-authoring.md](../../contributing/template-authoring.md) |
| `packages/codesync-api/` | [contributing/codesync-internals.md](../../contributing/codesync-internals.md)<br>[contributing/release.md](../../contributing/release.md) |
| `packages/codesync-api/src/` | [contributing/codesync-internals.md](../../contributing/codesync-internals.md)<br>[guide/ota-updates.md](../../guide/ota-updates.md) |
| `packages/core/src/` | [concepts/architecture.md](../../concepts/architecture.md)<br>[concepts/primers/quickjs.md](../../concepts/primers/quickjs.md)<br>[contributing/codesync-internals.md](../../contributing/codesync-internals.md)<br>[guide/ai.md](../../guide/ai.md)<br>[guide/alerts-styling.md](../../guide/alerts-styling.md)<br>[guide/database.md](../../guide/database.md)<br>[guide/ota-updates.md](../../guide/ota-updates.md)<br>[guide/push-notifications.md](../../guide/push-notifications.md)<br>[reference/core-api.md](../../reference/core-api.md) |
| `packages/core/src/testing/` | [contributing/testing.md](../../contributing/testing.md) |
| `packages/native/civetweb/` | [concepts/primers/civetweb.md](../../concepts/primers/civetweb.md) |
| `packages/native/civetweb/include/` | [concepts/primers/civetweb.md](../../concepts/primers/civetweb.md) |
| `packages/native/civetweb/src/` | [concepts/primers/civetweb.md](../../concepts/primers/civetweb.md) |
| `packages/native/quickjs/` | [concepts/primers/quickjs.md](../../concepts/primers/quickjs.md) |
| `scripts/` | [_core/conventions.md](../../_core/conventions.md)<br>[contributing/ci.md](../../contributing/ci.md)<br>[contributing/commands.md](../../contributing/commands.md)<br>[contributing/environment.md](../../contributing/environment.md)<br>[contributing/upkeep.md](../../contributing/upkeep.md) |
| `scripts/docs-lint/` | [_core/conventions.md](../../_core/conventions.md) |
| `scripts/docs-lint/bin/` | [_core/conventions.md](../../_core/conventions.md) |
| `scripts/docs-lint/checks/` | [_core/conventions.md](../../_core/conventions.md) |
| `scripts/docs-lint/lib/` | [_core/conventions.md](../../_core/conventions.md) |
| `scripts/gen/` | [_core/conventions.md](../../_core/conventions.md)<br>[contributing/upkeep.md](../../contributing/upkeep.md) |
| `scripts/lib/` | [contributing/environment.md](../../contributing/environment.md) |
| `scripts/upkeep/` | [contributing/upkeep.md](../../contributing/upkeep.md)<br>[contributing/workflows/upkeep-sweep/CONTEXT.md](../../contributing/workflows/upkeep-sweep/CONTEXT.md) |
| `scripts/upkeep/__fixtures__/` | [contributing/upkeep.md](../../contributing/upkeep.md)<br>[contributing/workflows/upkeep-sweep/CONTEXT.md](../../contributing/workflows/upkeep-sweep/CONTEXT.md) |
| `scripts/upkeep/lib/` | [contributing/upkeep.md](../../contributing/upkeep.md)<br>[contributing/workflows/upkeep-sweep/CONTEXT.md](../../contributing/workflows/upkeep-sweep/CONTEXT.md) |
| `scripts/upkeep/parsers/` | [contributing/upkeep.md](../../contributing/upkeep.md)<br>[contributing/workflows/upkeep-sweep/CONTEXT.md](../../contributing/workflows/upkeep-sweep/CONTEXT.md) |
| `scripts/upkeep/sections/` | [contributing/upkeep.md](../../contributing/upkeep.md)<br>[contributing/workflows/upkeep-sweep/CONTEXT.md](../../contributing/workflows/upkeep-sweep/CONTEXT.md) |
