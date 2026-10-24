// Docs: docs/concepts/architecture.md
package dev.capsule.runtime

/**
 * Wall-clock abstraction so crash-loop timing can be driven by a fake clock in unit tests.
 */
interface Clock {
    fun now(): Long
}

/** Production clock backed by [System.currentTimeMillis]. */
object SystemClock : Clock {
    override fun now(): Long = System.currentTimeMillis()
}
