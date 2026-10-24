package dev.capsule.fakes

import dev.capsule.runtime.AppNavigator

class FakeAppNavigator : AppNavigator {
    val navigations = mutableListOf<String>()
    override fun navigateTo(url: String) { navigations.add(url) }
}
