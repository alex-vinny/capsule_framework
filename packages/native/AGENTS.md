# AGENTS.md — packages/native (vendored C)

Parent: [`../../AGENTS.md`](../../AGENTS.md).

Upstream C sources shared by both shells. Each folder has a `README.md` (what it is, compile-time
configuration) and a `VERSION` file (repo, ref, commit).

| Folder | Upstream | Built by |
|---|---|---|
| `civetweb/` | civetweb/civetweb (MIT) — the embedded loopback HTTP server | Android `CMakeLists.txt` · iOS `CCivetweb` target |
| `quickjs/` | quickjs-ng/quickjs (MIT) — the JS engine for on-device `/api` routes | Android `CMakeLists.txt` (iOS: not yet) |

## Rules

- **Never edit these files by hand** — the next update overwrites them. Fix behaviour in the glue
  (`capsule_server_jni.c`, `quickjs_jni.c`, `CivetwebServer.swift`) or upstream.
- Update with a **release tag** only (a `master` snapshot of CivetWeb did not compile):
  `pnpm update:civetweb <tag>` · `pnpm update:quickjs <tag>`. The script rewrites `VERSION` and
  lists the `.c` files to check against `CMakeLists.txt`.
- Compile-time defines are the same on both platforms — change `CMakeLists.txt` and
  `Package.swift` together and record it in the folder's `README.md`.
- After an update run `pnpm verify:android`, `pnpm verify:ios` and the Android instrumented tier.
- The licence notices (`LICENSE*`) ship with the sources; keep `NOTICE` at the repo root current.

## Docs

`docs/concepts/primers/civetweb.md` · `docs/concepts/primers/quickjs.md` ·
`docs/contributing/upkeep.md`.
