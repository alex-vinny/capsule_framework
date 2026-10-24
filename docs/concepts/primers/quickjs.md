---
title: "QuickJS in Capsule"
audience: contributor
status: current
code:
  - packages/native/quickjs/**
  - packages/capsule-android/capsule/src/main/cpp/quickjs_jni.c
  - packages/capsule-android/capsule/src/main/kotlin/dev/capsule/runtime/QuickJS*.kt
  - packages/core/src/router.ts
tests:
  - packages/capsule-android/capsule/src/androidTest/kotlin/dev/capsule/runtime/QuickJS*Test.kt
---
# QuickJS in Capsule — the on-device JavaScript engine

> You write JS/TS for browsers and Node, where the engine (V8) is invisible. Capsule **embeds its own
> JS engine** inside the native app and runs your *server-side* code in it. This primer explains what
> that engine is, why Capsule embeds one, and the few hard constraints it imposes.

## What is a "JavaScript engine"?

A JS engine parses and executes JavaScript. You already use two without thinking: **V8** (Chrome,
Node, the Android WebView) and **JavaScriptCore** (Safari/iOS). They're big, fast, and tied to their
host. **QuickJS-ng** is a different animal: a small (~1 MB), embeddable, spec-compliant engine written
in C that you can compile into *your own* app and call directly. (QuickJS-ng is the maintained
community fork of Fabrice Bellard's original QuickJS.)

> C#/.NET analogy: it's like embedding a scripting runtime (think a tiny self-contained
> `ClearScript`/Jint) inside your process and calling into it — except QuickJS is C, reached via JNI
> (see [jni-and-cpp.md](jni-and-cpp.md)).

## Why does Capsule embed one? (There's already a WebView with V8…)

The WebView runs your **front-end** JS. But Capsule also runs your **server-side** code — the
`src/server/routes/**` handlers and JSON-RPC route overrides — and that code must run:

- **Outside the WebView**, so it isn't coupled to the page's lifecycle, DOM, or a reload;
- **In a controlled, swappable sandbox**, because this is the code **Server Code Push / OTA** will
  hot-update (Phase 6). You can ship new bundle JS to QuickJS without touching the native shell.

So the architecture is: **front-end JS in the WebView (V8); back-end JS in QuickJS.** The localhost
server ([civetweb.md](civetweb.md)) routes `/api/*` from the WebView into QuickJS. That clean split —
and an OTA-updatable JS layer that the native capabilities back — is the whole point.

## How Capsule drives it

The JS bundle (built by `capsule build` from your `src/routes` + `src/server/routes`, bundled with
esbuild into `assets/server/bundle.js`) is loaded once, then invoked per request. The engine surface is
tiny — [QuickJSEngine.kt](../../../packages/capsule-android/capsule/src/main/kotlin/dev/capsule/runtime/QuickJSEngine.kt):

```kotlin
suspend fun evaluate(bundle: String)                       // load/run the bundle once (defines handlers)
suspend fun call(fn: String, args: String): String         // call a global fn, JSON in → JSON out
```

`evaluate` runs your bundle, which registers route handlers on `globalThis`. Each HTTP/RPC request
becomes a `call("handleHttpRequest", jsonArgs)` (or `dispatch`) that returns a JSON string. The
implementation ([QuickJSEngineImpl.kt](../../../packages/capsule-android/capsule/src/main/kotlin/dev/capsule/runtime/QuickJSEngineImpl.kt))
crosses JNI into the C engine on its pinned single thread.

## The hard constraints (these are non-obvious and bite people)

These are distilled in the [[quickjs-constraints]] note; they matter whenever you touch the runtime or
the bundle contract:

1. **`globalThis` is the only reliable store.** QuickJS-ng's embedding here doesn't give you ES module
   semantics or a persistent module registry across calls the way Node does. Route handlers must
   register themselves onto `globalThis` (that's what the bundle's `addRoute`/`addHttpRoute` do), and
   the Kotlin side calls **global** functions by name (`call("handleHttpRequest", …)`). Don't assume
   `import`/module-scope state survives between `call`s — put shared state on `globalThis`.

2. **`dispatch()` must return an object, not a string.** The C JNI glue serializes the return value;
   if JS already returns a JSON *string*, it gets double-encoded (string-of-a-string). Handlers return
   plain JS objects and let the boundary serialize once. (This is exactly why `core/src/router.ts`'s
   `dispatch()` returns an object.)

3. **It's not V8.** QuickJS-ng is spec-compliant and current (ES2023-ish) but it is **not** a browser
   and **not** Node: no DOM, no `window`, no Node built-ins (`fs`, `http`, `Buffer`), no V8-specific
   extensions, and performance is "small and fast for embedding," not "JIT-fast like V8." Your server
   routes must be self-contained JS. Native capabilities (filesystem, network, etc.) are reached by
   the *app* through the bridge, not by QuickJS calling Node APIs.

4. **Single-threaded, pinned thread, 4 MB stack.** (Mechanics in [jni-and-cpp.md](jni-and-cpp.md) §
   "single-thread + big-stack rule".) Don't try to call the engine concurrently — it's serialized
   through one dispatcher by design.

## Versioning / vendoring

QuickJS-ng is **vendored** — its C source lives in the repo at
`packages/native/quickjs/`, shared by both shells (the Android CMake compiles four files: `quickjs.c`,
`dtoa.c`, `libregexp.c`, `libunicode.c`), pinned in its `VERSION` file (0.15.1). There's no
package manager for it — "bumping" means `pnpm update:quickjs <tag>` and re-running the instrumented
JNI tests. The [upkeep routine](../../contributing/upkeep.md) tracks this, watching for GC / spec / `dtoa`
fixes since the engine is pre-1.0 and reserves the right to change its ABI.

## Mental summary

- QuickJS-ng = a small embeddable JS engine (C) compiled into the app; it runs your **server-side** JS,
  separate from the WebView's V8 that runs the **front-end**.
- The split exists so back-end JS is decoupled from the page **and** is the unit OTA hot-updates.
- Hard rules: register on `globalThis`, return objects (not JSON strings) from `dispatch`, no
  DOM/Node, single pinned thread. The engine is vendored C, bumped by hand.

Related: [civetweb.md](civetweb.md) (how requests reach QuickJS) · [jni-and-cpp.md](jni-and-cpp.md)
(how Kotlin reaches the C engine).
