package dev.capsule.fakes

import dev.capsule.runtime.QuickJSEngine
import kotlinx.coroutines.delay

class FakeQuickJSEngine(
    private val evaluateBehavior: EvaluateBehavior = EvaluateBehavior.Success,
    private val callResult: String = "{}",
) : QuickJSEngine {

    sealed interface EvaluateBehavior {
        object Success : EvaluateBehavior
        object Fails : EvaluateBehavior
        data class SlowBy(val ms: Long) : EvaluateBehavior
    }

    var evaluatedBundle: String? = null
    val calls = mutableListOf<Pair<String, String>>()

    override suspend fun evaluate(bundle: String) {
        when (val b = evaluateBehavior) {
            EvaluateBehavior.Success -> evaluatedBundle = bundle
            EvaluateBehavior.Fails -> throw RuntimeException("FakeQuickJSEngine: evaluation failed")
            is EvaluateBehavior.SlowBy -> {
                delay(b.ms)
                evaluatedBundle = bundle
            }
        }
    }

    override suspend fun call(fn: String, args: String): String {
        calls.add(fn to args)
        return callResult
    }

    override fun close() {}
}
