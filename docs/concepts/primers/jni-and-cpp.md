---
title: "JNI, C and C++ in Capsule"
audience: contributor
status: current
code:
  - packages/capsule-android/capsule/src/main/cpp/**
  - packages/capsule-android/capsule/src/main/kotlin/dev/capsule/runtime/QuickJSEngineImpl.kt
---
# JNI, C & C++ in Capsule — for a managed-language developer

> You've lived in C#/TS where memory is managed and there's no "native boundary." Capsule has one:
> the JavaScript engine (QuickJS) is written in **C**, compiled to a native `.so` library, and Kotlin
> talks to it through **JNI**. This primer explains *just enough* of that world to read and reason
> about Capsule's runtime. You will rarely edit the C; you need to understand the seam.

## The mental model

```
 Kotlin (JVM bytecode)         ──JNI──▶   C (native .so)            QuickJS (C library)
 QuickJSEngineImpl                         quickjs_jni.c             quickjs.c, dtoa.c, …
 `external fun nativeCall(...)`  ───────▶  Java_..._nativeCall(...)  JS_Eval / JS_Call
```

Three layers, two boundaries:
1. **Kotlin ↔ C** — crossed via **JNI** (Java Native Interface). The Kotlin side declares `external`
   functions; the C side implements them with special JNI signatures. This is the "FFI" / P/Invoke
   analogue from C#.
2. **C (our glue) ↔ QuickJS (the engine)** — ordinary C function calls into the vendored QuickJS library.

> C#/.NET analogy: JNI ≈ **P/Invoke / `DllImport`**. The `.so` ≈ a native DLL. The JVM ≈ the CLR.
> The big difference: across JNI there is **no garbage collector and no bounds-checking** — C owns its
> memory and a mistake is a crash (SIGSEGV), not an exception.

## Why C at all?

QuickJS-ng is a small, embeddable JavaScript engine written in C (see [quickjs.md](quickjs.md) for *why*
we embed a JS engine). It's distributed as C source. To run it on Android we compile that C for each
CPU architecture into a shared library (`.so`) and load it at runtime. There is no "managed" QuickJS;
the engine *is* C.

## The build: CMake compiles the C into a `.so`

Android builds native code with **CMake** + the **NDK** (Native Development Kit — the C/C++ toolchain
for Android). Capsule's [CMakeLists.txt](../../../packages/capsule-android/capsule/src/main/cpp/CMakeLists.txt)
declares two libraries:

```cmake
add_library(quickjs STATIC          # 1. the engine, as a static lib
    quickjs/quickjs.c quickjs/dtoa.c quickjs/libregexp.c quickjs/libunicode.c)

add_library(capsule_quickjs_jni SHARED   # 2. our JNI glue, as a loadable .so
    quickjs_jni.c)
target_link_libraries(capsule_quickjs_jni quickjs android …)
```

- **STATIC** lib = compiled into the consumer (the JNI `.so`), not shipped separately (like a `.lib`/
  static `.a`).
- **SHARED** lib = the `.so` the app loads at runtime (like a DLL). Gradle builds one per ABI
  (`arm64-v8a`, `x86_64` — see `abiFilters` in `build.gradle.kts`) and packs them into the AAR/APK.
- The four `.c` files are the **vendored** QuickJS source (no package manager — see
  [the upkeep doc](../../contributing/upkeep.md); bumping = re-copying those files).

## The Kotlin side: `external fun` + `System.loadLibrary`

[QuickJSEngineImpl.kt](../../../packages/capsule-android/capsule/src/main/kotlin/dev/capsule/runtime/QuickJSEngineImpl.kt):

```kotlin
private external fun nativeCreate(): Long                       // returns an opaque pointer
private external fun nativeCall(handle: Long, fn: String, args: String): String
private external fun nativeDestroy(handle: Long)

companion object { init { System.loadLibrary("capsule_quickjs_jni") } }  // loads the .so once
```

- `external fun` = "implemented in native code" (≈ C#'s `[DllImport] static extern`). No Kotlin body.
- `System.loadLibrary("capsule_quickjs_jni")` loads `libcapsule_quickjs_jni.so` (Android adds the
  `lib`/`.so`). Done once in the `companion object`'s `init` (≈ a static constructor).
- **The `Long` `handle` is a raw C pointer** to the QuickJS runtime/context, smuggled through the JVM
  as a 64-bit integer. Kotlin treats it as opaque; only the C side dereferences it. (This is the
  classic "native handle" pattern — like an `IntPtr`/`SafeHandle` in C#.)

## The C side: JNI function naming + the type marshalling

For an `external fun nativeCall` declared in class `dev.capsule.runtime.QuickJSEngineImpl`, JNI looks
for a C function named by a strict convention in `quickjs_jni.c`:

```c
JNIEXPORT jstring JNICALL
Java_dev_capsule_runtime_QuickJSEngineImpl_nativeCall(
    JNIEnv *env, jobject thiz, jlong handle, jstring fn, jstring args) {
    // 1. marshal: JVM String → C UTF-8 char*
    const char *fn_c = (*env)->GetStringUTFChars(env, fn, NULL);
    // 2. call into QuickJS via the handle (cast jlong back to a pointer)
    // 3. marshal back: C string → jstring with (*env)->NewStringUTF(...)
    // 4. release the GetStringUTFChars buffer — no GC will do it for you
}
```

What to notice (the things that bite managed-language devs):
- **Name mangling:** `Java_<package_with_underscores>_<Class>_<method>`. Rename the Kotlin package or
  method and the C symbol must change too, or you get `UnsatisfiedLinkError` at runtime (not compile).
- **`JNIEnv* env`** is your handle to the JVM from C — every conversion (`GetStringUTFChars`,
  `NewStringUTF`) goes through it.
- **Manual memory:** what you `Get…` you must `Release…`. There's no `using`/finalizer. Leaks and
  use-after-free are real here.
- **Errors don't auto-propagate:** a C-side failure must be turned into a JVM exception deliberately;
  otherwise it silently corrupts or crashes. `QuickJSEngineImpl` wraps native `RuntimeException`s into
  typed `QuickJSException.CallError`/`EvaluateError` on the Kotlin side.

## The one subtlety worth internalising: the single-thread + big-stack rule

QuickJS is **not thread-safe** and records the **stack base** of the thread that created it. So Capsule
pins *all* engine calls to one dedicated thread with a large stack:

```kotlin
Executors.newSingleThreadExecutor { r ->
    // 4 MB stack — QuickJS records this thread's stack pointer as the JS stack base.
    Thread(null, r, "capsule-quickjs", 4 * 1024 * 1024).also { it.isDaemon = true }
}.asCoroutineDispatcher()
// nativeCreate() MUST run on this thread so the base address is correct:
private val handle: Long = runBlocking(dispatcher) { nativeCreate() }
```

- **One thread for the engine's whole life** — create, evaluate, call, destroy all on it. Calling from
  another thread = undefined behaviour / crash.
- **4 MB stack** because deep JS recursion uses the *native* C stack; the JVM default would overflow.
- `withContext(dispatcher)` (in `evaluate`/`call`) hops onto that thread; the rest of the app stays on
  normal coroutine dispatchers. This is how a synchronous, single-threaded C engine lives safely inside
  an async Kotlin app.

## What you actually need to remember

1. Kotlin ↔ C is JNI (≈ P/Invoke); the `.so` is built by CMake/NDK from vendored C.
2. The `Long handle` is a raw C pointer treated as opaque on the JVM side.
3. Across the boundary you lose the GC and exceptions — the C glue marshals strings and translates
   failures back into Kotlin exceptions.
4. The engine is single-threaded with a 4 MB stack, pinned via a coroutine dispatcher.

The shell builds two JNI libraries from `src/main/cpp/CMakeLists.txt`: `libcapsule_quickjs_jni.so` (the
engine, this primer) and `libcapsule_server.so` (the CivetWeb HTTP server and its glue,
`capsule_server_jni.c` — see [civetweb.md](civetweb.md)).

You'll almost never touch `quickjs_jni.c`. When you do, it's usually to expose one more `external fun`
— add the Kotlin declaration, add the matching `Java_…` C function, rebuild the AAR. Next:
[quickjs.md](quickjs.md) for what runs *inside* the engine, and [civetweb.md](civetweb.md) for how JS
gets invoked over HTTP.
