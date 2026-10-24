---
title: "On-device AI"
audience: app-developer
status: current
code:
  - packages/core/src/ai.ts
  - packages/capsule-android/capsule/src/main/kotlin/dev/capsule/ai/**
  - packages/capsule-android/capsule/src/main/kotlin/dev/capsule/handlers/ai/**
  - packages/capsule-ios/Sources/dev/capsule/ai/**
tests:
  - packages/core/src/__tests__/ai.test.ts
  - packages/capsule-android/capsule/src/test/kotlin/dev/capsule/ai/**
  - packages/capsule-android/capsule/src/test/kotlin/dev/capsule/handlers/ai/**
  - packages/capsule-android/capsule/src/androidTest/kotlin/dev/capsule/ai/**
  - packages/capsule-ios/Tests/CapsuleTests/ai/**
---
# AI (`ai`) — Implementation

> **Phase 3 spike + Phase 4 interface** of [adr-003](../decisions/0003-ai-and-agents.md).
> Status: **built 2026-10-24.** Android Tier 1 runs on Gemini Nano (ML Kit GenAI Prompt API, beta);
> iOS has the same contract with an Apple Foundation Models provider that still needs a macOS build to
> verify. Tiers 2 (bundled model) and 3 (cloud) and the agent layer are **Phase 6** — not built here.

**The device-coverage cliff, loudly:** Tier 1 exists only on flagships with an OS model — Pixel 8+ /
Galaxy S24+ with AICore, iPhone 15 Pro+ / 16+ / M1+ with Apple Intelligence. On every other device
`ai.availability()` answers `unavailable`, and `generate`/`stream` reject with `AI_UNAVAILABLE`. Apps
must check availability before offering an AI feature. Universal coverage arrives with Tiers 2/3.

---

## 1. TypeScript surface — `core/src/ai.ts`

```typescript
import { ai } from '@capsule/core'

const a = await ai.availability()   // { tier, status, reason? }
if (a.status === 'downloadable' || a.status === 'downloading') await ai.prepare()

const { text, finishReason } = await ai.generate({ prompt: 'Summarise this note', maxTokens: 256 })

for await (const piece of ai.stream({ prompt })) output.textContent += piece
```

| Field | Values |
|---|---|
| `tier` | `os-native` · `bundled` · `cloud` · `unavailable` |
| `status` | `ready` · `downloadable` (call `prepare()`) · `downloading` · `unavailable` |
| `reason` | Why it is not `ready` — e.g. `"os-native: Gemini Nano (AICore) is not available on this device; bundled: …"` |
| `finishReason` | `stop` · `length` (`maxTokens` hit) · `other` |

**Deviation from adr-003's sketch:** `availability()` returns an object, not the bare tier string —
`status` is needed for the OS model's download step, and `reason` makes "unavailable" actionable.

### Bridge methods

| Method | Params | Result |
|---|---|---|
| `ai.availability` | — | `AiAvailability` |
| `ai.prepare` | — | `AiAvailability` after downloading the model (Android; iOS downloads on its own) |
| `ai.generate` | `{ prompt, maxTokens?, temperature? }` | `{ text, finishReason }` |
| `ai.stream` | `{ prompt, maxTokens?, temperature?, streamId }` | `{ text, finishReason }`, after pushing every piece as an **`ai.streamChunk`** notification `{ streamId, text }` |

`stream()` is **real token streaming** (the model's own stream, not a split string). `AiModule`
generates the `streamId`, subscribes to `ai.streamChunk` before calling, and ends the async generator
when the final response arrives. Breaking out of `for await` stops listening; the device still finishes
the reply.

Errors: `AI_UNAVAILABLE` (7001, reason in `data`), `AI_GENERATION_FAILED` (7002).

**Browser fallback (WebBridge):** honest `unavailable` with a reason; `generate`/`stream` reject with
`AI_UNAVAILABLE`. No fake "echo" replies — browser dev exercises the path most devices take.

---

## 2. Native design (Android `dev.capsule.ai`, iOS `Sources/dev/capsule/ai`)

| Piece | Role |
|---|---|
| `AiProvider` | One backend: `availability()`, `prepare()`, `generate()`, `stream(onChunk)` |
| `TieredAiProvider` | Preference order **is** the policy (on-device first, cloud last). First `ready` provider serves; otherwise the most promising (`downloadable`/`downloading` beats `unavailable`) is reported and prepared |
| `UnavailableAiProvider` | A tier this build lacks — Tiers 2/3 today — with the reason |
| `AndroidGeminiNanoProvider` | Tier 1 — `com.google.mlkit:genai-prompt` (see §3) |
| `AppleFoundationModelsProvider` | Tier 1 iOS 26+ — `#if canImport(FoundationModels)`, **unverified** until built on macOS |
| `AiHandlers.kt` | `ai.availability` / `ai.prepare` / `ai.generate` / `ai.stream` (emits via `BridgeEventEmitter`) |
| `FakeAiProvider` (Kotlin + Swift) | Scripted availability + reply chunks; records requests |

Capability: **`ai` = version 1** in `CapabilityRegistry` (OTA gating). Tier-1 models belong to the OS,
so nothing is persisted; Tier-2 model files must live outside the OTA bundle dirs (adr-003 §3).

iOS has no bridge registry yet (Phase 4): `TieredAiProvider.standard()` is ready for `CapsuleBridge`.

---

## 3. Tier 1 on Android — ML Kit GenAI Prompt API

- Artifact: **`com.google.mlkit:genai-prompt:1.0.0-beta4`** (2026-07-21, built against the Kotlin
  2.3 stdlib — needs a Kotlin ≥ 2.3 compiler; ours is 2.4).
  Docs: <https://developers.google.com/ml-kit/genai/prompt/android/get-started>. minSdk 26 (matches ours).
- Moved up from beta2 at the 2026-10-24 upkeep sweep. The surface used here — `Builder(TextPart)`,
  `maxOutputTokens`, `temperature`, `checkStatus()`, `download()`,
  `generateContent`/`generateContentStream` — is unchanged between the two AARs (`javap` diff); beta4
  only adds (system instructions, multi-part `Content`, typed output, thinking mode).
- Mapping: `checkStatus()` `AVAILABLE/DOWNLOADABLE/DOWNLOADING/UNAVAILABLE` → `ready/downloadable/
  downloading/unavailable`; `download()` flow → `prepare()`; `generateContent` / `generateContentStream`
  (each streamed response carries the next piece) → `generate` / `stream`; `FinishReason.MAX_TOKENS` →
  `length`.
- First use on a freshly set-up device can fail while AICore initialises — the error surfaces as
  `AI_GENERATION_FAILED`; retrying later works.

---

## 4. Not in this build (Phase 6, per adr-003)

- **Tier 2** (Cactus / llama.cpp, model download outside bundle dirs) and **Tier 3** (OTA-cloud
  inference, billing meter) — modelled as `UnavailableAiProvider`s so `availability()` explains them.
- **Agent layer** (`defineAgent`, tool registry, tool-permission model, MCP decision). The earlier
  `core/src/agent.ts` draft was removed: adr-003 places it in Phase 6 and it had no tested loop behind it.
- A `capsule.config.ts` tier preference — the order is fixed in the shell until Tier 2/3 exist.

---

## 5. Tests

| Tier | Where |
|---|---|
| JS (vitest) | `core/src/__tests__/ai.test.ts` — module calls, streaming (order, errors, early break, distinct ids), WebBridge fallback |
| Kotlin (pure JVM) | `test/.../ai/TieredAiProviderTest.kt`, `test/.../handlers/ai/AiHandlersTest.kt` |
| Swift (Linux Docker) | `Tests/CapsuleTests/ai/TieredAiProviderTests.swift` |
| On device | `androidTest/.../ai/AndroidGeminiNanoProviderTest.kt` — availability contract everywhere; generation + streaming only where Gemini Nano is ready (structure, never exact text) |
