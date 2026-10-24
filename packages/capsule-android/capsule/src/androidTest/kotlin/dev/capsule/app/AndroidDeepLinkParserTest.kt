// Docs: docs/reference/core-api.md
package dev.capsule.app

import android.content.Intent
import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented test for [AndroidDeepLinkParser]. `android.content.Intent` /
 * `Uri` aren't available to pure-JVM unit tests, so the Intent → url extraction
 * is verified on a device/emulator; the lifecycle logic that consumes the url is
 * covered off-device in AppLifecycleControllerTest.
 */
@RunWith(AndroidJUnit4::class)
class AndroidDeepLinkParserTest {

    @Test
    fun viewIntentWithCustomSchemeYieldsUrl() {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("myapp://order/42"))
        assertEquals("myapp://order/42", AndroidDeepLinkParser.urlFrom(intent))
    }

    @Test
    fun viewIntentWithHttpsLinkYieldsUrl() {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://acme.com/invite/abc"))
        assertEquals("https://acme.com/invite/abc", AndroidDeepLinkParser.urlFrom(intent))
    }

    @Test
    fun launcherIntentYieldsNull() {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        assertNull(AndroidDeepLinkParser.urlFrom(intent))
    }

    @Test
    fun viewIntentWithoutDataYieldsNull() {
        assertNull(AndroidDeepLinkParser.urlFrom(Intent(Intent.ACTION_VIEW)))
    }

    @Test
    fun nullIntentYieldsNull() {
        assertNull(AndroidDeepLinkParser.urlFrom(null))
    }
}
