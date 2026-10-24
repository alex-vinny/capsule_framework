// Docs: docs/reference/core-api.md, docs/concepts/architecture.md
package dev.capsule.protocol

/**
 * Records which native capabilities — and at what version — this shell build
 * provides. The OTA-gating contract (Phase 5): a Server Code Push bundle can
 * check `capsule.getCapabilities` and refuse to call a native API the installed
 * shell predates, instead of failing at runtime with `METHOD_NOT_FOUND`.
 *
 * A capability's version is bumped whenever its native surface changes in a way
 * pushed JS might depend on (new method, changed payload). Each handler group
 * registers its own capability + version at wiring time.
 */
class CapabilityRegistry {
    private val versions = linkedMapOf<String, Int>()

    /** Declare (or overwrite) a capability's native version. */
    fun register(capability: String, version: Int): CapabilityRegistry {
        versions[capability] = version
        return this
    }

    /** Immutable snapshot of capability → version. */
    fun snapshot(): Map<String, Int> = versions.toMap()
}
