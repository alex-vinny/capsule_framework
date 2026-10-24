# Security policy

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through GitHub:
**[Report a vulnerability](https://github.com/alex-vinny/capsule_framework/security/advisories/new)**
(repository → Security → Advisories → "Report a vulnerability").

Include what is affected (package and version or commit), how to reproduce it, and the impact
you see. You will get an acknowledgement within a week; fixes are released as soon as they are
ready, and you will be credited in the advisory unless you ask otherwise.

## Supported versions

Capsule is pre-1.0. Only the latest release (and `main`) receives security fixes.

## Scope notes

- The embedded HTTP server binds `127.0.0.1` only and serves the app's own WebView; plain HTTP on
  loopback is a deliberate design choice (adr-004), not a vulnerability by itself.
- OTA bundles are verified by SHA-256 before install. Weaknesses in that path (verification,
  extraction, rollback) are in scope and especially welcome.
