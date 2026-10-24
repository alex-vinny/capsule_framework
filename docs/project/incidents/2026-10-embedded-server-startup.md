---
title: "Incident: embedded server startup (2026-10)"
audience: contributor
status: record
---
# Embedded Server Startup — Bind-Race Analysis & Fix Plan

> **Status:** analysis complete (2026-10-15); SR-1, SR-3 and SR-4's error-screen catch-all shipped; **resolved 2026-10-24 by
> replacing the server** — see [Resolution](#resolution-2026-10-24-civetweb) below. D2/D3 (probe + bind
> retry) were removed with NanoHTTPD.
> **Symptom source:** cold-start testing on emulator + real device — the splash ("loader") does
> not wait for the server and reveals an error page (reported as a 404; the WebView error page
> for this failure is actually `net::ERR_CONNECTION_REFUSED` — same user-visible UX).
> **Owns:** the startup contract for the embedded loopback server ([adr-001 #6](../../decisions/0001-embedded-runtime.md),
> serving transport per [adr-004](../../decisions/0004-web-serving-transport.md)).

---

## Resolution 2026-10-24: CivetWeb

The server itself was replaced on both platforms by **CivetWeb**
([adr-004 amendment](../../decisions/0004-web-serving-transport.md#amendment-2026-10-24-civetweb-on-both-platforms),
primer: [civetweb.md](../../concepts/primers/civetweb.md)). That changes how each part of the fix design holds:

| Design item | Now |
|---|---|
| **D1** contract — `start()` returns only when the port accepts | Unchanged, and now true **by construction**: `mg_start2` returns only after the listening socket is bound and listening. Stated on the Kotlin `CapsuleServer` interface and the Swift `CapsuleServer` protocol (SR-5). |
| **D2** readiness probe, **D3** bind retry | **Removed** — nothing to wait for. A bind failure is reported by CivetWeb directly and surfaces as a typed error: Android `ServerStartupException` ("Port N is already in use by another process" when the port is held), iOS `ServerStartupError.portInUse`. |
| **D4** WebView main-frame retry | Kept as defense in depth (`WebViewRetryPolicy`, `WebViewRetryPolicyTest`). |
| **D5** error surfacing | Unchanged (`CapsuleActivity` catch-all → error screen). |

**Stop/start semantics (new).** `stop()` returns at once and releases the port on a background
thread: `mg_stop` joins CivetWeb's workers, and a worker can be inside an `/api` route that waits
on the main thread, so joining on the caller's thread could deadlock. The next `start()` on the
same port waits for that shutdown before binding — an Activity/scene recreation never sees
"port in use" from its own previous instance.

**Where the contract is pinned:**

- **Android** — `CivetwebServerTest` (instrumented, `src/androidTest/`): a GET immediately after
  `start()` with no sleep or retry; port-in-use → typed exception; a new server starts on the same
  port right after `stop()`; plus assets, 404s, a 1 MB streamed asset, `/api` through JNI, `HEAD`.
  These moved from the JVM tier to the instrumented tier because the native server cannot load on a
  plain JVM; the routing rules stay on the JVM (`RequestRouterTest`, `ParseHeadersTest`).
- **iOS** — `CivetwebServerTests` (7 tests, real sockets — run on Linux in Docker) mirrors the
  Android cases; `RequestRouterTests` (10) mirrors `RequestRouterTest`.

**SR-4 with the new server (2026-10-24, API 36 emulator, `examples/react-ts` release build):** 20 cold
starts + 10 quick relaunches, every launch rendered, no startup error. Still to repeat on a physical
device. **S2 (below) is still open:** the server still serves the bundled `www/` only, not the
OTA-installed bundle.

---

## Root cause — verified against the `nanohttpd-2.3.1` bytecode, not guessed

`CapsuleRuntime.start()` (runtime/CapsuleRuntime.kt) runs:

```
withTimeout(timeoutMs) { server.start() }        // NanoHttpdServer.start()
quickJsBridge?.load()
navigator.navigateTo("http://127.0.0.1:${server.port}/")
```

`NanoHttpdServer.start()` calls `httpd.start(SOCKET_READ_TIMEOUT, false)`. Decompile of
`fi.iki.elonen.NanoHTTPD#start(int, boolean)` (2.3.1, from the resolved jar):

```
getServerSocketFactory().create()      // UNBOUND ServerSocket — no bind here
myServerSocket.setReuseAddress(true)
createServerRunnable(timeout)          // the Runnable performs the bind
new Thread(runnable).start()           // bind runs on the new thread…
// …and start() RETURNS — before the socket is bound or accepting
```

`ServerRunnable.run()` then calls `ServerSocket.bind(...)` on that thread and records failures
in a **private** `bindException` field — there is no public API in 2.3.1 to observe bind success
or failure.

**So `CapsuleServer.start()` returns before the server can accept a single connection.** The
documented contract — adr-001 #6 "binds NanoHTTPD … on ready → navigate" and the runtime KDoc
"if the server does not bind within `timeoutMs`" — is not enforced anywhere. Consequences:

| # | Failure chain | User-visible |
|---|---|---|
| F1 | Fast device: renderer connects before `bind()` completes | `ERR_CONNECTION_REFUSED` error page ("404" as remembered) |
| F2 | `withTimeout(3s) { server.start() }` — `start()` already returned, so the timeout **never bounds the bind**; it only guards a hung `withContext(IO)` | the documented 3s guard is dead code for this failure mode |
| F3 | Quick relaunch in the dev loop: the previous process still holds the deterministic port → `bind()` throws **inside the thread**, stored in private `bindException`, never surfaced; server never comes up | splash hangs until `readyTimeoutMs` (10s), then reveals the error page; the 3s timeout never fires |
| F4 | A refused load never reaches `notifyAppReady` → `CrashLoopGuard` records it as an unconfirmed launch — the right reaction, but F1's root cause can *manufacture* crash loops | spurious rollback risk on fast cold-restarts |

Why it is intermittent: the race window is (thread start → `bind()`), a few milliseconds —
slow devices lose the race less often than fast emulators. Matches the emulator + device reports.

## Secondary finding (related, separate task)

`NanoHttpdServer.serve()` serves static files **only from `assets/www/`**. OTA bundles installed
by `BundleStore` (`filesDir/bundles/active`) are never served — on-device CodeSync updates
cannot apply. Tracked as its own roadmap item (S2 below); the startup fix does not depend on it.

---

## Fix design

### D1 — Contract: `CapsuleServer.start()` returns only when the server accepts connections

The honest interface. KDoc on `CapsuleServer` states it; implementations enforce it. The
runtime's existing `withTimeout(timeoutMs)` finally becomes the real bind deadline it always
claimed to be. (Recorded as an amendment to adr-001 #6.)

### D2 — Enforcement: readiness probe in `NanoHttpdServer`

After `httpd.start(...)`: loop-connect a local socket to `127.0.0.1:{port}` (backoff 20–50ms,
deadline ≈ 2s — inside the runtime's 3s), close immediately. A successful connect is the
definitive "bound + accepting" proof (what production health checks do) — it sidesteps
NanoHTTPD 2.3.1's private `hasBinded`/`bindException`. On deadline: throw a typed
`ServerStartupException`, diagnosed by attempting a bind (distinguishes "port in use" from
other failures).

### D3 — Hardening: bind retry with backoff

Retry `httpd.start()` up to 3 times (200ms apart) before failing — absorbs the quick-relaunch
race (F3). Failures after the last attempt surface as D2's typed exception.

### D4 — Defense in depth: WebView main-frame retry

In `CapsuleWebViewClient`: on main-frame connection-type errors
(`ERROR_CONNECT`, `ERROR_CONNECTION_REFUSED`… — not `ERROR_UNKNOWN`, not sub-frame), retry the
load up to 3 times (150/300/600ms) before surfacing the error screen. The retry decision
(`shouldRetryLoad(errorCode, attempt)`) is a **pure function + unit test**, per the repo's
pure-logic discipline.

### D5 — Error surfacing

`CapsuleActivity` catches `ServerStartupException`/`IOException` alongside
`TimeoutCancellationException` → the same error screen. No silent thread-internal death (F3).

### Explicitly rejected

- **Ephemeral port (`port 0`)** — adr-001 #7's deterministic port stays (dev-server consistency,
  `adb reverse`, deep-link stability).
- **Holding the splash for "server ready" instead of "page ready"** — the splash already waits
  for page render; the bug is load-before-bind, not splash timing.
- **A third "loading" HTML page** served by the server — the server is the thing not ready.

---

## Plan

| Phase | Deliverable | Done-when |
|---|---|---|
| **SR-1** | D1 contract: `CapsuleServer.start()` KDoc + `ServerStartupException` type; `FakeCapsuleServer` unchanged (`StartsAfter` already models a slow bind) | compiles; all 168 existing tests green |
| **SR-2** | D2+D3 in `NanoHttpdServer`: probe loop, bind retry, typed failure | new real-socket test: a `GET /` immediately after `start()` returns succeeds (ephemeral port); probe-deadline test asserts the typed exception |
| **SR-3** | D4: pure `shouldRetryLoad(errorCode, attempt)` + wiring in `CapsuleWebViewClient` | JVM unit test pins the decision table; existing `CapsuleWebViewClientTest` green |
| **SR-4** | D5: Activity catch-all → error screen | manual e2e: 20× cold start on emulator + device with **zero** error pages; 10× quick-relaunch with a clear error (if a stale holder is simulated) |
| **SR-5** | iOS parity: the same contract recorded for the future Swift `CapsuleServer` (Phase 4) — GCDWebServer-class impl must bind-before-return | contract text in adr-001 + this doc; iOS `CapsuleServer` protocol (when created) carries it |

## Verification

- Emulator + real device: 20× cold start — no error pages; 10× rapid relaunch — clean failure
  mode (no silent hang past 3s).
- `pnpm --filter @capsule/core test` + Kotlin `testDebugUnitTest` stay green.
