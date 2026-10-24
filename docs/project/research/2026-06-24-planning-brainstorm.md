---
title: "Planning brainstorm (2026-06-24)"
audience: maintainer
status: record
---
# Planning Brainstorm — 2026-06-24

> Sequencing + scope decisions raised after Push Slice 1 shipped. Captures what's **decided**
> (low-risk, I can act on it), what's **open** (your call), and the consolidated **questions** at the
> end. Once you answer, the outcomes fold into [000-Roadmap.md](../roadmap.md) (and an ADR if the
> Phase-4 sequencing changes). This doc is transient — delete it once the roadmap is updated.

---

## At a glance

| # | Topic | Status | One-line outcome |
|---|-------|--------|------------------|
| 1 | Firebase config ownership | ✅ Decided | Customer owns `google-services.json`; Capsule only makes wiring frictionless. |
| 2 | Defer Push Slice 2 (Firebase) | ✅ Decided | Yes — Local Notifications goes next; Slice 2 slots in later, smaller. |
| 3 | Emulator vs real device | ℹ️ Info | Emulator covers #5–#8 **and** Push; device only for NFC/Bluetooth/on-device-AI-perf. |
| 4 | Missing native APIs | 🔄 Open | Gap list below (+ live competitive scan pending). Pick which to adopt. |
| 5 | Move Server Code Push to Phase 4 | ❗ Open — **needs your call** | Viable; hinges on "product-to-launch vs system-to-master." Middle path recommended. |
| 6 | Primer docs (Kotlin/C·C++/NanoHTTPD/QuickJS) | ✅ Decided | Yes — 4 primers under `../Primers/`, anchored to your C#/TS background. |

---

## 1. Firebase config — customer owns it (hard boundary)

Capsule must **never** ship a shared `google-services.json`. That file encodes a specific Firebase
project + API key + sender ID + GCP billing account; FCM tokens are scoped to that sender. A shared
config = cross-app push, quota collisions, and Capsule carrying abuse/billing liability. Every peer
(Capacitor, RN, Flutter) requires the developer's own file.

**Capsule's job:** CLI `sync` copies the dropped-in file → `.capsule/android/app/google-services.json`;
`capsule doctor` warns if `push` is declared without it; config typing points at its path. A
`capsule firebase` scaffolding helper is a fine *future* nicety. A Phase-5 cloud **managed push-relay**
(dev uploads their FCM service-account key, sends through Capsule's API) is possible later — but even
then the client config stays the dev's.

## 2. Defer Push Slice 2 (Firebase) — yes

Slice 1 (the seam) is done, committed, proven offline + browser. Slice 2 was *designed* to be liftable
(022 D3); nothing else depends on real FCM. **Better still:** Local Notifications (#6) is pure-platform
(no Google) and reuses the same `NotificationManager` + channels + `POST_NOTIFICATIONS` infra — so doing
it next lets it own a shared channel manager, making Firebase Slice 2 *smaller* when you get to it. Defer
on motivation, not blockers.

## 3. Emulator coverage — you can stay on the emulator a long time

| API | Emulator? |
|-----|-----------|
| **Push / FCM** | ✅ Yes — use a **Google Play / Google APIs** AVD; FCM delivers to emulators. |
| Local notifications · Status bar · Keyboard · Share · SQLite | ✅ Yes |
| Biometrics | ✅ Yes — enroll a fake fingerprint (`adb emu finger touch` / extended controls). |
| Telecom / SMS | ⚠️ Partial — emulator simulates calls/SMS via extended controls. |
| NFC | ❌ Real device |
| Bluetooth | ❌ Real device (emulator BT unreliable/absent) |
| On-device AI (Gemini Nano/AICore) | ⚠️ Logic via `FakeAiProvider`; real perf needs Pixel 8+/compatible |

The device-only items (**NFC, Bluetooth, on-device AI perf**) are all **late** in the order. Daily-drive a
Play-Store AVD.

## 4. Missing native APIs (from-knowledge — live scan appended below when it lands)

Against the Capacitor baseline, table-stakes APIs **not** on the roadmap, cheapest/highest-value first:

| Capability | Priority | Note |
|------------|----------|------|
| **Browser / In-App Browser** (Custom Tabs / `SFSafariViewController`) | High | External URLs / OAuth flows. |
| **Secure storage** (Keystore/Keychain-backed) | High | Distinct from plain `storage`; needed for tokens. Security-relevant. |
| **App Launcher** (`canOpenUrl`, open tel:/mailto:/maps) | High | Common, trivial. |
| **Toast** | High | Ubiquitous, trivial. |
| **Splash Screen control API** (`splash.hide/show`) | Med | Splash exists internally; no JS control yet. |
| **Screen Orientation** (lock/unlock) | Med | — |
| **File / Document picker** | Med | Distinct from camera/gallery. |
| **Barcode / QR scanning** (ML Kit) | Med | Huge in the community. |
| Motion/sensors · Calendar · Contacts · Background geolocation | Low | Common community plugins. |

**Framework7 is a *UI* framework** (components/router/theming) that leans on Capacitor/Cordova for
native — not a native-API competitor. The lesson for Capsule isn't "match F7's native APIs" (it has none)
but "Phase 7's migration on-ramp must absorb F7/Ionic *UI + routing* conventions." (F7 v9, Nov 2025:
iOS-26 visual redesign, React 19 / Svelte 5 adapters — pure UI-layer, no native or AI moves.)

### Live competitive scan (Capacitor/Ionic, 2025-2026) — findings

**Correction:** the scan flagged "Filesystem" as a gap because my prompt omitted it — Capsule **has**
Filesystem (✅ done). Ignore that row. Confirmed/refined gaps below.

| Capability | Stakes | Note (from scan) |
|------------|--------|------------------|
| **Browser + In-App Browser** | High | Capacitor *split* these into two official plugins (`@capacitor/browser` + `@capacitor/inappbrowser`). External URLs / OAuth / embedded webviews. Capsule has none. |
| **Secure storage** (Keystore/Keychain) | High | Two community plugins at ~80–103k/wk. Encrypted tokens, distinct from `storage`. |
| **Splash Screen control** | High | Official; Capsule has splash internally, no JS control API. |
| **App Launcher** (outbound) | High | Official; Capsule has inbound deep-links but not outbound app launch / `canOpenUrl`. |
| **Toast** + **Action Sheet** | High / Med-High | Both official; pair with our `alerts`. |
| **Barcode / QR (ML Kit)** | Med-High | **Capacitor *promoted* this to an official plugin** — strong table-stakes signal. |
| **File / document picker** | Med-High | `@capawesome/capacitor-file-picker` ~87k/wk; distinct from camera. |
| **App Badge** | Med | ~126k/wk — **pairs directly with our push/local-notifications**; cheap, high-value. |
| **Native HTTP** (CORS bypass) | Med | Official `@capacitor/http` + `@capacitor/cookies`. Our `network` is connectivity-status only — native fetch is a real gap. |
| **TTS / Speech recognition** | Med | Natural companion to our on-device-AI direction (voice + LLM). |
| **Privacy Screen** | Med | Now official — blur in task-switcher + block screenshots. Security/compliance. |
| Motion · Screen Orientation · Contacts · Calendar · In-app review · In-app update · Social/OAuth login · Background geolocation | Low-Med | Common community plugins; adopt per app need. |

### Strategic news that nudges YOUR open questions

1. **Appflow is winding down** (sales stopped 2025-02-11, EOL 2027-12-31; Live Updates folding into paid
   OutSystems cloud). Independent OTA (Capawesome Cloud, Capgo) is filling the vacuum **right now.**
   → **Directly validates "Server Code Push as funding engine"** — the incumbent vacated the open/independent
   OTA market exactly as you'd enter it. This is a real tailwind for **Q-B option (B)/(A): pull OTA forward.**
   Caveat: it doesn't change the iOS-market logic (agencies want both platforms), but it means the *window*
   for the independent-OTA wave is open now and narrows as Capawesome/Capgo entrench.
2. **Ionic shipped an *official* on-device LLM plugin** (`capacitor-local-llm` v1.0.0, 2026-05-11):
   unified TS API over **Apple Foundation Models + Gemini Nano**, incl. image gen + multi-turn sessions.
   → Capsule's Tier-1 `ai` is now **parity catch-up, not pioneering**; the bar rose to "unified cross-platform
   TS surface + sessions (+ voice companion)." The **moat is still OTA-updatable agents**, not raw inference.
3. **Capacitor Skills** (2026-06-03): reusable **AI-agent primitives** — the same "native capabilities as
   composable agent tools" thesis as our [adr-003](../../decisions/0003-ai-and-agents.md). Convergent
   validation; our **OTA-updatable-agents** angle is arguably ahead of their static-skills approach.
4. **Platform churn to anticipate:** Capacitor 8 (2025-12-08) made **SPM the iOS default** + added Android
   edge-to-edge/`SystemBars`; ~6-month release cadence tracking annual OS releases. Feed this into Phase 4
   (iOS) + the upkeep routine.

## 5. Move Server Code Push to Phase 4 (before iOS)? — the big call

**Technically viable.** OTA has no hard iOS dependency; the capability-versioning it needs
(`CapabilityRegistry`) already exists. The bulk — `capsule codesync publish`, control plane, portal, DB,
billing UI — is platform-agnostic **web/backend work in your wheelhouse (C#/TS)**, and the on-device
fetch/apply half is **emulator-testable**. Fits both "play to my strengths" and "stay on emulator."

**The tension:** advancing OTA freezes the native layer at ~9 APIs (no local-notif, biometrics, secure
storage…), and the biz model wrote OTA cloud as *"gated on iOS"* (agencies want both platforms;
Android-only halves the market). **But** you're explicitly not racing for funds (the whole re-sequence was
capability-first) — so "gated on iOS" may be over-conservative for a personal build. The AI agent layer +
Tier-2/3 inference are also bundled into Phase 6 *with* OTA (adr-003: OTA-updatable agents = the moat) —
pulling OTA forward raises the question of whether AI comes too.

**Recommended middle path:** finish a *thin, high-value* Phase 3 first — **Local Notifications → Biometrics
→ Status bar/Keyboard/Share + Toast + Browser** (all emulator-friendly, each a few days, no Google) — so
the Android framework *feels* complete and gives you tools to showcase. **Then** make Server Code Push your
Phase 4; defer iOS + hardware APIs (NFC/BT) + on-device AI perf. Push Slice 2 (Firebase) slots in whenever
you feel like touching Google.

→ See **Q-A / Q-B / Q-C** below.

## 6. Primer docs — yes (`../Primers/`)

Capsule-specific primers anchored to your C#/OO + TS/web background (not generic tutorials), each linked
to real Capsule files:

- **`kotlin-for-csharp-devs.md`** — null-safety (`?`/`!!`), `data class` (≈ records), `sealed class`
  (≈ discriminated unions → `BridgeError`), `object`/`companion object` (≈ static), coroutines/`suspend`
  (≈ async/await → `suspendCancellableCoroutine` in `PushHandlers`), `fun interface` (≈ delegates →
  `BridgeEventEmitter`), extension functions.
- **`jni-and-cpp.md`** — the Kotlin ↔ C/C++ ↔ QuickJS boundary; what JNI is; `QuickJSEngineImpl`'s
  single-thread dispatcher + 4 MB stack; why strings must be objects.
- **`nanohttpd.md`** — why an embedded HTTP server exists; `NanoHttpdServer` serving `assets/www/` at
  `127.0.0.1:{port}`; the `/api/*` → QuickJS route; lifecycle.
- **`quickjs.md`** — JS engine vs V8; why Capsule embeds QuickJS-ng; the `dispatch()` contract;
  `globalThis` as the only reliable store; the vendoring model.

→ See **Q-E** below.

---

## Open Questions — your answers drive the next moves

- **Q-A (the pivotal one):** Is Capsule, right now, a **product you intend to launch** (→ iOS matters early,
  keep OTA gated on it) or a **system you're building to master/use yourself** (→ Android-only OTA is fine,
  pull it forward freely)? *Scan input: the Appflow wind-down opens the independent-OTA window now — a point for "launch", but only if you move before Capawesome/Capgo entrench.*
- **Q-B — Sequencing:** Pick one:
  - **(A) Middle path (recommended):** thin Phase 3 (Local notif → Biometrics → Status bar/Keyboard/Share/Toast/Browser) → **OTA = Phase 4** → iOS → AI/hardware.
  - **(B) Your instinct:** OTA right now (Phase 4) → fill the rest later.
  - **(C) Status quo:** finish all of Phase 3 → iOS → OTA+AI (Phase 6).
- **Q-C — AI:** If OTA moves to Phase 4, does the **AI agent layer + Tier-2/3 inference** move with it, or stay in Phase 6? *Scan input: Ionic now ships an official on-device-LLM plugin, so Tier-1 `ai` is parity-catch-up; the durable moat is OTA-updatable agents (which live with OTA) — a mild nudge to keep AI paired with OTA.*
- **Q-D — Native gaps:** Which of §4's gap APIs do you want on the roadmap? Refined top picks after the scan: **Browser/In-App Browser, Secure storage, App Launcher, Toast** + two the scan elevated — **App Badge** (pairs with push, ~126k/wk) and **Barcode/ML-Kit** (Capacitor just made it official).
- **Q-E — Primers:** Write **all four** now, or **one sample** (`kotlin-for-csharp-devs.md`) first to check tone/depth?
- **Q-F — Firebase:** For whenever Slice 2 happens — do you already have (or will you create) a Firebase project + `google-services.json`? (Free; runs on a Play-Store emulator, no device needed.)

## Immediate next action (pending your answers)

Default if you just say "go": **Local Notifications (#6)** next — pure-platform, emulator-friendly, builds the
shared channel manager that shrinks Push Slice 2. Everything else waits on Q-A/Q-B.
