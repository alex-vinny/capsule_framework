# Applied by R8 in apps that depend on capsule-android.

# CivetwebServer is driven from native code (src/main/cpp/capsule_server_jni.c), which looks these
# members up by name — R8 must neither remove nor rename them.
-keep class dev.capsule.runtime.CivetwebServer {
    private dev.capsule.runtime.HttpResponse onRequest(java.lang.String, byte[], byte[], byte[]);
    native <methods>;
}
-keep class dev.capsule.runtime.HttpResponse {
    int status;
    java.lang.String mimeType;
    java.io.InputStream body;
    long contentLength;
}
