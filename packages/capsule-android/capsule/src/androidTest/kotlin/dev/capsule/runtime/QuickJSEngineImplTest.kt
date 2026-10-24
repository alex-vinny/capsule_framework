// Docs: docs/concepts/primers/quickjs.md, docs/decisions/0001-embedded-runtime.md
package dev.capsule.runtime

import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class QuickJSEngineImplTest {

    private lateinit var engine: QuickJSEngineImpl

    @Before
    fun setUp() {
        engine = QuickJSEngineImpl()
    }

    @After
    fun tearDown() {
        engine.close()
    }

    @Test
    fun evaluateAndCall_add() = runTest {
        engine.evaluate("function add(a, b) { return a + b; }")
        val result = engine.call("add", "[1, 2]")
        assertEquals("3", result)
    }

    @Test
    fun call_returnsJsonObject() = runTest {
        engine.evaluate("function wrap(x) { return { value: x }; }")
        val result = engine.call("wrap", "[42]")
        assertEquals("""{"value":42}""", result)
    }

    @Test
    fun evaluate_syntaxError_throwsEvaluateError() = runTest {
        try {
            engine.evaluate("function broken( {}")
            throw AssertionError("Expected QuickJSException.EvaluateError")
        } catch (e: QuickJSException.EvaluateError) {
            // expected — message contains JS parse error
        }
    }

    @Test
    fun call_unknownFunction_throwsCallError() = runTest {
        try {
            engine.call("doesNotExist", "[]")
            throw AssertionError("Expected QuickJSException.CallError")
        } catch (e: QuickJSException.CallError) {
            // expected — TypeError: not a function
        }
    }
}
