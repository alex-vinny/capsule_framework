// Docs: docs/reference/core-api.md
package dev.capsule.clipboard

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context

class AndroidClipboardProvider(private val context: Context) : ClipboardProvider {

    private val clipboard =
        context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager

    override fun read(): String? {
        if (!clipboard.hasPrimaryClip()) return null
        return clipboard.primaryClip
            ?.getItemAt(0)
            ?.coerceToText(context)
            ?.toString()
    }

    override fun write(text: String) {
        clipboard.setPrimaryClip(ClipData.newPlainText("", text))
    }
}
