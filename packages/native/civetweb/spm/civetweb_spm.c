// Docs: docs/concepts/primers/civetweb.md
//
// SwiftPM's build of CivetWeb (Package.swift → CCivetweb). Android compiles src/civetweb.c
// directly; SwiftPM compiles this file instead.
//
// SwiftPM builds C with clang modules, and on Apple platforms the Darwin module declares
// `struct ah` (netinet6/ah.h, the IPsec header) — CivetWeb's own `struct ah` (a parsed HTTP
// auth header) is then an incompatible redefinition. The macro renames CivetWeb's identifier in
// this translation unit only; system headers come in as prebuilt modules and keep theirs. Every
// `ah` in civetweb.c is that struct, its variables or a field holding one, so the rename is total.
// This keeps the vendored source untouched for `pnpm update:civetweb`.
#define ah capsule_civetweb_auth_header
#include "../src/civetweb.c"
