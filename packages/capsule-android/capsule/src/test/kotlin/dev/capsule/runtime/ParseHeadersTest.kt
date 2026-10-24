// Docs: docs/concepts/primers/civetweb.md, docs/decisions/0004-web-serving-transport.md
package dev.capsule.runtime

import org.junit.Assert.assertEquals
import org.junit.Test

/** The JNI header block (`name\0value\0…`) → map decoding used by [CivetwebServer]. */
class ParseHeadersTest {

    private fun block(vararg pairs: Pair<String, String>) =
        pairs.joinToString("") { (name, value) -> "$name\u0000$value\u0000" }.toByteArray()

    @Test fun `names are lower-cased`() {
        assertEquals(
            mapOf("content-type" to "application/json", "x-capsule" to "1"),
            parseHeaders(block("Content-Type" to "application/json", "X-Capsule" to "1")),
        )
    }

    @Test fun `repeated headers are joined`() {
        assertEquals(mapOf("accept" to "text/html, application/json"),
            parseHeaders(block("Accept" to "text/html", "accept" to "application/json")))
    }

    @Test fun `empty values and an empty block are handled`() {
        assertEquals(mapOf("x-empty" to ""), parseHeaders(block("X-Empty" to "")))
        assertEquals(emptyMap<String, String>(), parseHeaders(ByteArray(0)))
    }
}
