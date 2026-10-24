---
title: "ADR-002: Capsule UI"
audience: contributor
status: record
---
# ADR-002 — Capsule UI (native-look component layer)

**Status:** Proposed / Future (target **Phase 5** — native-look component layer, slotted right after iOS so its iOS/Material presets target a real WKWebView shell; per the canonical [roadmap](../project/roadmap.md)). Not started.
**Date:** 2026-06-12

## Context

Capsule provides a native **runtime + bridge + tooling** layer but **no UI layer**. The
hand-written CSS in the starter templates looks "web," not like a native app button
(iOS/Material). Developers either hand-roll native styling or pull in a third-party kit.

The two competing kits in this space are tied to the **Framework7** ecosystem:
- **Framework7** — full mobile UI + router; packages natively via Capacitor/Cordova (which is
  what Capsule *competes with* at the runtime layer).
- **Konsta UI** — F7's Tailwind-based component library (iOS/Material), React/Vue/Svelte only.

We want a native look **without building our identity on a competitor-adjacent dependency**,
and it must work across **all 7 supported frameworks** (React, Vue, Svelte, Angular, vanilla JS,
vanilla TS, jQuery) — Capsule's framework-agnostic promise.

## Decision

Build **Capsule UI** as our own native-look component layer, on these principles:

1. **Tailwind + a custom iOS/Material preset** authored by us — the styling foundation. Native
   button/list/tab/sheet *shapes* we design, not a borrowed web aesthetic.
2. **Framework-agnostic CSS classes first** — components are Tailwind classes (or a daisyUI-style
   semantic layer) that work in *every* framework. Per-framework headless behavior (Radix for
   React, Reka for Vue, Bits for Svelte, Angular CDK) only where complex interaction needs it.
3. **shadcn-style distribution** — `capsule add ui <component>` copies source the developer owns
   into their project (no runtime dependency), via the **same registry/manifest machinery built
   for templates**. This is the on-brand, high-value part.

**daisyUI is the structural model to borrow** (or literally build on): pure-CSS, framework-agnostic,
themeable — exactly our constraints. We add the native shapes + minimal behavior it lacks.

## Alternatives considered

| Option | Native look | All frameworks | Why not (as the base) |
|---|---|---|---|
| **Konsta UI** (dependency) | ★★★ | React/Vue/Svelte only | Not agnostic; competitor-adjacent. Good **interim recommendation** for the 3 it supports. |
| shadcn / Radix base | ✗ desktop-web | React-mostly | React-bound; desktop aesthetic; no mobile primitives. Borrow its **delivery model**, not its components. |
| daisyUI | ✗ web (themeable) | ✅ pure CSS | Best-aligned **model**; ship native theme on top. |
| Flowbite / Preline | ✗ dashboard | mixed + JS dep | Web aesthetic + runtime JS plugin + uneven multi-framework. |
| Bulma / Bootstrap | ✗ web | ✅ classes | Web look (the original problem). |
| Ionic | ★★★ | (Angular/React/Vue) | Different stack (web components), heavy, reshapes the app. |

## Phasing

- **Now (separate, shipped first):** optional **`--css tailwind`** flag + a shared **native preset**
  (iOS/Material classes mapped onto the existing `.btn`/`.card`/`.tab` names) so every template
  looks native immediately, no per-template rewrite. Recommend Konsta as a documented interim for
  React/Vue/Svelte.
- **Phase 5 (this ADR):** the `capsule add ui` registry + shared iOS/Material Tailwind preset +
  per-framework behavior. Capsule's own "Konsta," independent of F7's ecosystem. Placed after iOS
  (Phase 4) so the iOS preset can be validated against a real WKWebView shell, before the OTA cloud.

## Consequences

- A real, multi-week initiative (effectively a component framework + registry). Deferred until the
  runtime is hardened (Step 7) and core testing is complete.
- Reuses the template manifest/registry infra → lower incremental cost than starting from scratch.
