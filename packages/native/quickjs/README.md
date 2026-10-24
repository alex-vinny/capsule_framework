# QuickJS-ng (vendored)

The on-device JavaScript engine that runs an app's `/api` route bundle — see
[adr-001](../../../docs/decisions/0001-embedded-runtime.md) and the
[QuickJS primer](../../../docs/concepts/primers/quickjs.md). One copy, shared by:

- **Android** — `packages/capsule-android/capsule/src/main/cpp/CMakeLists.txt` builds it into
  `libcapsule_quickjs_jni.so` together with the JNI glue (`quickjs_jni.c`).
- **iOS** — not compiled yet; the Phase-4 bridge sketch lives in `packages/capsule-ios/drafts/`.

Upstream: <https://github.com/quickjs-ng/quickjs> — MIT, see `LICENSE`. The pin is in `VERSION`.
**Do not edit these sources** — every change here is lost on the next update.

## Updating

```sh
node scripts/update-quickjs.mjs            # re-fetch the pinned ref
node scripts/update-quickjs.mjs v0.16.0    # move to a tag, branch or commit
```

The script copies the engine sources the Android build needs plus `LICENSE`, rewrites `VERSION`,
and prints the `.c` files `CMakeLists.txt` compiles so you can check a new release didn't add one.
Pin release tags only.
