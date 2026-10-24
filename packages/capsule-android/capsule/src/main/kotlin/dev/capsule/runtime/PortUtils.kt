// Docs: docs/concepts/primers/civetweb.md, docs/decisions/0004-web-serving-transport.md
package dev.capsule.runtime

private const val PORT_MIN = 49_152
private const val PORT_MAX = 65_535

/**
 * Returns a deterministic port in the ephemeral range [49152, 65535] for the given [appId].
 *
 * The same appId always produces the same port across process restarts.
 * Different appIds (very likely) produce different ports, avoiding collisions
 * when multiple Capsule apps are installed on the same device.
 */
fun portForAppId(appId: String): Int {
    val hash = appId.hashCode().and(0x7FFF_FFFF)   // strip sign bit → non-negative
    return hash % (PORT_MAX - PORT_MIN + 1) + PORT_MIN
}
