---
title: "Installation"
audience: app-developer
status: current
---
# Installation

To get started with Capsule Framework, follow these steps:

## Prerequisites

- [Node.js](https://nodejs.org/) (>= 22.12)
- [pnpm](https://pnpm.io/) (>= 8.x)
- Java Development Kit (JDK) 17 (for Android builds)
- Android Studio (including SDK and emulator) or Xcode (for iOS, when available)
- Git

## Clone the repository

```bash
git clone https://github.com/your-org/capsule-framework.git
cd capsule-framework
```

## Install dependencies

```bash
pnpm install
```

## Set up environment

Machine paths (JDK, Android SDK, emulator) live in a git-ignored `.env.local` at the repo root — the
same on Windows, macOS and Linux:

```bash
cp .env.example .env.local   # then set JAVA_HOME, ANDROID_HOME, AVD_NAME, …
pnpm dev:env                 # print the resolved environment
```

## Verify the setup

```bash
pnpm run version   # should print the current version
```

You are now ready to develop with Capsule Framework.