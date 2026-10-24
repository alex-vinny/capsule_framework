// Docs: docs/concepts/primers/civetweb.md, docs/decisions/0004-web-serving-transport.md, docs/concepts/primers/jni-and-cpp.md
/*
 * capsule_server_jni.c — JNI glue between CivetWeb and dev.capsule.runtime.CivetwebServer.
 *
 * CivetWeb owns the socket and the worker threads. Every request is handed to the Kotlin
 * CivetwebServer.onRequest(method, path, headers, body), and the HttpResponse it returns is
 * streamed back. Worker threads are attached to the JVM once, in init_thread, and detached in
 * exit_thread, so a request never pays for an attach.
 *
 * All JNI ids are resolved in nativeStart, on a Java thread: FindClass on a CivetWeb thread
 * would use the system class loader and fail to see app classes.
 */
#include <jni.h>
#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <android/log.h>

#include "civetweb.h"

#define TAG "CapsuleServer"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

/* Largest request body accepted (413 above it). */
#define MAX_REQUEST_BODY (32 * 1024 * 1024)
/* Copy size when streaming a response body from Java. */
#define STREAM_CHUNK (64 * 1024)

typedef struct {
    JavaVM *vm;
    jobject server; /* global ref to the CivetwebServer instance */
    jmethodID on_request;
    jfieldID status, mime_type, body, content_length; /* HttpResponse */
    jmethodID stream_read, stream_close;              /* java.io.InputStream */
    struct mg_context *ctx;
} capsule_server;

static pthread_once_t library_once = PTHREAD_ONCE_INIT;

static void init_library(void) { mg_init_library(0); }

/* ── Thread lifecycle ──────────────────────────────────────────────────────── */

static void *on_init_thread(const struct mg_context *ctx, int thread_type) {
    if (thread_type != 1) return NULL; /* only worker threads (type 1) call into Java */
    capsule_server *s = mg_get_user_data(ctx);
    JNIEnv *env = NULL;
    JavaVMAttachArgs args = {JNI_VERSION_1_6, "capsule-http", NULL};
    if ((*s->vm)->AttachCurrentThreadAsDaemon(s->vm, &env, &args) != JNI_OK) {
        LOGE("Could not attach a server worker thread to the JVM");
        return NULL;
    }
    return env;
}

static void on_exit_thread(const struct mg_context *ctx, int thread_type, void *thread_pointer) {
    (void)thread_type;
    if (thread_pointer == NULL) return; /* never attached */
    capsule_server *s = mg_get_user_data(ctx);
    (*s->vm)->DetachCurrentThread(s->vm);
}

/* ── Request → Java ────────────────────────────────────────────────────────── */

static jbyteArray new_bytes(JNIEnv *env, const char *data, size_t len) {
    jbyteArray array = (*env)->NewByteArray(env, (jsize)len);
    if (array != NULL && len > 0) (*env)->SetByteArrayRegion(env, array, 0, (jsize)len, (const jbyte *)data);
    return array;
}

/* Headers as one block, "name\0value\0name\0value\0…" — decoded by CivetwebServer.kt parseHeaders(). */
static jbyteArray encode_headers(JNIEnv *env, const struct mg_request_info *ri) {
    size_t total = 0;
    for (int i = 0; i < ri->num_headers; i++) {
        total += strlen(ri->http_headers[i].name) + 1 + strlen(ri->http_headers[i].value) + 1;
    }
    char *block = malloc(total > 0 ? total : 1);
    if (block == NULL) return NULL;
    char *p = block;
    for (int i = 0; i < ri->num_headers; i++) {
        size_t name_len = strlen(ri->http_headers[i].name) + 1;
        size_t value_len = strlen(ri->http_headers[i].value) + 1;
        memcpy(p, ri->http_headers[i].name, name_len);
        p += name_len;
        memcpy(p, ri->http_headers[i].value, value_len);
        p += value_len;
    }
    jbyteArray array = new_bytes(env, block, total);
    free(block);
    return array;
}

/*
 * Reads the whole request body (Content-Length or chunked). Returns NULL for an empty body.
 * Sets *status to 413 or 500 when the body cannot be read; leaves it untouched otherwise.
 */
static jbyteArray read_body(JNIEnv *env, struct mg_connection *conn, const struct mg_request_info *ri, int *status) {
    long long expected = ri->content_length; /* -1 when unknown (chunked or no body) */
    if (expected == 0) return NULL;
    if (expected > MAX_REQUEST_BODY) {
        *status = 413;
        return NULL;
    }
    size_t capacity = expected > 0 ? (size_t)expected : 16 * 1024;
    size_t length = 0;
    char *buffer = malloc(capacity);
    if (buffer == NULL) {
        *status = 500;
        return NULL;
    }
    for (;;) {
        if (expected > 0 && length == (size_t)expected) break;
        if (length == capacity) {
            if (capacity >= MAX_REQUEST_BODY) {
                free(buffer);
                *status = 413;
                return NULL;
            }
            capacity = capacity * 2 > MAX_REQUEST_BODY ? MAX_REQUEST_BODY : capacity * 2;
            char *grown = realloc(buffer, capacity);
            if (grown == NULL) {
                free(buffer);
                *status = 500;
                return NULL;
            }
            buffer = grown;
        }
        int n = mg_read(conn, buffer + length, capacity - length);
        if (n <= 0) break;
        length += (size_t)n;
    }
    jbyteArray array = length > 0 ? new_bytes(env, buffer, length) : NULL;
    free(buffer);
    return array;
}

/* ── Java → response ───────────────────────────────────────────────────────── */

/* Reads up to one chunk from the Java InputStream: bytes read, 0 at end of stream, -1 on error. */
static int read_chunk(JNIEnv *env, capsule_server *s, jobject stream, jbyteArray jbuf, char *buf) {
    for (;;) {
        jint n = (*env)->CallIntMethod(env, stream, s->stream_read, jbuf);
        if ((*env)->ExceptionCheck(env)) {
            (*env)->ExceptionClear(env);
            return -1;
        }
        if (n < 0) return 0;
        if (n == 0) continue;
        (*env)->GetByteArrayRegion(env, jbuf, 0, n, (jbyte *)buf);
        return n;
    }
}

/*
 * HTTP/1.1 clients get an unknown-length body chunked. Anything older cannot take chunked
 * encoding, so the body is buffered first to send a Content-Length (rare: WebViews speak 1.1).
 */
static int buffer_stream(JNIEnv *env, capsule_server *s, jobject stream, jbyteArray jbuf, char *buf,
                         char **out, size_t *out_len) {
    size_t capacity = STREAM_CHUNK, length = 0;
    char *all = malloc(capacity);
    if (all == NULL) return -1;
    int n;
    while ((n = read_chunk(env, s, stream, jbuf, buf)) > 0) {
        if (length + (size_t)n > capacity) {
            while (length + (size_t)n > capacity) capacity *= 2;
            char *grown = realloc(all, capacity);
            if (grown == NULL) {
                free(all);
                return -1;
            }
            all = grown;
        }
        memcpy(all + length, buf, (size_t)n);
        length += (size_t)n;
    }
    if (n < 0) {
        free(all);
        return -1;
    }
    *out = all;
    *out_len = length;
    return 0;
}

static void send_headers(JNIEnv *env, struct mg_connection *conn, jint status, jstring mime_type, jlong length) {
    mg_response_header_start(conn, status);
    const char *mime = (*env)->GetStringUTFChars(env, mime_type, NULL);
    mg_response_header_add(conn, "Content-Type", mime != NULL ? mime : "application/octet-stream", -1);
    if (mime != NULL) (*env)->ReleaseStringUTFChars(env, mime_type, mime);
    /* Revalidate every load: an OTA update swaps files behind the same URLs. */
    mg_response_header_add(conn, "Cache-Control", "no-cache", -1);
    if (length < 0) {
        mg_response_header_add(conn, "Transfer-Encoding", "chunked", -1);
    } else {
        char content_length[32];
        snprintf(content_length, sizeof content_length, "%lld", (long long)length);
        mg_response_header_add(conn, "Content-Length", content_length, -1);
    }
    mg_response_header_send(conn);
}

/* Streams the body; length < 0 means chunked. */
static void send_body(JNIEnv *env, capsule_server *s, struct mg_connection *conn, jobject stream,
                      jbyteArray jbuf, char *buf, jlong length) {
    int chunked = length < 0;
    int n;
    while ((n = read_chunk(env, s, stream, jbuf, buf)) > 0) {
        int written = chunked ? mg_send_chunk(conn, buf, (unsigned)n) : mg_write(conn, buf, (size_t)n);
        if (written < 0) return; /* client went away */
    }
    if (chunked) mg_send_chunk(conn, "", 0); /* terminating zero-length chunk */
}

static int send_response(JNIEnv *env, capsule_server *s, struct mg_connection *conn,
                         const struct mg_request_info *ri, jobject response) {
    jint status = (*env)->GetIntField(env, response, s->status);
    jstring mime_type = (*env)->GetObjectField(env, response, s->mime_type);
    jobject stream = (*env)->GetObjectField(env, response, s->body);
    jlong length = (*env)->GetLongField(env, response, s->content_length);
    int head_only = strcmp(ri->request_method, "HEAD") == 0;
    int http11 = ri->http_version != NULL && strcmp(ri->http_version, "1.1") == 0;

    jbyteArray jbuf = (*env)->NewByteArray(env, STREAM_CHUNK);
    char *buf = malloc(STREAM_CHUNK);
    char *buffered = NULL;
    size_t buffered_len = 0;
    int ok = jbuf != NULL && buf != NULL && mime_type != NULL && stream != NULL;

    if (ok && length < 0 && !http11 && !head_only) {
        ok = buffer_stream(env, s, stream, jbuf, buf, &buffered, &buffered_len) == 0;
        length = (jlong)buffered_len;
    }
    if (!ok) {
        mg_send_http_error(conn, 500, "%s", "Could not produce the response");
        status = 500;
    } else {
        send_headers(env, conn, status, mime_type, length);
        if (head_only) {
            /* headers only */
        } else if (buffered != NULL) {
            mg_write(conn, buffered, buffered_len);
        } else {
            send_body(env, s, conn, stream, jbuf, buf, length);
        }
    }

    if (stream != NULL) {
        (*env)->CallVoidMethod(env, stream, s->stream_close);
        if ((*env)->ExceptionCheck(env)) (*env)->ExceptionClear(env);
    }
    free(buffered);
    free(buf);
    return status;
}

static int handle_request(JNIEnv *env, capsule_server *s, struct mg_connection *conn,
                          const struct mg_request_info *ri) {
    int error_status = 0;
    jbyteArray body = read_body(env, conn, ri, &error_status);
    if (error_status != 0) {
        mg_send_http_error(conn, error_status, "%s",
                           error_status == 413 ? "Request body too large" : "Could not read the request body");
        return error_status;
    }

    const char *path = ri->local_uri != NULL ? ri->local_uri : "/";
    jstring method = (*env)->NewStringUTF(env, ri->request_method);
    jbyteArray jpath = new_bytes(env, path, strlen(path));
    jbyteArray headers = encode_headers(env, ri);
    jobject response = NULL;
    if (method != NULL && jpath != NULL && headers != NULL) {
        response = (*env)->CallObjectMethod(env, s->server, s->on_request, method, jpath, headers, body);
    }
    if ((*env)->ExceptionCheck(env)) (*env)->ExceptionClear(env);
    if (response == NULL) {
        mg_send_http_error(conn, 500, "%s", "Request handler failed");
        return 500;
    }
    return send_response(env, s, conn, ri, response);
}

/* begin_request: Capsule answers every request itself (CivetWeb is built with NO_FILES). */
static int on_begin_request(struct mg_connection *conn) {
    const struct mg_request_info *ri = mg_get_request_info(conn);
    capsule_server *s = ri->user_data;
    JNIEnv *env = NULL;
    if ((*s->vm)->GetEnv(s->vm, (void **)&env, JNI_VERSION_1_6) != JNI_OK) {
        mg_send_http_error(conn, 500, "%s", "Server thread is not attached to the JVM");
        return 500;
    }
    if ((*env)->PushLocalFrame(env, 16) != 0) {
        (*env)->ExceptionClear(env);
        mg_send_http_error(conn, 500, "%s", "Out of memory");
        return 500;
    }
    int status = handle_request(env, s, conn, ri);
    (*env)->PopLocalFrame(env, NULL);
    return status;
}

/* ── Lifecycle (called from Kotlin) ────────────────────────────────────────── */

static void set_error(JNIEnv *env, jobjectArray error_out, const char *text) {
    jstring message = (*env)->NewStringUTF(env, text);
    if (message != NULL) (*env)->SetObjectArrayElement(env, error_out, 0, message);
}

static int resolve_ids(JNIEnv *env, capsule_server *s, jobject server) {
    jclass server_class = (*env)->GetObjectClass(env, server);
    s->on_request = (*env)->GetMethodID(env, server_class, "onRequest",
                                        "(Ljava/lang/String;[B[B[B)Ldev/capsule/runtime/HttpResponse;");
    jclass response_class = (*env)->FindClass(env, "dev/capsule/runtime/HttpResponse");
    if (s->on_request == NULL || response_class == NULL) return 0;
    s->status = (*env)->GetFieldID(env, response_class, "status", "I");
    s->mime_type = (*env)->GetFieldID(env, response_class, "mimeType", "Ljava/lang/String;");
    s->body = (*env)->GetFieldID(env, response_class, "body", "Ljava/io/InputStream;");
    s->content_length = (*env)->GetFieldID(env, response_class, "contentLength", "J");
    jclass stream_class = (*env)->FindClass(env, "java/io/InputStream");
    if (stream_class == NULL) return 0;
    s->stream_read = (*env)->GetMethodID(env, stream_class, "read", "([B)I");
    s->stream_close = (*env)->GetMethodID(env, stream_class, "close", "()V");
    return s->status && s->mime_type && s->body && s->content_length && s->stream_read && s->stream_close;
}

JNIEXPORT jlong JNICALL
Java_dev_capsule_runtime_CivetwebServer_nativeStart(JNIEnv *env, jobject thiz, jint port, jint worker_threads,
                                                    jobjectArray error_out) {
    pthread_once(&library_once, init_library);

    capsule_server *s = calloc(1, sizeof *s);
    if (s == NULL) {
        set_error(env, error_out, "Out of memory");
        return 0;
    }
    if (!resolve_ids(env, s, thiz)) {
        (*env)->ExceptionClear(env);
        free(s);
        set_error(env, error_out, "JNI lookup of CivetwebServer.onRequest / HttpResponse failed");
        return 0;
    }
    (*env)->GetJavaVM(env, &s->vm);
    s->server = (*env)->NewGlobalRef(env, thiz);

    char listening_ports[32], num_threads[16];
    snprintf(listening_ports, sizeof listening_ports, "127.0.0.1:%d", (int)port);
    snprintf(num_threads, sizeof num_threads, "%d", (int)worker_threads);
    const char *options[] = {
        "listening_ports", listening_ports,
        "num_threads", num_threads,
        "enable_keep_alive", "yes",
        NULL,
    };

    struct mg_callbacks callbacks;
    memset(&callbacks, 0, sizeof callbacks);
    callbacks.begin_request = on_begin_request;
    callbacks.init_thread = on_init_thread;
    callbacks.exit_thread = on_exit_thread;

    char error_text[256] = "";
    struct mg_error_data error = {.text = error_text, .text_buffer_size = sizeof error_text};
    struct mg_init_data init = {.callbacks = &callbacks, .user_data = s, .configuration_options = options};

    /* Returns once the socket is bound and listening — the readiness contract. */
    s->ctx = mg_start2(&init, &error);
    if (s->ctx == NULL) {
        set_error(env, error_out, error_text);
        (*env)->DeleteGlobalRef(env, s->server);
        free(s);
        return 0;
    }
    return (jlong)(intptr_t)s;
}

JNIEXPORT void JNICALL
Java_dev_capsule_runtime_CivetwebServer_nativeStop(JNIEnv *env, jobject thiz, jlong handle) {
    (void)thiz;
    capsule_server *s = (capsule_server *)(intptr_t)handle;
    if (s == NULL) return;
    mg_stop(s->ctx); /* joins every server thread; exit_thread detaches the workers */
    (*env)->DeleteGlobalRef(env, s->server);
    free(s);
}
