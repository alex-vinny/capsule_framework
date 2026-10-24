---
title: "Kotlin for C# and TypeScript developers"
audience: contributor
status: current
---
# Kotlin for C# / TypeScript developers

> A Capsule-specific primer. You know C# (OO) and TypeScript well; Kotlin sits *between* them and
> will feel familiar fast. Every concept below links to a real file in the Capsule Android shell so
> you can see it in context, not in the abstract. Read it next to the code.

## The 30-second orientation

Kotlin is a statically-typed JVM language (compiles to the same bytecode as Java). Mentally:
**C#'s type system + TypeScript's terseness + null-safety baked into the compiler.** No semicolons,
type-after-name (`val x: Int`), expressions over statements. If you can read a C# record and a TS
union, you can read 90% of Capsule's Kotlin.

| Concept | C# | TypeScript | Kotlin |
|---------|-----|-----------|--------|
| Immutable local | `readonly var` / `const` | `const` | `val` |
| Mutable local | `var` | `let` | `var` |
| Nullable | `string?` | `string \| null` | `String?` |
| Class | `class` | `class` | `class` |
| Record/DTO | `record` | `interface`/`type` | `data class` |
| Static | `static` member | module-level | `companion object` |
| Interface | `interface` | `interface` | `interface` |
| Enum | `enum` | `enum`/union | `enum class` |
| async fn | `async Task<T>` | `async (): Promise<T>` | `suspend fun (): T` |
| Discriminated union | (none, pre-`OneOf`) | union + tag | `sealed class` |

## 1. `val` / `var`, type inference, no `new`

```kotlin
val port: Int = 5173      // immutable (prefer this), explicit type
val name = "capsule"      // inferred String
var count = 0             // mutable
val provider = AndroidNetworkProvider(this)   // no `new`
```

Like C#'s `var`/`readonly` and TS's `const`/`let`. `val` ≈ a `readonly` binding (the *reference*
can't be reassigned). Construct objects by calling the class like a function — no `new` keyword.

## 2. Null-safety is in the compiler (the biggest mental shift)

C# bolted nullable-reference-types on as warnings; Kotlin enforces it. A `String` *cannot* be null;
only `String?` can, and the compiler forces you to handle it.

```kotlin
var launchUrl: String? = null          // nullable
launchUrl.length                       // ❌ compile error — might be null
launchUrl?.length                      // safe call → Int? (null if launchUrl is null)
launchUrl ?: "default"                 // elvis: value-or-fallback (C# ??)
launchUrl!!.length                     // assert non-null (throws if wrong — avoid unless certain)
```

See it real: [AppLifecycleController.kt](../../../packages/capsule-android/capsule/src/main/kotlin/dev/capsule/app/AppLifecycleController.kt) —
`consumeLaunchUrl(): String?` returns nullable; callers must handle the null. `?.let { }` (below) is
the idiomatic "do this only if non-null."

## 3. `data class` ≈ C# `record` — the wire models

```kotlin
@Serializable
data class PushToken(val value: String, val platform: String)
```

You get constructor, `equals`/`hashCode`, `toString`, and `copy()` for free — exactly like a C#
`record`. The `@Serializable` annotation is from **kotlinx.serialization** (think `System.Text.Json`
source-generators): it lets `Json.encodeToJsonElement(token)` produce the JSON the TS side expects.
Real: [PushProvider.kt](../../../packages/capsule-android/capsule/src/main/kotlin/dev/capsule/push/PushProvider.kt)
(`PushToken`, `PushMessage`, `NotificationChannel`).

`@SerialName("wifi")` on an enum constant pins its JSON form — so `ConnectionType.WIFI` serializes as
`"wifi"`, matching the TS union. (See `ChannelImportance` / `PermissionStatus` in the same file.)

## 4. `sealed class` ≈ a closed type hierarchy / discriminated union

C# has no real discriminated union (pre-`OneOf` libraries); TS fakes it with tagged unions. Kotlin's
`sealed class` is the real thing — a fixed, compiler-known set of subtypes.

```kotlin
sealed class BridgeError(val code: Int, val message: String) {
    object PermissionDenied  : BridgeError(2001, "PERMISSION_DENIED")
    object FileNotFound      : BridgeError(5001, "FILE_NOT_FOUND")
    object PushRegistrationFailed : BridgeError(6001, "PUSH_REGISTRATION_FAILED")
}
```

Real: [BridgeError.kt](../../../packages/capsule-android/capsule/src/main/kotlin/dev/capsule/protocol/BridgeError.kt).
`object X : BridgeError(...)` is a **singleton** subtype (Kotlin's `object` = a one-instance type;
think C# `static`-but-it's-a-value). A `when` over a sealed type is exhaustive — the compiler errors
if you miss a case, like a switch on a closed union.

## 5. `companion object` ≈ C# `static` members

Kotlin has no `static` keyword. Per-class constants/factories live in a `companion object`:

```kotlin
interface PushProvider {
    fun register(/* … */)
    companion object {
        const val CAPABILITY = "push"
        const val CAPABILITY_VERSION = 1
    }
}
// usage: PushProvider.CAPABILITY   ← reads exactly like a C# static
```

Real: every provider interface (`PushProvider`, `NetworkProvider`) and the method-name constants in
`PushController.kt`.

## 6. `interface` + `fun interface` ≈ interfaces and delegates

Plain `interface` is what you expect. A **`fun interface`** (single-abstract-method) is Kotlin's
delegate/`Func<>`: you can pass a lambda where the interface is expected.

```kotlin
fun interface BridgeEventEmitter {
    fun emit(method: String, params: JsonElement)
}
// construct from a lambda — like assigning a method group to an Action<,> in C#:
val emitter = BridgeEventEmitter { method, params -> bridge.sendNotification(method, params) }
```

Real: [BridgeEventEmitter.kt](../../../packages/capsule-android/capsule/src/main/kotlin/dev/capsule/protocol/BridgeEventEmitter.kt)
and its use in `CapsuleActivity` / the controllers. In tests it's a recording fake — same seam, no WebView.

## 7. `suspend fun` ≈ `async`/`await` (without the `await`)

```kotlin
suspend fun handle(params: JsonElement): JsonElement { … }
```

`suspend` ≈ C#'s `async Task<T>` / TS `async (): Promise<T>`, but there's **no `await` keyword** — you
call a suspend function and it just suspends at that point. Coroutines run on a dispatcher (≈ a
`TaskScheduler` / the JS event loop). Real: every `BridgeHandler.handle` is `suspend`; see
[BridgeHandler.kt](../../../packages/capsule-android/capsule/src/main/kotlin/dev/capsule/handlers/BridgeHandler.kt).

**Callback → suspend bridge** (you'll meet this in push): when a native API hands you a result via a
callback, `suspendCancellableCoroutine` turns it into a `suspend` value:

```kotlin
override suspend fun handle(params: JsonElement): JsonElement =
    suspendCancellableCoroutine { cont ->
        provider.register(
            onToken = { cont.resume(Json.encodeToJsonElement(it)) },
            onError = { cont.resumeWithException(CapsuleException(BridgeError.PushRegistrationFailed, it.message)) },
        )
    }
```

`cont.resume(x)` ≈ `TaskCompletionSource.SetResult(x)`; `resumeWithException` ≈ `SetException`. Real:
[PushHandlers.kt](../../../packages/capsule-android/capsule/src/main/kotlin/dev/capsule/handlers/push/PushHandlers.kt).

## 8. `when` ≈ `switch` expression (but better)

```kotlin
val devUrl = capsuleConfig.devServerUrl
when {
    devUrl != null -> webView.loadUrl(devUrl)
    else           -> startEmbeddedRuntime()
}
```

It's an *expression* (returns a value), matches on types/ranges/conditions, and is exhaustive over
sealed types/enums. Like C# 8+ `switch` expressions, used everywhere.

## 9. Extension functions ≈ C# extension methods

```kotlin
fun LocationData.toPosition() = GeolocationPosition(/* … */)   // adds a method to LocationData
session.headers.toMap()                                        // stdlib extension
```

Same idea as C# `this`-parameter extension methods, but terser and pervasive. Real: the `toPosition()`
mapper in `GeolocationHandler.kt`.

## 10. Small syntax you'll see constantly

- **String templates:** `"port $port at ${config.appId}"` (≈ C# `$"..."` / TS template literals).
- **Trailing-lambda:** `runBlocking { … }`, `withContext(dispatcher) { … }` — if the last arg is a
  lambda it goes outside the parens. Looks like a language keyword but it's just a function taking a lambda.
- **`?.let { }`** — "if non-null, run this block with `it` as the value": `url?.let { appLifecycle.onNewUrl(it) }`.
- **`it`** — the implicit single lambda parameter (like a terse `x =>`).
- **Single-expression functions:** `fun current(): NetworkStatus = status` (no braces/`return`).
- **Default + named args:** `PushMessage(id = "m1", title = "Hi")` — no overloads needed (kills most
  builder/overload boilerplate you'd write in C#).

## Where to look next

- Read [BridgeError.kt](../../../packages/capsule-android/capsule/src/main/kotlin/dev/capsule/protocol/BridgeError.kt)
  (sealed) and [PushProvider.kt](../../../packages/capsule-android/capsule/src/main/kotlin/dev/capsule/push/PushProvider.kt)
  (data classes + enums + companion) — they exercise §3–§6 in 100 lines.
- Then [PushHandlers.kt](../../../packages/capsule-android/capsule/src/main/kotlin/dev/capsule/handlers/push/PushHandlers.kt)
  for §7 (suspend + the callback bridge).
- For how Kotlin reaches the C engine, see [jni-and-cpp.md](jni-and-cpp.md).
