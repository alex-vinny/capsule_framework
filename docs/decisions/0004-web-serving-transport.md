---
title: "ADR-004: Web-serving transport and HTTP fidelity"
audience: contributor
status: record
---
# ADR-004 — Web-Serving Transport & HTTP Fidelity

**Status:** Decided
**Date:** 2026-06-26
**Amends:** [adr-001](0001-embedded-runtime.md) decision #4 ("No WebSockets, no SSE … deliberately minimal").

---

## Context

ADR-001 already decided the production web-serving mechanism: an **embedded loopback HTTP
server** — NanoHTTPD on Android, GCDWebServer (or equivalent) on iOS — fronting the QuickJS
route runtime. That is Capsule's primary differentiator vs Ionic/Capacitor: *your `/api`
server routes run on-device, in QuickJS, and are OTA-updatable.*

Two things drifted from that decision and need correcting:

1. **`WKURLSchemeHandler` crept in as the iOS serving mechanism** (in `ios-bring-up.md`,
   `capsule-vs-ionic-capacitor.md`, and the `nanohttpd` primer). A custom scheme handler is
   the Capacitor approach and is lighter, but it **cannot serve WebSockets**, it is a thinner
   emulation of HTTP (streaming, range requests, POST-body handling are all sharp edges), and
   it makes the two platforms **architecturally asymmetric** — Android runs a real server (it
   is *forced* to: Android's `shouldInterceptRequest`/`WebViewAssetLoader` cannot read POST
   bodies), iOS would not. That asymmetry is exactly what we do not want.

2. **ADR-001 said "no WebSockets, no SSE, ever — deliberately minimal."** The product intent
   has since sharpened: Capsule should give developers a **full web experience** — realistic,
   and it must work properly. Full HTTP fidelity (including, eventually, WebSockets and SSE)
   is in scope; it is *deferred and designed*, not permanently excluded.

---

## Decisions

### 1. Embedded loopback HTTP server on **both** platforms

Production serving is a real HTTP server bound to `http://127.0.0.1:{port}/` (deterministic
port from `appId`, per ADR-001 #7), on both platforms:

- **Android:** `CivetwebServer` — CivetWeb (C) through JNI. Shipped; replaced the original
  `NanoHttpdServer` on 2026-10-24.
- **iOS:** `CivetwebServer` — the same CivetWeb sources through a SwiftPM C target. Built and
  tested; wired into the shell with the Phase-4 bring-up.

The library choice is in the [2026-10-24 amendment](#amendment-2026-10-24-civetweb-on-both-platforms)
below (originally NanoHTTPD on Android and GCDWebServer-or-equivalent on iOS).

This keeps the architectures **symmetric**: identical `/api` semantics on both platforms, one
mental model, "write once, behaves identically." The shared abstraction already exists — see
decision #4.

### 2. `WKURLSchemeHandler` is rejected as the primary iOS mechanism

It is recorded here as **considered and rejected**, so it does not drift back in. Reasons:
no WebSocket support; thinner HTTP fidelity (streaming/range/POST-body sharp edges); and it
breaks cross-platform symmetry. (It remains a *theoretical* fallback only if the embedded
server proves unviable on iOS — not expected.)

### 3. `https://localhost` is rejected on both platforms

TLS on loopback needs a certificate the WebView **trusts**. No public CA issues certs for
`127.0.0.1`/`localhost`; a self-signed cert makes the WebView throw TLS errors unless you ship
*and install* a trusted anchor (per-device provisioning, fragile, ongoing maintenance). Plain
`http` on loopback already gives a stable, app-controlled, **secure-context** origin — so
`localStorage` / `IndexedDB` / service workers / CORS all behave correctly. `https` buys
nothing over loopback `http` and costs a cert-trust burden. (On iOS, cleartext loopback `http`
needs the `NSAllowsLocalNetworking` ATS exception — declared once in `Info.plist`.)

### 4. The cross-platform abstraction is already built — keep it, finish one seam

The symmetric, unit-testable layer ADR-001 #13/#14 mandated already exists:

- **`CapsuleServer`** interface + **`FakeCapsuleServer`** (neverStarts / startsAfter /
  crashesAfter) already unit-test the orchestration on the JVM.
- **`CapsuleRuntime`** (start → splash → bind → navigate; crash-loop; rollback) is
  platform-neutral and never names the server library.
- **The routing brain is shared JS**: both servers are thin *socket-to-QuickJS pumps* that
  marshal an HTTP request to a neutral shape (`HttpRouteResponse` / `@capsule/core`'s
  `CapsuleHttpRequest`) and call `QuickJSBridge.handleHttpRequest`. The actual `/api/*`
  dispatch is `@capsule/core` JS running inside QuickJS — already identical on both platforms.

**One refactor to finish the dream:** the socket→QuickJS seam is currently an inline
`apiHandler` lambda in the wiring. Promote it to a named `HttpApiRouter` interface so it is an
explicit, fake-able contract on both platforms.

> **Done (2026-10-24), as `RequestRouter`** (Kotlin and Swift, rule for rule). It owns every
> routing decision — `/api/*` → the injected QuickJS handler, everything else → a `StaticAssets`
> source, `/` → `index.html`, `..` rejected, the 404/500 bodies — and has no HTTP-library or
> platform dependency, so it is unit-tested on its own (`RequestRouterTest` on the JVM,
> `RequestRouterTests` in Swift). The `CivetwebServer` transports only move bytes between the
> socket and `route()`.

### 5. HTTP fidelity is tiered — request/response + streaming now; WebSockets/SSE deferred-by-design

This **amends ADR-001 #4**. HTTP is no longer "deliberately minimal forever":

| Tier | Capability | Status |
|------|-----------|--------|
| **Now** | Static asset serving + request/response `/api/*` routes (GET/POST/PUT/DELETE) + **streaming responses** (chunked) | In scope for Phase 4 parity |
| **Future** | **WebSockets** (`ws://localhost`) for on-device real-time | Designed, not excluded — roadmap |
| **Future** | **Server-Sent Events (SSE)** + **range requests** (media seeking) | Designed, not excluded — roadmap |

**WebSockets/SSE are not free with a server.** A socket gives the *transport*, but
`@capsule/core`'s route model is request/response (`handleHttpRequest` → one response). A
WebSocket is a long-lived bidirectional stream — there is **no `onOpen`/`onMessage`/`onClose`
route type yet**. Delivering it is a **new core API design** (on both platforms), plus the
single-threaded QuickJS engine must pump frames. So WebSockets/SSE are scheduled as explicit
future roadmap features, designed deliberately — **not promised in the first iOS cut.**

> This does not change ADR-001's channel split (Bridge = native events/push; HTTP =
> request/response data). WebSockets/SSE here are *web-standard real-time inside the on-device
> server* — for "any web app just works" fidelity — distinct from Capsule's native-event Bridge.

---

## Realism constraints (it "must work properly")

1. **iOS background-socket teardown.** iOS closes the listening socket when the app suspends.
   Foregrounded — when the user is actually using the app — it is flawless. The discipline:
   **re-bind the server on `sceneWillEnterForeground`** (before the WebView is interactive);
   long-lived connections (WS/SSE, when they land) **reconnect on foreground** — exactly how
   real mobile web apps already handle backgrounding. Realistic, and matches web semantics.
2. **Single-threaded engine.** Concurrent `/api` calls serialize through QuickJS. Fine for a
   local app; revisit only if a real workload bottlenecks.
3. **POST-body certainty.** A real server reads request bodies natively — sidestepping the
   `WKURLSchemeHandler` `httpBody`-dropping sharp edge entirely (a bonus of decision #1).

---

## Consequences

- The iOS shell ships a `CapsuleServer` impl (CivetWeb, see the amendment), **not** a scheme handler.
- `CapsuleRuntime`, `FakeCapsuleServer`, and the QuickJS route brain are reused unchanged on
  iOS; only the thin server adapter is per-platform (see [platform-parity.md](../contributing/platform-parity.md)).
- The `HttpApiRouter` seam refactor (decision #4) is done — `RequestRouter`.
- WebSockets and SSE become **roadmap items** with a core-API-design dependency
  ([roadmap.md](../project/roadmap.md)).
- Three docs that drifted to `WKURLSchemeHandler` are corrected to point here.

**Full Android ↔ iOS language/tooling parity (with this decision baked in):**
[platform-parity.md](../contributing/platform-parity.md).

---

## Amendment 2026-10-24: CivetWeb on both platforms

**Decision.** Both shells embed **[CivetWeb](https://github.com/civetweb/civetweb)** (C, MIT),
replacing NanoHTTPD on Android and the planned GCDWebServer on iOS. One copy of the sources is
vendored at `packages/native/civetweb/` (pinned release tag in its `VERSION` file) and compiled by
both builds — Android's CMake into `libcapsule_server.so`, iOS's repo-root `Package.swift` as the
`CCivetweb` target — with the same defines.

**Why:**

1. **One server, two platforms.** Decision #1's symmetry stops being "two libraries that should
   behave alike" and becomes the same C code answering the same requests. `RequestRouter`
   (decision #4) is ported rule for rule, so routing is identical too.
2. **Readiness by construction.** `mg_start2` returns only after the listening socket is bound
   and listening. The startup race NanoHTTPD 2.3.1 caused
   ([2026-10-embedded-server-startup.md](../project/incidents/2026-10-embedded-server-startup.md)) cannot occur, so
   the readiness probe and bind-retry loop were deleted rather than ported.
3. **The deferred WebSocket tier (decision #5) is in the same library.** CivetWeb implements
   WebSockets (`USE_WEBSOCKET`, off for now); when the core-API design for WS routes lands, the
   transport needs no second library.
4. **Loopback only.** The server binds `127.0.0.1:{port}`, not every interface — nothing off the
   device can reach it (NanoHTTPD bound all interfaces).
5. **Maintenance.** NanoHTTPD's last stable release is 2.3.1 (2016); GCDWebServer's repository
   is archived (2023). CivetWeb is still developed upstream (commits in 2026); its newest release
   tag, v1.16, is what is vendored.

**Build configuration** (`packages/native/civetweb/README.md`): `NO_SSL` (decision #3), `NO_CGI`,
`NO_FILES` (CivetWeb never serves files — Capsule answers every request in `begin_request`; assets
come from the APK / app bundle), `NO_CACHING`. `NO_FILESYSTEMS` is deliberately not set — it would
require custom error- and access-log hooks. Only **release tags** are vendored: an upstream
`master` snapshot (2026-04) did not compile. Updating: `node scripts/update-civetweb.mjs <tag>`.

**Behaviour both platforms now guarantee:**

- `start()` returns once the port accepts connections; a request made immediately after succeeds.
- `stop()` returns at once and releases the port on a background thread (`mg_stop` joins workers,
  and a worker can be inside an `/api` route that waits on the main thread). The next `start()` on
  the same port waits for that shutdown instead of failing with "in use".
- Every response carries `Cache-Control: no-cache`, because an OTA update swaps files behind the
  same URLs.
- A bind failure surfaces as a typed error (Android `ServerStartupException` "Port N is already in
  use…", iOS `ServerStartupError.portInUse`).
