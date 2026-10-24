---
title: "Migrating Ionic and Framework7 apps"
audience: app-developer
status: planned
---
# Migrating Ionic & Framework7 Apps into Capsule

> Companion to [chatgpt-plugin-compatibility.md](../project/research/chatgpt-plugin-compatibility.md). That doc covers the
> *plugin* importer (Capacitor/Cordova native → Capsule ABI). This doc answers the higher-level
> question: **can an existing Ionic or Framework7 app run inside Capsule, and is it worth building a
> migration on-ramp?**

---

## The core reframe: UI is free, native is the work

Ionic and Framework7 are **web UI libraries**, not runtimes.

- **Ionic** = web components (`@ionic/react`, `@ionic/vue`, `@ionic/angular`, or raw `ionic-core`
  custom elements). The *native* runtime underneath is **Capacitor** (or legacy Cordova).
- **Framework7** = a web UI + in-app router (vanilla / React / Vue). Native access is via
  Cordova/Capacitor plugins the app added.

Capsule's entire architecture is **"serve any web bundle in a WebView."** Therefore:

| Layer | Migration cost | Why |
|---|---|---|
| **UI components / router** | **~Free** | They're web code. They render in Capsule's WebView exactly as in Capacitor's. Point `web.buildCommand` at the existing `ionic build` / `framework7` build. Capsule's bundler-agnostic design (rollup-solid, rspack-lit, webpack-preact examples) already proves arbitrary bundlers work. |
| **Native plugin calls** (`@capacitor/camera`, `Preferences`, `Keyboard`, `StatusBar`, `App`…) | **The real work** | These hit the native bridge. Handled by the plugin importer + a Capacitor-compat shim (below). |

> **Do not** try to host Capacitor's `Bridge`/lifecycle internals. That recreates the
> `Capsule → Capacitor → Cordova` stack the plugin-compatibility doc explicitly rejects. The goal is
> **make migration cheap, not execution universal.**

---

## The highest-leverage piece: `@capsule/compat-capacitor`

A JS shim package that re-implements `@capacitor/core`'s `registerPlugin()` and the **Level-1 plugin
facades** (`Camera`, `Preferences`, `Device`, `Share`, `Haptics`, `Clipboard`) as thin wrappers over
Capsule's existing JSON-RPC bridge.

With it, migrating a well-behaved Ionic app is:

```bash
# 1. Alias @capacitor/* → @capsule/compat-capacitor in package.json
# 2. Point web.buildCommand at the existing build
# 3. capsule sync && capsule build android
```

For Level-1 plugins this is **zero application-code change**. That is the single best acquisition
funnel: a `capsule migrate ionic` command that demos in ~5 minutes.

---

## Table-stakes native equivalents (must exist or migrated apps feel broken)

Ionic apps lean on a few Capacitor plugins for basic chrome/behavior. These need first-class Capsule
bridge equivalents before "it just works" is true:

- **`App`** — hardware back button + deep links (Ionic relies on this heavily on Android).
- **`Keyboard`** — show/hide events, resize behavior.
- **`StatusBar`** — color/style.

These are cheap to build but non-optional for a credible migration story.

---

## Framework7 specifics

F7 is generally **easier** than Ionic to bring over:

- Its UI + router are pure web — no native assumptions in the router itself.
- Its native touchpoints are whatever Cordova/Capacitor plugins the app explicitly added → same
  importer/shim path.
- Watch for apps that inject `cordova.js` directly or call `cordova.exec(...)` — those route through
  the Cordova importer (harder; see plugin-compatibility doc §Cordova).

---

## Is it worth it?

**Yes — as a go-to-market on-ramp, not a runtime compatibility layer.** Rationale:

1. **Market timing.** Microsoft App Center retired (March 2025) and CodePush was deprecated, orphaning
   many hybrid apps. Appflow is expensive and Ionic-locked. There is an actively-shopping audience.
2. **The migration command is the funnel.** "Bring your existing Ionic/F7 app, get OTA + auto-rollback,
   no lock-in" converts directly into Server Code Push customers (see [project/business/business-model.md](../project/business/business-model.md)).
3. **Cost is bounded.** UI is free; the work is the importer + compat shim + ~3 table-stakes plugins —
   not an open-ended compatibility treadmill.

**Scope guardrail:** cap support at the importer + compat shim + Level-1 certified plugins. Deep-runtime
plugins (those touching `bridge.getWebView()`, `CordovaInterface`, etc.) stay **manual port** with
generated scaffolding. Never inherit another framework's runtime.
