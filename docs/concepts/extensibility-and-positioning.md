---
title: "Extensibility and positioning"
audience: maintainer
status: draft
---
# Extensibility & Positioning — Exploration (pre-ADR)

> **Status: exploring · decision pending.** Captures the "batteries-included vs thin-core" positioning
> debate and the plugin-architecture thinking from the 2026-06-24 brainstorm, plus the supporting
> competitive research, so we can resume without re-deriving it. **Do not build a plugin/extension
> system off this yet** — it's premature until there's real long-tail/ecosystem demand. When we commit,
> this graduates to `adr-004-extensibility-model.md`.
>
> Related: [0003-ai-and-agents.md](../decisions/0003-ai-and-agents.md) (agent tools = native bridge surface),
> [2026-06-24-planning-brainstorm.md](../project/research/2026-06-24-planning-brainstorm.md) (sequencing),
> the capability seam in `protocol/CapabilityRegistry`, and the upkeep lockstep discipline
> ([upkeep.md](../contributing/upkeep.md)).

---

## The question

Two identities for a cross-platform mobile framework:

- **Batteries-included & opinionated** (Expo managed-workflow style): ship one complete, tested native
  shell; the developer writes JS. "It just works." Caps the niche long tail.
- **Thin core & open ecosystem** (Capacitor style): tiny core, everything else is third-party native
  plugins. Max flexibility — and max "plugin hell."

Owner's current lean (2026-06-24): *"I tend to be in both… I don't know,"* while agreeing that
**Capsule's OTA + capability architecture makes the opinionated path genuinely better, not just safer.**

## The synthesis that resolves "both"

It's **not** an either/or once you pick the right axis. The dividing line isn't *open vs closed* — it's
**native vs JS**:

- **Be opinionated where mistakes are expensive and un-hot-fixable → native.** Native code can't be
  OTA'd (store policy + security), breaks builds, and carries the version-matrix risk. So keep native
  **curated, tested, and shipped as one coherent shell.** This is the Expo-like "it just works."
- **Be thin-core/open where it's cheap and safe → JS / OTA.** Anything implementable in JS (higher-level
  APIs, agent tools, business logic, even some "native-sounding" features — see classification below)
  ships as a normal npm package **or** an OTA bundle. No native build, no autolink, no version hell.

So Capsule is **both, by layer:** opinionated batteries-included *shell* + open thin-core *JS/OTA*
surface. The owner's instinct is correct and reconcilable — the question was just mis-framed as one axis.

## Why Capacitor became "plugin hell" (root causes)

1. **Native code distributed as third-party npm packages** → version drift ("plugin v5 needs Capacitor
   v6"), opaque native build breakage, dependence on abandoned packages.
2. **Autolinking magic** that fails cryptically.
3. **No runtime capability negotiation** → a JS update can call a plugin API the installed binary lacks → crash.

## Capsule's architectural antidotes (already present)

- **(3) → solved by `CapabilityRegistry` + OTA gating.** The shell advertises `{capability: version}`; a
  JS bundle declares what it needs; OTA refuses an update the installed shell can't satisfy. Capacitor
  has no equivalent. (Built into every Phase-3 API as the `CAPABILITY`/`CAPABILITY_VERSION` constants.)
- **(1) → solved by CLI-enforced lockstep.** Versions are reconciled by tooling, not the user (the
  library-catalog ↔ `sync.ts` linked-pair discipline from the upkeep doc, generalized).
- **The structural move:** the **unit of native extension is the shell, not the plugin.** Capsule already
  treats the shell as a first-class swappable artifact (`CAPSULE_SHELL_OVERRIDE_PATH`; the planned "shell
  registry"). There is always **one coherent, tested native binary per app** — assembled/selected with
  the capabilities it needs, version-pinned — instead of a pile of independently-versioned native
  packages autolinked together. **No version matrix = no hell.**
- **The bias:** push everything that *can* be JS into the OTA layer, keep the native primitive set small
  and general. Fewer native surfaces = less to break. (Also makes the agent-tool surface in adr-003 clean.)

## Proposed tiered model (the likely ADR shape)

1. **First-party curated shell** — the table-stakes APIs ship *in* the tested shell. "Batteries-included"
   is a feature vs Capacitor's assembly-required hell.
2. **JS / OTA capabilities (the big one)** — anything not needing platform code ships as npm or OTA
   bundles. Frictionless; where most "plugins" should live; where Capsule has far more room than
   Capacitor because of QuickJS + OTA.
3. **Governed native extension (later, long tail)** — *not* free npm-native plugins, but a **vetted
   registry of shell modules**, each pinned to the shell version it's built against, assembled into a
   custom shell by the CLI with lockstep enforced and capability-gated.
4. **Build-your-own-shell** — power-user escape hatch for anything off-registry.

**Rule:** most extension is JS/OTA (frictionless); native extension is whole-shell-level and
CLI-governed (no version matrix); **free-for-all npm-native is never allowed.**

## Does every native-sounding API actually need native code?

No — useful when deciding "core vs JS/OTA" for each future capability:

| Capability | Truly needs native? | Note |
|------------|--------------------|------|
| Camera, NFC, Bluetooth, Biometrics, Push, Secure Storage, Local Notifications, Status bar, Background jobs, App Badge, App Launcher, Browser (Custom Tabs), Share, Splash, Screen Orientation, Telecom/SMS | **Yes** | Platform APIs / hardware — must be in the shell. |
| **SQLite** | **No** | `wa-sqlite`/`sql.js` (WASM) runs in the WebView with OPFS persistence — pure JS, OTA-updatable. |
| **Toast / Action Sheet** | **Optional** | Can be web UI in the WebView; native is polish, not necessity. |
| Higher-level APIs, agent tools, orchestration | **No** | JS composing native primitives → OTA layer. |

## Positioning / marketing angle

"Opinionated, batteries-included, **no plugin hell**, JS/OTA for the long tail" is a *differentiator*, not
just a safety choice — and a concrete contrast to Capacitor's assemble-and-pray native-plugin model. The
OTA + capability architecture is what makes the opinionated path *better*, not merely *safer*.

## Open questions to resolve before this becomes adr-004

- Where exactly is the **first-party shell line**? (Which capabilities are "always in the shell" vs
  "registry shell-module" vs "JS-only"?)
- What governs the **vetted registry** (review bar, who can publish, signing)?
- Does the **shell-module** mechanism assemble at `sync`/`build` time, or are there prebuilt shell
  variants in the registry? (Build-time assembly vs binary selection.)
- How does **capability gating** interact with registry modules at OTA time (advertise per-module versions)?
- Pro-tier hook: private shell registry as a monetization surface (ties to [biz model](../project/business/business-model.md)).

## When to revisit

Not now. Keep shipping first-party into the curated shell and writing JS for everything else. Revisit when
(a) real long-tail/niche native demand appears, (b) third parties want to contribute capabilities, or
(c) the Pro-tier private-shell-registry becomes a monetization priority (Phase 6+). The `CapabilityRegistry`
is the seam a future system gates on, and "shell, not plugin" is the principle to hold until then.

---

### Appendix — competitive research (2026-06-24 scan, condensed)

- **Capacitor 7 GA (2025-01-20), Capacitor 8 (2025-12-08):** SPM default on iOS, Android edge-to-edge /
  `SystemBars`, ~6-month release cadence tracking annual OS releases.
- **Official plugin set expanding:** Capacitor *absorbed* Barcode Scanner and added Privacy Screen, Http,
  Cookies, File Transfer/Viewer, Background Runner, and split Browser → `@capacitor/browser` +
  `@capacitor/inappbrowser`. (Signal: even Capacitor is curating more into "official.")
- **Appflow winding down** (sales stopped 2025-02-11, EOL 2027-12-31; Live Updates → paid OutSystems
  cloud). Independent OTA (Capawesome Cloud, Capgo) is filling the vacuum — validates Capsule's OTA bet.
- **On-device LLM is now first-party:** Ionic shipped `capacitor-local-llm` v1.0.0 (2026-05-11) — unified
  TS API over Apple Foundation Models + Gemini Nano (text + image gen + sessions). Plus **Capacitor Skills**
  (2026-06-03) = reusable AI-agent primitives — the same thesis as adr-003. So Tier-1 `ai` is now parity;
  the moat is OTA-updatable agents.
- **Framework7 v9 (2025-11, latest v9.0.5 2026-05-27):** iOS-26 visual redesign, React 19 / Svelte 5
  adapters. Pure UI/router layer — defers all native to Capacitor/Cordova; no native or AI moves. (Relevant
  only to Phase-6 migration UX, not native-capability competition.)
- **Community native-plugin concentration** (the "hell" surface): clusters around @capacitor-community,
  Capawesome (Robin Genz), Capgo (Martin Donadieu), Aparajita. High-value categories Capacitor users reach
  for: secure storage, ML-Kit barcode, file picker, app badge, social/OAuth login, in-app review/update,
  background geolocation, TTS/STT.
