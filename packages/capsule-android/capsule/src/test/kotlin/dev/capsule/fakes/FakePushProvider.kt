package dev.capsule.fakes

import dev.capsule.push.NotificationChannel
import dev.capsule.push.PermissionStatus
import dev.capsule.push.PushError
import dev.capsule.push.PushMessage
import dev.capsule.push.PushProvider
import dev.capsule.push.PushToken

/**
 * Test double for [PushProvider], mirroring [FakeNetworkProvider]'s injectable
 * style. Lets [dev.capsule.push.PushControllerTest] and
 * [dev.capsule.handlers.push.PushHandlerTest] drive the whole push contract in
 * pure-JVM tests with no device or Firebase:
 *
 *  - [token] / [registrationFails] choose what `register()` yields.
 *  - [permission] is what `checkPermissions()` returns and `requestPermissions()` resolves.
 *  - [messageArrives] / [tapArrives] simulate the OS delivering a foreground
 *    message / a warm tap, firing the listeners registered via [start].
 *  - channels are kept in an in-memory list (insertion-ordered).
 */
class FakePushProvider(
    var token: PushToken = PushToken("fake-token", "android"),
    var registrationFails: PushError? = null,
    var permission: PermissionStatus = PermissionStatus.GRANTED,
) : PushProvider {

    private val channels = LinkedHashMap<String, NotificationChannel>()
    private var onMessage: ((PushMessage) -> Unit)? = null
    private var onTap: ((PushMessage) -> Unit)? = null

    var started = false
        private set
    var removedAllDelivered = false
        private set

    override fun register(onToken: (PushToken) -> Unit, onError: (PushError) -> Unit) {
        registrationFails?.let { onError(it) } ?: onToken(token)
    }

    override fun checkPermissions(): PermissionStatus = permission

    override fun requestPermissions(onResult: (PermissionStatus) -> Unit) = onResult(permission)

    override fun createChannel(channel: NotificationChannel) {
        channels[channel.id] = channel
    }

    override fun removeChannel(id: String) {
        channels.remove(id)
    }

    override fun listChannels(): List<NotificationChannel> = channels.values.toList()

    override fun removeAllDeliveredNotifications() {
        removedAllDelivered = true
    }

    override fun start(onMessage: (PushMessage) -> Unit, onTap: (PushMessage) -> Unit) {
        this.onMessage = onMessage
        this.onTap = onTap
        started = true
    }

    override fun stop() {
        onMessage = null
        onTap = null
        started = false
    }

    /** Simulate a foreground message arriving from the OS. */
    fun messageArrives(message: PushMessage) {
        onMessage?.invoke(message)
    }

    /** Simulate the user tapping a notification while the app is running (warm). */
    fun tapArrives(message: PushMessage) {
        onTap?.invoke(message)
    }
}
