package dev.capsule.fakes

import dev.capsule.runtime.SplashController

class FakeSplashController : SplashController {
    val events = mutableListOf<String>()
    override fun show() { events.add("show") }
    override fun hide() { events.add("hide") }
}
