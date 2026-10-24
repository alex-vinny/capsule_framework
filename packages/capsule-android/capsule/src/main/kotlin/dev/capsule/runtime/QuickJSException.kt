// Docs: docs/concepts/primers/quickjs.md, docs/decisions/0001-embedded-runtime.md
package dev.capsule.runtime

sealed class QuickJSException(message: String) : Exception(message) {
    class EvaluateError(message: String) : QuickJSException("evaluate failed: $message")
    class CallError(fn: String, message: String) : QuickJSException("call '$fn' failed: $message")
}
