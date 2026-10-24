---
title: "ADR-003: On-device AI and agents"
audience: contributor
status: record
---
# ADR-003 — On-device AI & Agents

**Status:** Proposed / Future. Capability spike fits **late Phase 3**; the agent layer + hosted inference pairs with **Phase 6 (OTA cloud)**. Not started.
**Date:** 2026-06-22
**Supersedes/relates:** [Q16 monolithic core](log.md) · [adr-001 embedded runtime](0001-embedded-runtime.md) · [Business model](../project/business/business-model.md)

## Context

Every mobile-app platform is being asked for AI. We evaluated whether Capsule should expose an
**AI capability** and, beyond that, an **agent capability** (LLM + tools + loop). Two findings
from the 2026-06 landscape scan shaped the decision.

### What competitors have done
- **Ionic/Capacitor** already shipped [`capacitor-local-llm`](https://github.com/ionic-team/capacitor-local-llm)
  (Capacitor **Labs / experimental**): a unified TS API for on-device text/image generation + sessions.
  Crucially it **wraps the OS-native models** (Apple Foundation Models, Android Gemini Nano/AICore) — it
  does **not** bundle its own runtime. They openly state "the first-party on-device AI story is still in
  flux, especially on Android." A community plugin (`@capgo/capacitor-llm`) adds Apple Intelligence + MLX.
- **Framework7** — no AI story. It is a UI kit.

So a flag is planted, but it's thin (a shim over whatever the OS ships) and experimental. Nobody has
shipped the **"bundle-your-own portable model + agent tools + OTA-updatable agent logic"** approach on a
web-native shell — which is exactly the seam Capsule's architecture already occupies.

### The device-coverage cliff (the fact that reframes everything)
The OS-native path only works on **premium, recent flagships**:
- **Apple Foundation Models** require Apple Intelligence: **iPhone 15 Pro+ / 16+, M1+ iPad/Mac**. Every
  base 15/14/13, every SE — excluded.
- **Gemini Nano / AICore**: **Pixel 8+, Galaxy S24+**; Gemini Nano 4 (late 2026) wants **12 GB RAM,
  flagship-only**.

**Conclusion:** "wrap the OS model" (what Ionic shipped) is a demo/checkbox, not a real capability — and
it is *worst* for the mass-market / emerging-market apps that Capsule's agency ICP tends to build.
Universal coverage requires **bundling a small model** (a portable C/C++ inference engine) **or cloud**.
That pushes the real product toward a **hybrid** — which is precisely where Phase-5 OTA cloud lives.

### The runtime engine ("the QuickJS of LLMs")
Same kind of decision we made for the JS engine — pick a portable C/C++ core we embed via JNI:

| Engine | What it is | Fit |
|---|---|---|
| **llama.cpp** | Foundational C/C++ lib, GGUF single-file models, maximally portable, CPU-first | Closest in spirit to QuickJS; we'd build all mobile glue ourselves. **The safe escape hatch.** |
| **ExecuTorch** (Meta) | 1.0 GA Oct 2025, 50 KB runtime, 12+ HW backends, runs in WhatsApp/IG at scale | Heaviest integration (PyTorch toolchain); the "big production" option. |
| **MLC-LLM** | Compiles models to native via Apache TVM, GPU (Vulkan/Metal) | Best raw perf on specific targets; complex build. |
| **🌵 Cactus** | C API + C++ ARM-SIMD kernels, native **Kotlin + Swift** bindings, **cloud fallback built in**, sub-50 ms TTFT, open source | **Strongest architectural match** — embeds like our QuickJS-ng JNI work, cross-platform from one core (iOS parity), cloud-fallback dovetails with Phase-5. **Risks:** young YC startup, v1 moved to a **proprietary `.cact` format**, license unconfirmed. |

## Decision (proposed)

Adopt AI as a **first-class core capability** following the existing `interface → provider → Fake →
handler → @capsule/core` pattern (consistent with [Q16](log.md): an OS API → `@capsule/core`),
structured in two tiers plus an agent layer:

### 1. The `ai` core API — tiered inference, one TS surface
A single `ai` singleton in `@capsule/core` with a provider behind it, exactly like `geolocation`/`camera`:

```typescript
import { ai } from '@capsule/core'

// Text generation — provider chosen by config/availability
const reply = await ai.generate({ prompt: 'Summarise this note', maxTokens: 256 })
for await (const tok of ai.stream({ prompt })) { /* streaming */ }
const ready = await ai.availability()  // 'os-native' | 'bundled' | 'cloud' | 'unavailable'
```

Three provider tiers behind that surface, chosen by availability + `capsule.config.ts`:

| Tier | Provider | Coverage | When |
|------|----------|----------|------|
| **Tier 1 — OS-native** | Apple Foundation Models / Gemini Nano via AICore | Flagships only (see cliff) | Cheap "we have AI" checkbox; ships fast; zero model bundling. Matches Ionic feature-for-feature. |
| **Tier 2 — Bundled** | Cactus (primary) / llama.cpp (escape hatch); a quantised model fetched **outside** the OTA bundle dirs | Universal | The real on-device capability; offline + private. |
| **Tier 3 — Cloud** | Capsule OTA cloud → Claude/other; or Cactus cloud-fallback by confidence | Universal | Reasoning-heavy work; the **billing meter**. |

Default = **hybrid**: use on-device when available/sufficient, fall back to cloud otherwise.

### 2. The agent layer — native bridge **as the tool surface**
An agent is `LLM + tools + loop`. Capsule's hard parts already exist:
- The **JSON-RPC native bridge** (camera, filesystem, geolocation, notifications, db, …) **is the tool
  palette.** Every Phase-3 API is one more agent tool *for free.* This reframes Phase 3 — we're not just
  adding device features, we're building the agent's hands.
- The **QuickJS server runtime** is the natural home for the agent loop + tool dispatch (it's JSON +
  bridge calls — exactly what QuickJS is good at). **Inference itself never runs in QuickJS** — it is a
  bridge call to the native/cloud provider. This split is clean and already supported by adr-001.
- **Server Code Push (Phase 6)** makes agent definitions — system prompt, tool registry, routing —
  **hot-patchable over the air**, because they live in `src/server/routes`. *"Update your app's AI agent
  behavior without an app-store release"* is a story Ionic structurally cannot tell. **This is the moat.**

```typescript
// src/server/routes/agent.ts (runs in QuickJS; OTA-updatable)
import { defineAgent, tools } from '@capsule/core/agent'

export default defineAgent({
  model: 'hybrid',
  system: 'You are the in-app assistant.',
  tools: [tools.camera.capturePhoto, tools.filesystem.readFile, tools.geolocation.current],
})
```

**We do NOT build LangChain.** The agent *loop/abstraction* is a commodity (Vercel AI SDK et al.). Our
value is **tools = native capabilities + OTA-updatable + cross-platform**. Keep the loop thin; let an
existing model SDK drive it. Strongly consider speaking **MCP** so the tool surface is a standard any
model can drive — *"your phone's capabilities as MCP tools"* is a clean, ownable framing.

### 3. Cross-cutting constraints (inherit Phase-3 OTA rules)
- **Models persist outside the OTA-swappable bundle dirs** (`www/` + `server/bundle.js`) — a bundle swap
  must never wipe a multi-GB model download (same rule camera/filesystem already follow).
- **Native-capability version gating** — the `ai` capability carries a version so the Phase-5 OTA server
  can refuse to push agent JS that calls an `ai`/tool feature the installed shell predates.
- **Tool-permission model** — an agent with programmatic access to camera/files/location/contacts is a
  security surface. Per-tool grants + user confirmation for sensitive actions, designed in from day one,
  not bolted on. Reuses the existing `PermissionManager`.

## Alternatives considered

| Option | Why not (as the strategy) |
|---|---|
| **OS-native only** (Ionic's path) | The device-coverage cliff makes it a checkbox, not a capability. Adopt it *as Tier 1 only.* |
| **Cloud only** | No offline/private story; nothing differentiated vs. calling an API from any web app. Keep as Tier 3. |
| **Bundle a big model for everyone** | App-size + RAM cost punishes low-end devices; not all apps want AI. Must be opt-in + tree-shaken (Q16). |
| **Build a full agent framework (LangChain-style)** | Commodity surface; high maintenance; not the moat. Build the thin tool-registry instead. |
| **Ship now, before iOS** | The differentiator (Cactus cross-platform, OTA-updatable agents) only fully lands once iOS parity + OTA cloud exist. Spike the API now; land the agent layer with Phase 6. |

## Phasing (the plan)

**Phase 3 (now-ish) — `ai` capability spike (Tier 1 + interface).** Cheap, proves the pattern.
1. `AiProvider` interface + `FakeAiProvider` (scripted completions / tool-calls) — *day one*, per [R14](log.md).
2. `ai` singleton in `@capsule/core` + `AiHandler` (bridge method) + WebBridge fallback (browser dev → cloud or echo).
3. Tier-1 Android provider over **Gemini Nano / AICore**; `ai.availability()` returns the honest tier.
4. Capability-version field; docs note the device-coverage cliff loudly.

**Phase 4 — iOS parity.** Tier-1 iOS provider over **Apple Foundation Models** (mirrors Android).

**Phase 6 — the real product (paired with OTA cloud).**
5. **Tier 2** — embed Cactus (or llama.cpp) via JNI/Swift; model download → outside bundle dirs; resume/verify.
6. **Tier 3** — cloud inference through the Capsule OTA cloud (billing meter) + confidence-based fallback.
7. **Agent layer** — `@capsule/core/agent` (`defineAgent`, tool registry mapping bridge methods → tool schemas, thin loop), tool-permission model, MCP tool protocol decision.
8. **OTA-updatable agent logic** — agent definitions ride Server Code Push; canary + auto-rollback (already built in Step 7) protect a bad agent push.

**Phase 8+ — ecosystem.** Agent tool packs, model registry, fine-tune/RAG hooks (Cactus offers RAG on Flutter today).

## Testing — how, and can we actually test it?

**Yes — fully, off-device, through the existing 4-tier harness** ([testing.md](../contributing/testing.md)).
The trick is the same one the whole codebase already uses: **the model is a provider behind the bridge**,
so a `FakeAiProvider` / scripted `FakeLlm` makes everything deterministic. An agent is deterministic given
a *scripted sequence of model responses* (the standard way agents are tested).

| Tier | What it asserts for AI/agents | Determinism |
|------|------|---|
| **1 — Route/contract + units** (Vitest, node) | Tool-registry wiring (every tool maps to a real bridge method — the 404 class); agent routing/branch logic as pure functions; prompt assembly | Pure functions + `FakeAiProvider` returning scripted tool-calls |
| **2 — Component** (Vitest, jsdom) | UI renders against `@capsule/core`'s **FakeBridge** with a canned `ai.generate` result; streaming token plumbing; loading/error states | FakeBridge canned completion |
| **3 — QuickJS fidelity** (Vitest + `quickjs-emscripten`) | **The agent loop runs in real QuickJS** — `defineAgent` orchestration, tool dispatch, multi-turn loop — with inference stubbed to a scripted provider. Confirms the loop uses no Node/DOM globals | Scripted provider; loop is JSON+bridge only |
| **— Integration** (gated) | Real model behavior — **structure, not content**: valid tool-call JSON, terminates within N turns, latency budget. Gated on `CAPSULE_AI_*` env (mirrors `CAPSULE_API_BASE`), skipped in hermetic CI | Non-deterministic → assert shape/contract |
| **4 — On-device smoke** (Espresso-Web) | Native provider attaches; `ai.availability()` returns sane tier; a short generation returns non-empty. On-device model perf/quality is **non-deterministic** — assert structure + a latency ceiling, never exact text | Device-only; structural assertions |

Provider-level Kotlin/Swift tests mirror existing handlers: `FakeAiProvider` (like `FakeCameraProvider`/
`FakeLocationProvider`) → `AiHandler` unit tests, pure JVM. **What we cannot make deterministic** is real
model *output quality* — so we never assert exact strings against a live model; we assert contracts
(valid JSON tool-calls, termination, token/latency budgets) and pin a model+seed where the engine allows.

**Net:** the layered harness already covers AI/agents; only the live-model integration tier needs a key,
and only Tier-4 perf/quality needs a device — exactly like every other native API.

## Open questions / gates (close before committing Tier 2+)
- **Cactus license** (confirm the LICENSE file: Apache/MIT?) and **`.cact` format longevity** — keep a
  llama.cpp/GGUF escape hatch so we're never single-vendor-locked.
- **MCP vs. custom tool protocol** for the agent tool surface.
- **Tool-permission UX** — per-tool grants + sensitive-action confirmation.
- **Model distribution** — bundle vs. on-first-run download; size budget; storage location contract
  (must sit outside the OTA bundle dirs, see [D-series](log.md)).
- **Default tier policy** — when does hybrid escalate on-device → cloud (confidence? task class? config?).

## Consequences
- A multi-phase initiative, but it **compounds** the existing roadmap rather than competing with it:
  every Phase-3 native API becomes an agent tool, and the agent layer makes the Phase-5 OTA cloud a
  stronger funding engine (cloud inference = a metered, billable surface).
- New compatibility surface: the `ai` capability + tool schemas must be versioned and frozen like the
  bridge protocol (see adr-001 "contract to freeze").
- Pulls a real native dependency (Cactus/llama.cpp) into the shell — opt-in + tree-shaken so apps that
  don't use AI pay zero size (Q16 discipline).
- Positions Capsule's pitch as *"build a cross-platform app **and** give it an on-device/hybrid agent
  whose tools are the device itself, updatable over the air"* — sharper and more defensible than
  "we have an LLM API like Ionic."
</content>
</invoke>
