---
title: "ChatGPT first impressions"
audience: maintainer
status: record
---
This is a surprisingly coherent architecture. The thing that stands out is that you've actually chosen hard boundaries and enforced them consistently:

- Native shell = OS APIs only
- Plugins = third-party SDKs
- HTTP = request/response
- Bridge = events
- Native project = generated artifact
- Runtime components = interface-first

Most frameworks become messy because they violate those boundaries over time.

Go ahead with your questions.

Some areas where I'd be especially interested to discuss because they're the highest-risk parts of the design:

## 1. The "all OS APIs in core" promise

- Technically possible.
- The challenge isn't implementation.
- It's keeping Android/iOS API surface evolution manageable without turning `@capsule/core` into a giant maintenance burden.

## 2. Tree-shaking native code

- JS tree-shaking is easy.
- Native tree-shaking is trickier.
- R8 can strip unused classes, but permissions, manifest entries, service declarations, broadcast receivers, and iOS entitlements often require explicit build-time management.

## 3. QuickJS route handlers

- This is probably the most differentiated feature.
- It's also the feature most likely to create unexpected edge cases around:
  - memory limits
  - async execution
  - database access
  - background execution
  - OTA bundle compatibility

## 4. Embedded HTTP server

- Strong idea.
- Solves many `file://` problems.
- But you'll need a very clear story for:
  - service workers
  - localhost security
  - app lifecycle
  - deep linking into routes
  - startup latency

## 5. Binary dependency model

- This is arguably the biggest innovation.
- If developers never touch Android Studio or Xcode, you've eliminated one of the biggest pain points of hybrid development.
- The challenge becomes providing enough escape hatches without breaking the abstraction.

## 6. Override registry

- This is actually more interesting than most people realize.
- If done correctly, it gives you:
  - hotfixes
  - enterprise customizations
  - experimental APIs
  - vendor-specific patches

without shell forks.

## 7. CodeSync + server bundle

- Atomic deployment is the correct choice.
- I'd strongly recommend versioning the bridge contract separately from bundle versions so a newer OTA bundle can detect an older shell and refuse activation before a crash occurs.

Ask whatever you're wondering about—architecture, performance, business viability, comparison with Capacitor/Ionic, QuickJS design, plugin model, or whether some assumption is likely to break at scale.
