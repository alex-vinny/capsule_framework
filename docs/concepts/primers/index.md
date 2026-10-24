---
title: "Primers"
audience: contributor
status: current
---
# Primers — the native stack for a web/C# developer

Onboarding explainers for the parts of Capsule that sit *below* the TypeScript surface. Written for a
developer fluent in **C# (OO) and TypeScript/web** who is newer to the Android/native side. Each primer
maps concepts to what you already know and links to the real Capsule files, so read them next to the code.

Suggested order:

1. **[kotlin-for-csharp-devs.md](kotlin-for-csharp-devs.md)** — Kotlin idioms mapped from C#/TS
   (`data class` ≈ records, `sealed class` ≈ unions, `suspend` ≈ async/await, `companion object` ≈
   static, `fun interface` ≈ delegates). The language the whole Android shell is written in.
2. **[quickjs.md](quickjs.md)** — the embedded JavaScript engine that runs your server-side routes; why
   it exists alongside the WebView's V8, and its hard constraints (`globalThis`, return-objects, no DOM/Node).
3. **[civetweb.md](civetweb.md)** — the in-app localhost HTTP server (the same C server on Android and iOS) that gives the WebView a real
   `http://` origin and routes `/api/*` into QuickJS.
4. **[jni-and-cpp.md](jni-and-cpp.md)** — the JNI boundary (≈ P/Invoke) by which Kotlin reaches the C
   QuickJS engine; CMake/NDK build, the opaque native handle, the single-thread + 4 MB-stack rule.

These are living docs — extend them as the native surface grows (iOS/Swift will earn its own primer in
Phase 4).
