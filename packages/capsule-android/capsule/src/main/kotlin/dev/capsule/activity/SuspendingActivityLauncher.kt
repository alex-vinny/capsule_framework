// Docs: docs/concepts/architecture.md
package dev.capsule.activity

import androidx.activity.result.ActivityResultLauncher
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * Turns a pre-registered [ActivityResultLauncher] into a suspending call.
 *
 * androidx requires launchers to be registered while the Activity is below STARTED,
 * so the Activity creates them up front and [bind]s each one here, routing its
 * result callback to [onResult]. This is the same "pre-register + bridge the
 * callback into a continuation" mechanism `AndroidPermissionManager` uses for
 * permissions, generalized so any contract (camera, photo picker, document
 * picker, …) can be `await`ed. One in-flight launch at a time per instance.
 */
class SuspendingActivityLauncher<I, O> {

    private lateinit var launcher: ActivityResultLauncher<I>
    private var pending: CancellableContinuation<O>? = null

    /** Wire the Activity-owned launcher. Call once, during Activity setup. */
    fun bind(launcher: ActivityResultLauncher<I>) {
        this.launcher = launcher
    }

    /** Forward the Activity-result callback here. */
    fun onResult(result: O) {
        val cont = pending
        pending = null
        cont?.resume(result)
    }

    suspend fun launch(input: I): O =
        suspendCancellableCoroutine { cont ->
            pending = cont
            cont.invokeOnCancellation { pending = null }
            launcher.launch(input)
        }
}
