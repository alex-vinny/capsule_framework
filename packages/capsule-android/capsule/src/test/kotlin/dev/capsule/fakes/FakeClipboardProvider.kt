package dev.capsule.fakes

import dev.capsule.clipboard.ClipboardProvider

class FakeClipboardProvider(initial: String? = null) : ClipboardProvider {
    private var content: String? = initial
    override fun read() = content
    override fun write(text: String) { content = text }
}
