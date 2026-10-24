package dev.capsule.fakes

import dev.capsule.haptics.HapticsProvider

class FakeHapticsProvider : HapticsProvider {
    val calls = mutableListOf<String>()
    override fun vibrate(style: String) {
        calls.add(style)
    }
}
