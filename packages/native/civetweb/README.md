# CivetWeb (vendored)

The embedded loopback HTTP server behind `CapsuleServer` on **both** platforms
([adr-004](../../../docs/decisions/0004-web-serving-transport.md)). One copy, shared by:

- **Android** — `packages/capsule-android/capsule/src/main/cpp/CMakeLists.txt` builds it into
  `libcapsule_server.so` together with the JNI glue (`capsule_server_jni.c`).
- **iOS** — the `CCivetweb` C target in the repo-root `Package.swift`, wrapped by
  `CivetwebServer.swift`. SwiftPM compiles `spm/civetweb_spm.c`, which `#include`s
  `src/civetweb.c` after renaming CivetWeb's `struct ah`: under clang modules it clashes with
  Darwin's `struct ah` (`netinet6/ah.h`) and the macOS build fails.

Upstream: <https://github.com/civetweb/civetweb> — MIT, see `LICENSE.md`. The pinned commit is in
`VERSION`. **Do not edit `include/` or `src/`** — every change there is lost on the next update
(`spm/` is ours and the script leaves it alone).

## Compile-time configuration

Both builds use the same defines, so the two platforms run the same server:

| Define | Why |
|---|---|
| `NO_SSL` | Loopback only — TLS on `127.0.0.1` is rejected (adr-004 #3). |
| `NO_CGI` | No CGI. |
| `NO_FILES` | CivetWeb never serves files; Capsule answers every request itself through `begin_request` (static assets come from the APK / app bundle). |
| `NO_CACHING` | No file cache — nothing to cache with `NO_FILES`. |

`NO_FILESYSTEMS` is deliberately **not** set: it would require custom error-log and access-log
hooks (`mg_cry_internal_impl`, `log_access`). Without a log file configured, CivetWeb writes no
files anyway.

Pin **release tags** only: upstream `master` is not always buildable (the 2026-04 snapshot was not).

WebSockets (`USE_WEBSOCKET`) stay off until that work lands (adr-004, deferred).

## Updating

```sh
node scripts/update-civetweb.mjs            # re-fetch the pinned commit
node scripts/update-civetweb.mjs v1.17      # move to a tag, branch or commit
```

The script copies `include/civetweb.h`, `src/civetweb.c`, `src/*.inl` and `LICENSE.md`, and rewrites
`VERSION`. Then run the Android and iOS server tests (see `packages/capsule-android` and the
repo-root `Package.swift`).
