// Docs: docs/concepts/primers/quickjs.md, docs/concepts/primers/jni-and-cpp.md
#include <jni.h>
#include <string.h>
#include <stdlib.h>
#include <stdint.h>
#include <android/log.h>
#include "quickjs.h"

#define TAG "CapsuleQuickJS"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

/* Helper evaluated once at context creation — wraps call + JSON round-trip. */
static const char CALL_HELPER[] =
    "function __capsule_call(fn, argsJson) {"
    "  var result = globalThis[fn].apply(null, JSON.parse(argsJson));"
    "  var json = JSON.stringify(result);"
    "  return json === undefined ? 'undefined' : json;"
    "}";

typedef struct {
    JSRuntime *rt;
    JSContext *ctx;
} QJSHandle;

/* ── Lifecycle ──────────────────────────────────────────────────────────────── */

JNIEXPORT jlong JNICALL
Java_dev_capsule_runtime_QuickJSEngineImpl_nativeCreate(JNIEnv *env, jobject thiz) {
    QJSHandle *h = (QJSHandle *)malloc(sizeof(QJSHandle));
    if (!h) return 0;

    h->rt  = JS_NewRuntime();
    h->ctx = JS_NewContext(h->rt);

    /* Install call helper so nativeCall can find it. */
    JSValue init = JS_Eval(h->ctx, CALL_HELPER, strlen(CALL_HELPER),
                           "<capsule_init>", JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(init)) {
        LOGE("nativeCreate: failed to install __capsule_call helper");
    }
    JS_FreeValue(h->ctx, init);

    return (jlong)(uintptr_t)h;
}

JNIEXPORT void JNICALL
Java_dev_capsule_runtime_QuickJSEngineImpl_nativeDestroy(JNIEnv *env, jobject thiz, jlong handle) {
    QJSHandle *h = (QJSHandle *)(uintptr_t)handle;
    if (!h) return;
    JS_FreeContext(h->ctx);
    JS_FreeRuntime(h->rt);
    free(h);
}

/* ── evaluate ───────────────────────────────────────────────────────────────── */

JNIEXPORT void JNICALL
Java_dev_capsule_runtime_QuickJSEngineImpl_nativeEvaluate(JNIEnv *env, jobject thiz,
                                                           jlong handle, jstring bundle) {
    QJSHandle *h = (QJSHandle *)(uintptr_t)handle;
    const char *code = (*env)->GetStringUTFChars(env, bundle, NULL);

    JSValue result = JS_Eval(h->ctx, code, strlen(code), "<bundle>", JS_EVAL_TYPE_GLOBAL);
    (*env)->ReleaseStringUTFChars(env, bundle, code);

    if (JS_IsException(result)) {
        JSValue exc = JS_GetException(h->ctx);
        const char *msg = JS_ToCString(h->ctx, exc);
        jclass excClass = (*env)->FindClass(env, "java/lang/RuntimeException");
        (*env)->ThrowNew(env, excClass, msg ? msg : "evaluate failed");
        if (msg) JS_FreeCString(h->ctx, msg);
        JS_FreeValue(h->ctx, exc);
    }

    JS_FreeValue(h->ctx, result);
}

/* ── call ───────────────────────────────────────────────────────────────────── */

JNIEXPORT jstring JNICALL
Java_dev_capsule_runtime_QuickJSEngineImpl_nativeCall(JNIEnv *env, jobject thiz,
                                                       jlong handle, jstring fn, jstring argsJson) {
    QJSHandle *h = (QJSHandle *)(uintptr_t)handle;

    const char *fn_str   = (*env)->GetStringUTFChars(env, fn, NULL);
    const char *args_str = (*env)->GetStringUTFChars(env, argsJson, NULL);

    JSValue global = JS_GetGlobalObject(h->ctx);
    JSValue helper = JS_GetPropertyStr(h->ctx, global, "__capsule_call");
    JS_FreeValue(h->ctx, global);

    JSValue fn_js   = JS_NewString(h->ctx, fn_str);
    JSValue args_js = JS_NewString(h->ctx, args_str);
    (*env)->ReleaseStringUTFChars(env, fn, fn_str);
    (*env)->ReleaseStringUTFChars(env, argsJson, args_str);

    JSValue argv[2] = { fn_js, args_js };
    JSValue result  = JS_Call(h->ctx, helper, JS_UNDEFINED, 2, argv);

    JS_FreeValue(h->ctx, fn_js);
    JS_FreeValue(h->ctx, args_js);
    JS_FreeValue(h->ctx, helper);

    if (JS_IsException(result)) {
        JSValue exc = JS_GetException(h->ctx);
        const char *msg = JS_ToCString(h->ctx, exc);
        jclass excClass = (*env)->FindClass(env, "java/lang/RuntimeException");
        (*env)->ThrowNew(env, excClass, msg ? msg : "call failed");
        if (msg) JS_FreeCString(h->ctx, msg);
        JS_FreeValue(h->ctx, exc);
        JS_FreeValue(h->ctx, result);
        return NULL;
    }

    const char *result_str = JS_ToCString(h->ctx, result);
    jstring jresult = (*env)->NewStringUTF(env, result_str ? result_str : "null");
    if (result_str) JS_FreeCString(h->ctx, result_str);
    JS_FreeValue(h->ctx, result);
    return jresult;
}
