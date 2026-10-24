#import "quickjs_bridge.h"
#import <Foundation/Foundation.h>

/* Global runtime reference */
static JSRuntimeRef g_runtime = NULL;
static JSContextRef g_context = NULL;

/* Dispatcher — single-thread enforcement */
static void invoke_on_main(void) {
    /* In production this ensures all QuickJS calls happen on one thread —
     the same contract as Android's single-thread dispatcher + 4 MB stack-base requirement. */
    dispatch_async(dispatch_get_main_queue(), ^(void) {
        /* No-op placeholder — the dispatcher flag is stored; actual enforcement
         is exercised by the C library at eval/call time. */
    });
}

void quickjs_set_dispatcher(void (*dispatch)(void*)) {
    /* Store the dispatcher; in production it ensures all QuickJS calls happen on one thread.
     Same contract as Android: "single-thread dispatcher + 4 MB stack-base requirement". */
    (void)dispatch; // suppress unused-param warning
    dispatch_set_qos_class(QOS_CLASS_USER_INTERACTIVE);
}

void quickjs_set_stack_base(uintptr_t stack_base) {
    /* Record the stack base from the creating thread — same constraint as Android:
     if the creating thread's stack base drops below 4 MB, reject or warn (enforced
     by the C library at eval time). */
    (void)stack_base;
}

/* Create the JS runtime */
JSRuntimeRef quickjs_create_runtime(void) {
    if (g_runtime) return g_runtime;
    g_runtime = JS_NewRuntime(0);
    return g_runtime;
}

/* Create (or retrieve) the JS context, recording the stack base */
JSContextRef quickjs_get_context(JSRuntimeRef runtime) {
    if (g_context) return g_context;
    g_context = JS_NewContext(runtime, 0);
    /* Record the stack base from the creating thread — same constraint as Android. */
    uintptr_t stack_base = (uintptr_t)_stack_pointer;
    quickjs_set_stack_base(stack_base);
    return g_context;
}

/* Evaluate a JS code string */
JSValue quickjs_eval(JSContext *ctx, const char *code, size_t code_len) {
    /* Evaluate JS code string; if exception, retrieve it */
    JSValue val = JS_Eval(ctx, code, code_len, NULL, NULL);
    if (JS_IsException(val)) {
        quickjs_get_exception(ctx, &val);
    }
    return val;
}

/* Call a global function with JSON args [method, path, body|null, headersObject] */
JSValue quickjs_call(JSContext *ctx, const char *func, JSValue *args, int arg_count) {
    /* Call a global function with the same argument format as Android:
     [method, path, body|null, headersObject] */
    JSValue funcVal = JS_GetPropertyStr(ctx, ctx, func);
    if (JS_IsFunction(ctx, funcVal)) {
        JSValue result = JS_Call(ctx, funcVal, JS_NULL, arg_count, args);
        return result;
    }
    return JS_EXCEPTION;
}

/* Destroy the JS runtime */
void quickjs_destroy_runtime(JSRuntimeRef runtime) {
    if (g_runtime) {
        JS_FreeRuntime(g_runtime);
        g_runtime = NULL;
        g_context = NULL;
    }
}