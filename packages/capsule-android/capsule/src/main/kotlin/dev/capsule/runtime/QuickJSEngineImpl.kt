// Docs: docs/concepts/primers/quickjs.md, docs/decisions/0001-embedded-runtime.md, docs/concepts/primers/jni-and-cpp.md
package dev.capsule.runtime

import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import java.io.Closeable
import java.util.concurrent.Executors

internal class QuickJSEngineImpl : QuickJSEngine, Closeable {

    private val dispatcher = Executors
        .newSingleThreadExecutor { r ->
            // 4 MB stack — QuickJS records this thread's stack pointer as the JS stack base.
            // nativeCreate() MUST run on this thread so the base address is correct.
            Thread(null, r, "capsule-quickjs", 4 * 1024 * 1024).also { it.isDaemon = true }
        }
        .asCoroutineDispatcher()

    // Run on the dispatcher thread so QuickJS captures the right stack base.
    private val handle: Long = runBlocking(dispatcher) { nativeCreate() }

    override suspend fun evaluate(bundle: String): Unit = withContext(dispatcher) {
        try {
            nativeEvaluate(handle, bundle)
        } catch (e: RuntimeException) {
            throw QuickJSException.EvaluateError(e.message ?: "unknown error")
        }
    }

    override suspend fun call(fn: String, args: String): String = withContext(dispatcher) {
        try {
            nativeCall(handle, fn, args)
        } catch (e: RuntimeException) {
            throw QuickJSException.CallError(fn, e.message ?: "unknown error")
        }
    }

    override fun close() {
        dispatcher.close()
        nativeDestroy(handle)
    }

    private external fun nativeCreate(): Long
    private external fun nativeDestroy(handle: Long)
    private external fun nativeEvaluate(handle: Long, bundle: String)
    private external fun nativeCall(handle: Long, fn: String, args: String): String

    companion object {
        init {
            System.loadLibrary("capsule_quickjs_jni")
        }
    }
}
