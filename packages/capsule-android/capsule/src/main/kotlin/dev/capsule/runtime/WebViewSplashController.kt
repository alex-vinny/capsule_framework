// Docs: docs/concepts/architecture.md
package dev.capsule.runtime

import android.content.Context
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.ProgressBar

/**
 * SplashController that overlays a full-bleed view — white background with a centered, indeterminate
 * spinner — on top of the WebView container while the runtime boots and the first page loads.
 *
 * The [container] is the root FrameLayout that holds the WebView. The overlay is added on top
 * (last child = topmost) and toggled visible/gone. A real app theming this would swap the
 * background colour / drop a logo in here; the spinner is the dependency-free default.
 */
class WebViewSplashController(
    context: Context,
    private val container: FrameLayout,
) : SplashController {

    private val overlay = FrameLayout(context).apply {
        setBackgroundColor(0xFFFFFFFF.toInt())
        layoutParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT,
        )
        visibility = View.GONE
        addView(
            ProgressBar(context).apply {
                isIndeterminate = true
                layoutParams = FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    Gravity.CENTER,
                )
            },
        )
    }

    init {
        container.addView(overlay)
    }

    override fun show() {
        overlay.visibility = View.VISIBLE
        overlay.bringToFront()
    }

    override fun hide() {
        overlay.visibility = View.GONE
    }
}
