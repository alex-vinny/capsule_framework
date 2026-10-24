---
title: "Quickstart"
audience: app-developer
status: current
---
# Quick Start

Let's create a simple capsule app and run it on an emulator or device.

## 1. Create a new app

```bash
capsule create my-first-app --template react-ts
cd my-first-app
```

## 2. Install app dependencies

```bash
pnpm install
```

## 3. Start the development server

```bash
# This starts Vite (client) and the Node.js server for QuickJS
pnpm dev
```

In another terminal, run the Android dev command:

```bash
pnpm dev:android
```

You should see the app launch in the emulator or attached device.

## 4. Make a change

Edit `src/App.tsx` and save – the changes will hot‑reload instantly.

## 5. Build a release APK

```bash
pnpm build:android --release
```

The signed APK will be located at `android/app/build/outputs/apk/release/app-release.apk`.

That's it! You’ve just built and run a Capsule app.