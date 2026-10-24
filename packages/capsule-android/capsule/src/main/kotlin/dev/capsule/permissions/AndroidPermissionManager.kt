// Docs: docs/concepts/architecture.md
package dev.capsule.permissions

import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.result.ActivityResultLauncher
import androidx.core.content.ContextCompat
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.Continuation
import kotlin.coroutines.resume

/**
 * Bridges Android's permission dialog into a suspending [PermissionManager.request].
 *
 * The Activity owns the [launcher] (it must be registered before STARTED) and
 * forwards the raw result map to [onResult]; this class decides grant/deny
 * against the permissions that were actually requested — so it works for any API
 * (camera, location, …), not a hardcoded set. "Granted" means *any* requested
 * permission was granted, matching [isGranted] (e.g. fine OR coarse location).
 */
class AndroidPermissionManager(
    private val context: Context,
    private val launcher: ActivityResultLauncher<Array<String>>
) : PermissionManager {

    private val pending = mutableListOf<Pending>()

    private class Pending(val requested: Set<String>, val cont: Continuation<Boolean>)

    override fun isGranted(vararg permissions: String): Boolean =
        permissions.any {
            ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
        }

    override suspend fun request(vararg permissions: String): Boolean {
        if (isGranted(*permissions)) return true
        return suspendCancellableCoroutine { cont ->
            pending.add(Pending(permissions.toSet(), cont))
            launcher.launch(arrayOf(*permissions))
        }
    }

    /** Called by CapsuleActivity with the raw result map from the permission dialog. */
    fun onResult(results: Map<String, Boolean>) {
        val list = pending.toList()
        pending.clear()
        list.forEach { p ->
            val granted = p.requested.any { results[it] == true }
            p.cont.resume(granted)
        }
    }
}
