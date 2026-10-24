// Docs: docs/reference/core-api.md
package dev.capsule.device

import android.content.Context
import android.os.Build

class AndroidDeviceInfoProvider(private val context: Context) : DeviceInfoProvider {

    override fun getDeviceInfo() =
        DeviceInfo(
            platform = "android",
            model = Build.MODEL,
            manufacturer = Build.MANUFACTURER,
            osVersion = Build.VERSION.RELEASE,
            sdkVersion = Build.VERSION.SDK_INT,
            isVirtual = isEmulator(),
            webViewVersion = webViewVersion(),
        )

    private fun isEmulator(): Boolean =
        Build.FINGERPRINT.startsWith("generic") ||
            Build.FINGERPRINT.startsWith("unknown") ||
            Build.MODEL.contains("google_sdk", ignoreCase = true) ||
            Build.MODEL.contains("emulator", ignoreCase = true) ||
            Build.HARDWARE == "goldfish" ||
            Build.HARDWARE == "ranchu"

    private fun webViewVersion(): String? =
        if (Build.VERSION.SDK_INT >= 26) {
            @Suppress("NewApi")
            android.webkit.WebView.getCurrentWebViewPackage()?.versionName
        } else {
            null
        }
}
