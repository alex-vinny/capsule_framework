---
title: "Capacitor/Cordova compatibility strategy"
audience: maintainer
status: record
---
# Capacitor/Cordova Compatibility Strategy for Capsule

## Fundamental Principle

Do **not** attempt to become a Capacitor or Cordova runtime.

Bad direction:

```text
Capsule Runtime
 └── Capacitor Runtime
      └── Cordova Runtime
```

This creates:

- duplicated bridge layers
- duplicated lifecycle systems
- duplicated plugin systems
- permanent compatibility debt

Instead:

```text
Capacitor Plugin
       │
       ▼
Importer
       │
       ▼
Capsule Plugin ABI
       │
       ▼
Capsule Runtime
```

The goal is:

> Make plugin migration cheap, not plugin execution universal.

---

# Plugin Importer

## What the importer does

Example:

```bash
capsule plugin import capacitor @capacitor/filesystem
```

The importer:

1. Reads plugin metadata
2. Detects methods
3. Detects permissions
4. Detects events
5. Detects lifecycle requirements
6. Generates Capsule plugin scaffolding

Example output:

```text
capsule-plugins/
└── filesystem/
    ├── capsule-plugin.json
    ├── android/
    │   └── FilesystemAdapter.kt
    ├── ios/
    │   └── FilesystemAdapter.swift
    └── web/
        └── index.ts
```

---

## Why a universal importer is impossible

Not all plugins are simple RPC wrappers.

### Simple Plugin

```kotlin
@CapacitorPlugin(name = "Camera")
class CameraPlugin : Plugin() {

    @PluginMethod
    fun getPhoto(call: PluginCall) {
        ...
    }
}
```

Importer can map this automatically.

```text
Camera.getPhoto()
        │
        ▼
camera.capture()
```

---

### Activity Lifecycle Plugin

```kotlin
registerActivityResultLauncher(...)
```

Requires:

- activity result callbacks
- permission callbacks
- lifecycle integration

Importer must generate additional adapter code.

---

### Deep Runtime Plugin

```kotlin
bridge.getWebView()
bridge.getConfig()
pluginHandle.load()
```

Now plugin depends on Capacitor internals.

Example:

```kotlin
class CustomPlugin : Plugin() {

    fun doSomething() {
        val webView = bridge.webView
        ...
    }
}
```

Importer cannot safely translate this automatically.

Manual work required.

---

# Support Levels

## Level 1 — Certified

Guaranteed support.

Examples:

```text
@capacitor/filesystem
@capacitor/preferences
@capacitor/device
@capacitor/share
```

Characteristics:

```text
✓ CI tested
✓ Official support
✓ Version compatibility guarantees
✓ Fully automated import
```

---

## Level 2 — Importable

Importer can generate working adapters.

Characteristics:

```text
✓ Mostly automatic
✓ Community maintained
✓ Not guaranteed
```

Example:

```bash
capsule plugin import capacitor some-plugin
```

Result:

```text
✓ Methods imported
✓ Permissions imported
✓ Events imported

Warnings:
 - Unsupported lifecycle hook
```

---

## Level 3 — Manual Port

Importer generates scaffolding.

Example:

```bash
capsule plugin import capacitor enterprise-plugin
```

Output:

```text
Generated:
  android/Adapter.kt
  ios/Adapter.swift

TODO:
  Replace Bridge.getWebView()
  Replace PluginManager references
  Replace ActivityResult integration
```

Developer completes the migration.

---

# Capsule Plugin ABI

The ABI is not the importer.

The ABI is the internal format all plugins become.

---

## Weak ABI (Not Recommended)

```json
{
  "methods": [
    {
      "name": "capturePhoto"
    }
  ]
}
```

Supports only simple RPC plugins.

Many plugins become impossible.

---

## Strong ABI (Recommended)

Should support:

```text
Methods
Events
Permissions
Activity Results
Lifecycle Hooks
Background Services
Foreground Services
Deep Links
Notifications
Native Views
Broadcast Receivers
Assets
Configuration
```

Conceptually:

```text
Capacitor Plugin
Cordova Plugin
Custom Plugin
        │
        ▼
   Capsule ABI
        │
        ▼
 Capsule Runtime
```

---

# Example ABI Manifest

```json
{
  "name": "filesystem",
  "version": "1.0.0",
  "permissions": ["READ_EXTERNAL_STORAGE"],
  "methods": [
    {
      "name": "readFile",
      "params": [
        {
          "name": "path",
          "type": "string"
        }
      ],
      "returns": "string"
    }
  ],
  "events": [],
  "nativeViews": [],
  "backgroundServices": []
}
```

---

# Generated Plugin Structure

```text
plugin/
├── capsule-plugin.json
├── android/
│   └── Filesystem.kt
├── ios/
│   └── Filesystem.swift
└── web/
    └── index.ts
```

Runtime only understands this format.

No Capacitor concepts.

No Cordova concepts.

---

# Capacitor Compatibility

Capacitor plugins are generally easier.

Typical Capacitor plugin:

```typescript
import { registerPlugin } from "@capacitor/core";

export const Camera = registerPlugin("Camera");
```

Native:

```kotlin
@CapacitorPlugin(name = "Camera")
class CameraPlugin : Plugin()
```

Importer can usually map:

```text
registerPlugin("Camera")
          │
          ▼
Capsule ABI Method
```

Many modern plugins fit this model.

---

# Cordova Compatibility

Cordova is harder.

Typical Cordova JS:

```javascript
cordova.exec(success, error, "Camera", "getPicture", []);
```

Native:

```java
public class CameraLauncher extends CordovaPlugin
```

Cordova plugins often depend on:

```text
CordovaPlugin
CordovaInterface
CordovaWebView
CordovaPreferences
CordovaActivity
```

These are runtime-level dependencies.

A generic importer becomes much harder.

---

# Why Not Full Cordova Runtime Compatibility

Suppose Capsule decides to run Cordova plugins directly.

Now Capsule needs:

```text
Capsule Runtime
├── CordovaPlugin
├── CordovaWebView
├── CordovaActivity
├── CordovaBridge
├── CordovaPreferences
└── CordovaLifecycle
```

This creates:

```text
Capsule
 └── Cordova
```

which violates Capsule's core principle:

> The shell is a dependency, not a framework stack.

---

# Recommended Architecture

```text
Capacitor Plugin
       │
       ▼
Importer
       │
       ▼
Capsule ABI
       │
       ▼
Capsule Runtime
```

and

```text
Cordova Plugin
       │
       ▼
Importer
       │
       ▼
Capsule ABI
       │
       ▼
Capsule Runtime
```

The runtime never understands Capacitor or Cordova.

Only the importer does.

---

# Long-Term Goal

Do not build:

```text
A system that executes every Capacitor plugin.
```

Build:

```text
A system that makes Capacitor plugins cheap to port.
```

Target migration flow:

```text
Capacitor Plugin
       │
       ▼
Importer
       │
       ▼
80% generated
20% manual fixes
       │
       ▼
Capsule Plugin
```

This is achievable.

A fully universal compatibility layer is not.
