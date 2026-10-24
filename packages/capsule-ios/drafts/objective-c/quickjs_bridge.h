#ifndef QUICKJS_BRIDGE_H
#define QUICKJS_BRIDGE_H

#include <quickjs.h>

/* Bridge functions that replicate Android JNI patterns */
JSValue quickjs_eval(JSContext *ctx, const char *code, size_t code_len);
JSValue quickjs_call(JSContext *ctx, const char *func, JSValue *args, int arg_count);
void quickjs_get_exception(JSContext *ctx, JSValue *exception);
void quickjs_set_dispatcher(void (*dispatch)(void*));
void quickjs_set_stack_base(uintptr_t stack_base);

/* Called from Swift to initialize the runtime */
JSRuntimeRef quickjs_create_runtime(void);
void quickjs_destroy_runtime(JSRuntimeRef runtime);

#endif /* QUICKJS_BRIDGE_H */