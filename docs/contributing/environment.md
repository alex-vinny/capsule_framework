---
title: "Development environment"
audience: contributor
status: current
code:
  - scripts/dev-env.mjs
  - scripts/with-env.mjs
  - scripts/lib/env.mjs
  - .env.example
tests:
  - scripts/lib/env.test.mjs
---
# Capsule Framework — Development Environment

> **Three audiences, three sections.**
>
> - **Building an app with Capsule?** Start at [Part 1 — Getting Started (App Developer)](#part-1--getting-started-app-developer).
> - **Setting up the creator machine to build the framework itself?** Go to [Part 2 — Framework Creator Setup (Windows 11)](#part-2--framework-creator-setup-windows-11).
> - **Contributing to the Capsule framework?** Jump to [Part 3 — Framework Contributors](#part-3--framework-contributors).

---

## Platform Requirements

| Work | OS requirement |
|------|---------------|
| App development (CLI + web layer) | Windows, macOS, or Linux |
| Android builds and emulator | Windows, macOS, or Linux |
| iOS builds | **macOS only** — Apple constraint |
| Docker-based CI builds | Windows (WSL2), macOS, or Linux |

---

## Part 1 — Getting Started (App Developer)

Everything you need to go from zero to a running Capsule app on an Android device or emulator.

### 1.1 Install prerequisites

**Node.js 22 (LTS)**

```bash
# macOS / Linux — using nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc   # or ~/.zshrc
nvm install 22 && nvm use 22 && nvm alias default 22

node --version    # v22.x.x
```

```powershell
# Windows — nvm-windows
# Download from github.com/coreybutler/nvm-windows/releases
nvm install 22
nvm use 22
```

**pnpm** (or npm — both work for app development)

```bash
npm install -g pnpm@9
```

---

### 1.2 Install the Capsule CLI

> **Note — App developers only.** This step assumes `@capsule/cli` has been published to npm. If you are building the framework itself, skip Parts 1–4 entirely and go to [Part 3 — Framework Contributors](#part-3--framework-contributors).

```bash
npm install -g @capsule/cli

capsule --version    # 1.x.x
```

---

### 1.3 Android prerequisites

You need a JDK and the Android SDK command-line tools. No Android Studio required.

**JDK 17**

```bash
# macOS — SDKMAN
curl -s "https://get.sdkman.io" | bash
source "$HOME/.sdkman/bin/sdkman-init.sh"
sdk install java 17.0.11-tem
java -version    # openjdk 17.x.x

# Linux (Debian/Ubuntu)
sudo apt-get install -y openjdk-17-jdk-headless

# Windows — download Eclipse Temurin 17 from adoptium.net, set JAVA_HOME
```

**Android SDK command-line tools**

```bash
# macOS / Linux
mkdir -p ~/android-sdk/cmdline-tools
wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip \
     -O /tmp/cmdline-tools.zip
unzip /tmp/cmdline-tools.zip -d /tmp/cmdline-unzip
mv /tmp/cmdline-unzip/cmdline-tools ~/android-sdk/cmdline-tools/latest

echo 'export ANDROID_HOME=$HOME/android-sdk' >> ~/.bashrc
echo 'export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH' >> ~/.bashrc
source ~/.bashrc

# Accept licenses and install required components
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

**Android Emulator** (skip if testing on a physical device)

```bash
sdkmanager "emulator" "system-images;android-35;google_apis;x86_64"  # Intel/AMD
# Apple Silicon: use system-images;android-35;google_apis_playstore;arm64-v8a

avdmanager create avd \
    --name "Pixel_8_API35" \
    --device "pixel_8" \
    --package "system-images;android-35;google_apis;x86_64"

emulator -avd Pixel_8_API35 -no-audio -no-boot-anim &
```

---

### 1.4 iOS prerequisites (macOS only)

```bash
# Install Xcode 15+ from the Mac App Store, then:
sudo xcodebuild -license accept
xcodebuild -version    # Xcode 15.x or 16.x
```

---

## Part 2 — Create Your First App

### 2.1 Scaffold

```bash
# Interactive (prompts for template, app ID, etc.)
capsule init my-app

# Or non-interactive with flags
capsule init my-app --template react-ts --app-id com.yourcompany.myapp

# Available templates: react-ts | vue-ts | svelte-ts | vanilla-ts
# Community template: --template github:org/template-name

cd my-app
pnpm install
```

What gets generated:

```
my-app/
  src/
    index.html
    main.ts
    App.tsx              # or .vue / .svelte depending on template
  public/
  capsule.config.ts      # the ONLY native configuration file
  capsule.lock           # commit this — pins resolved shell versions
  package.json
  vite.config.ts
```

---

### 2.2 Add a platform

```bash
# Android (works on Windows, macOS, Linux)
capsule add android

# iOS (macOS only)
capsule add ios
```

This generates the thin `.capsule/android/` or `.capsule/ios/` wrapper from `capsule.lock`. The wrapper is gitignored — never edit it directly.

---

### 2.3 Configure your app

Open `capsule.config.ts` — this is the only file you touch for native configuration:

```typescript
import { defineConfig } from '@capsule/cli'

export default defineConfig({
  appId:   'com.yourcompany.myapp',   // reverse-domain, must match store listing
  appName: 'My App',

  version: {
    name:        '1.0.0',
    buildNumber: 1
  },

  android: {
    minSdk:    26,
    targetSdk: 35,
    permissions: ['CAMERA']           // only if your app uses camera
  }
})
```

See `../concepts/principles.md` for the full `defineConfig` reference.

---

## Part 3 — Development Workflow

### 3.1 Start the dev server

```bash
capsule dev
```

What this does:
- Starts a Vite dev server at `http://localhost:5173`
- Runs `adb reverse tcp:5173 tcp:5173` so the emulator/device loads from your machine
- Watches for file changes → hot module replacement in **<50ms**

```bash
# Physical device on the same WiFi
capsule dev --qr            # prints QR code — scan with device

# Physical device on corporate WiFi / different network
capsule dev --tunnel --qr   # HTTPS tunnel, no network config needed

# Custom port
capsule dev --port 3000
```

Open the emulator — the app loads and hot-reloads as you edit files in `src/`.

---

### 3.2 Using platform APIs

Import from `@capsule/core` — no separate packages to install:

```typescript
import { camera, geolocation, haptics, db, preferences, browser } from '@capsule/core'

// Camera
const photo = await camera.capture({ quality: 0.9 })

// Collection API — zero SQL, auto-schema
const items = db.collection<{ id: string; name: string }>('items')
const item = await items.add({ name: 'hello' })
const all  = await items.getAll()
const found = await items.get(item.id)
await items.update(item.id, { name: 'world' })
await items.remove(item.id)

// Raw SQL tagged template (values always parameterized — injection-safe)
const recent = await db.sql<{ id: string; name: string }[]>`
  SELECT * FROM items WHERE name LIKE ${'%world%'} LIMIT 10
`

// Encrypted named database (developer supplies key)
const key = await biometrics.getKey('db-key')
const secureDb = await database.open('secure', { key })
const secrets = secureDb.collection<{ id: string; token: string }>('secrets')
await secureDb.close()

// Key-value storage (SharedPreferences / UserDefaults)
await preferences.set({ key: 'theme', value: 'dark' })
const { value } = await preferences.get({ key: 'theme' })

// In-app browser (Chrome Custom Tabs / SFSafariViewController)
// Best for OAuth, payment pages, external links
const unsub = browser.onNavigationChange(({ url }) => {
  if (url.startsWith('myapp://callback')) { browser.close(); unsub() }
})
await browser.open({ url: 'https://accounts.google.com/...' })

// GPS, haptics, push, NFC, Bluetooth, biometrics — all in @capsule/core
const position = await geolocation.getCurrentPosition()
await haptics.impact('medium')
```

Unused capabilities are tree-shaken from the release build. Full API reference: `core-api.md`.

---

### 3.3 Build

```bash
# Debug build
capsule build android

# Signed release APK
capsule build android --release

# Signed AAB (required for Play Store)
capsule build android --release --format aab

# iOS (macOS only)
capsule build ios --release
```

Output: `.capsule/android/app-release.aab` (or `.apk`)

---

### 3.4 Run on device / emulator

```bash
# Deploy to the running emulator or connected USB device
capsule run android

# Target a specific device
capsule run android --device <id>    # get IDs from: adb devices

# iOS
capsule run ios
```

---

### 3.5 Publish to stores

```bash
# Android — Play Store
capsule publish android --track internal      # internal testing
capsule publish android --track production    # production

# iOS — App Store Connect
capsule publish ios --track testflight
capsule publish ios --track production
```

See `publishing.md` for signing setup and full publish options.

---

## Part 4 — Quick Reference

### CLI cheat sheet

```bash
capsule init <name>                      # scaffold new app
capsule add android | ios                # add platform
capsule sync                             # regenerate .capsule/ wrappers
capsule dev                              # start dev server + hot reload
capsule build android [--release]        # build APK/AAB
capsule build ios [--release]            # build IPA (macOS only)
capsule run android | ios                # deploy to device/emulator
capsule publish android | ios            # upload to store
capsule version bump patch|minor|major   # manage version numbers
capsule codesync publish                 # push OTA update (CodeSync)
capsule update                           # update capsule shell version
capsule doctor                           # diagnose environment issues
```

### Troubleshooting

```bash
capsule doctor          # verify environment — always run this first
capsule sync            # regenerate wrappers if something looks wrong
adb devices             # confirm emulator/device is visible
```

---

## Part 2 — Framework Creator Setup (Windows 11)

> **Audience**: The creator of Capsule — setting up a Windows 11 Pro machine to build the framework from scratch.
>
> This is not the app-developer getting-started guide. This is the environment needed to build, test, and publish the Capsule framework itself.

---

### What You Need to Build

| Target                           | Tools Required                     |
| -------------------------------- | ---------------------------------- |
| `@capsule/cli` (Node/TypeScript) | Node ≥ 22.12, pnpm, TypeScript     |
| `@capsule/core` (TypeScript)     | Node 22, pnpm, TypeScript          |
| Android shell (Kotlin AAR)       | JDK 17, Android SDK, Gradle        |
| CodeSync backend (Node/Fastify)  | Node 22, Docker, PostgreSQL, Redis |
| CodeSync dashboard (React)       | Node 22                            |
| Docker images                    | Docker Desktop                     |
| Publishing / CI/CD               | GitHub account, GHCR, GitHub Actions |

---

### Overview

```
Phase 1 — Local MVP
  Windows 11 Pro
    └── WSL2 (Ubuntu 22.04)          ← primary dev environment
          ├── Node.js 22 (nvm)
          ├── pnpm 9 + Turbo 2
          ├── JDK 17 (Temurin)
          ├── Android SDK (API 35)
          └── Docker CLI (via Docker Desktop socket)
    └── Docker Desktop 4.30+         ← runs on Windows, socket shared to WSL2
    └── VS Code                      ← IDE, WSL2 + Dev Containers extension
    └── Git (local config only)
    └── Windows Terminal
    └── ADB (platform-tools)        ← Windows side
    └── Android Emulator             ← Windows host (KVM not available in WSL2)

Phase 8 — Go Online / Ecosystem  (after local MVP works)
  └── GitHub CLI (gh)               ← Windows + WSL2
  └── GitHub org + repos
  └── GHCR (container registry)
  └── GitHub Actions CI/CD
```

---

### Phase 1 — Local MVP

#### Step 1 — Windows Terminal + WSL2

##### 1.1 Windows Terminal

Download from Microsoft Store or: `winget install Microsoft.WindowsTerminal`

##### 1.2 WSL2 + Ubuntu 22.04

```powershell
# Run as Administrator in PowerShell
wsl --install -d Ubuntu-22.04
# Restart when prompted
```

After restart, Ubuntu will finish setup. Create your UNIX username + password.

```powershell
# Verify
wsl --list --verbose
# Should show Ubuntu-22.04  Running  2
```

##### 1.3 Set Ubuntu 22.04 as default

```powershell
wsl --set-default Ubuntu-22.04
```

##### 1.4 Update Ubuntu

```bash
# Inside WSL2 Ubuntu terminal
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y curl wget git unzip zip ca-certificates build-essential
```

---

#### Step 2 — Node.js 22 + pnpm + Turbo

##### 2.1 Node.js 22 via nvm (WSL2)

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Reload shell
source ~/.bashrc

# Install and use Node 22
nvm install 22
nvm use 22
nvm alias default 22

node --version   # v22.x.x
npm --version    # 10.x.x
```

##### 2.2 pnpm 9 + Turbo 2

```bash
npm install -g pnpm@9 turbo@2

pnpm --version   # 9.x.x
turbo --version  # 2.x.x
```

##### 2.3 Node.js on Windows (for tools that run on the host)

```powershell
# Download nvm-windows from github.com/coreybutler/nvm-windows/releases
# Install, then:
nvm install 22
nvm use 22
npm install -g pnpm@9
```

---

#### Step 3 — JDK 17 (WSL2)

```bash
# Install Eclipse Temurin 17 (the same JDK used in the Docker images)
sudo apt-get install -y wget apt-transport-https gnupg

wget -qO - https://packages.adoptium.net/artifactory/api/gpg/key/public \
  | sudo gpg --dearmor -o /usr/share/keyrings/adoptium.gpg

echo "deb [signed-by=/usr/share/keyrings/adoptium.gpg] \
  https://packages.adoptium.net/artifactory/deb $(. /etc/os-release && echo "$VERSION_CODENAME") main" \
  | sudo tee /etc/apt/sources.list.d/adoptium.list

sudo apt-get update && sudo apt-get install -y temurin-17-jdk

java -version
# openjdk version "17.0.x" ... Temurin
```

```bash
# Set JAVA_HOME
echo 'export JAVA_HOME=/usr/lib/jvm/temurin-17-jdk-amd64' >> ~/.bashrc
echo 'export PATH=$JAVA_HOME/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

---

#### Step 4 — Android SDK (WSL2)

```bash
# Create SDK directory
mkdir -p ~/android-sdk/cmdline-tools

# Download command-line tools
wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip \
     -O /tmp/cmdline-tools.zip
unzip -q /tmp/cmdline-tools.zip -d /tmp/cmdline-unzip
mv /tmp/cmdline-unzip/cmdline-tools ~/android-sdk/cmdline-tools/latest
rm /tmp/cmdline-tools.zip

# Set environment variables
echo 'export ANDROID_HOME=$HOME/android-sdk' >> ~/.bashrc
echo 'export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH' >> ~/.bashrc
source ~/.bashrc

# Accept licenses and install required SDK components
yes | sdkmanager --licenses > /dev/null 2>&1
sdkmanager \
    "platform-tools" \
    "platforms;android-35" \
    "build-tools;35.0.0" \
    "extras;android;m2repository" \
    "extras;google;m2repository"

# Verify
sdkmanager --list_installed
```

---

#### Step 5 — Android Emulator (Windows host)

The Android Emulator must run on the **Windows host** (not inside WSL2 — KVM is not available on Windows WSL2).

##### 5.1 Install Android Studio (Windows)

Download from `developer.android.com/studio` (Ladybug 2024.2 or later).

During setup:

- SDK location: `C:\Users\<you>\AppData\Local\Android\Sdk`
- Install Android 15 (API 35) system image

##### 5.2 Or — SDK Manager on Windows (no Android Studio)

```powershell
# Download cmdline-tools for Windows
# From developer.android.com/tools/releases/cmdline-tools
# Extract to C:\android-sdk\cmdline-tools\latest\

# Add to PATH (System Environment Variables):
# C:\android-sdk\cmdline-tools\latest\bin
# C:\android-sdk\platform-tools

sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
sdkmanager "emulator" "system-images;android-35;google_apis;x86_64"

avdmanager create avd `
    --name "Pixel_8_API35" `
    --device "pixel_8" `
    --package "system-images;android-35;google_apis;x86_64"

# Launch emulator
emulator -avd Pixel_8_API35 -no-audio -no-boot-anim
```

##### 5.3 ADB on Windows + WSL2 bridge

ADB runs on Windows host. WSL2 talks to it via `host.docker.internal`.

```powershell
# Windows: ensure adb is in PATH
adb version    # Android Debug Bridge version 1.x.x
adb devices    # lists connected emulators/devices
```

```bash
# WSL2: point to host ADB server
echo 'export ANDROID_ADB_SERVER_ADDRESS=host.docker.internal' >> ~/.bashrc
echo 'export ANDROID_ADB_SERVER_PORT=5037' >> ~/.bashrc
source ~/.bashrc

adb devices   # connects to the host ADB server automatically
```

---

#### Step 6 — Docker Desktop

##### 6.1 Install Docker Desktop

Download from `docker.com/products/docker-desktop`.

Settings to enable:

- `General → Use the WSL 2 based engine` ✅
- `Resources → WSL Integration → Ubuntu-22.04` ✅

```bash
# Verify from WSL2
docker --version
docker compose version
```

---

#### Step 7 — VS Code

##### 7.1 Install VS Code

```powershell
winget install Microsoft.VisualStudioCode
```

##### 7.2 Essential extensions

Install from Extensions panel (`Ctrl+Shift+X`):

```
dbaeumer.vscode-eslint             ESLint
esbenp.prettier-vscode             Prettier
ms-vscode.vscode-typescript-next   Latest TS language server
fwcd.kotlin                        Kotlin syntax + completion
ms-azuretools.vscode-docker        Docker explorer
ms-vscode-remote.remote-wsl        WSL2 integration
ms-vscode-remote.remote-containers Dev Containers
eamodio.gitlens                    Git lens
streetsidesoftware.code-spell-checker  Spell check
```

##### 7.3 Open the project in WSL2

```bash
# From WSL2 terminal, inside your project folder:
code .
# VS Code opens with the WSL2 remote — file system is Linux, tools are Linux
```

---

#### Step 8 — Kotlin IDE

For Kotlin/AAR work:

- **Android Studio** (free, specialized) — download from `developer.android.com/studio`
- **IntelliJ IDEA** (free Community edition) — download from `jetbrains.com/idea`

Set the project JDK to Temurin 17.

---

#### Step 9 — Git (local config)

```powershell
# Windows
winget install Git.Git
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

```bash
# WSL2
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
git config --global init.defaultBranch main
```

---

#### Step 10 — Local Environment Variables

Create `~/.capsule-dev.env` (never commit):

```bash
# ~/.capsule-dev.env
export CAPSULE_KEYSTORE_PATH=/path/to/debug.jks
export CAPSULE_KEYSTORE_PASS=debug
export CAPSULE_KEY_ALIAS=debug
export CAPSULE_KEY_PASS=debug
```

Add to `~/.bashrc`:

```bash
[ -f ~/.capsule-dev.env ] && source ~/.capsule-dev.env
```

---

#### Step 11 — Verify Local Setup

```bash
# From WSL2
node --version          # v22.x.x
pnpm --version          # 9.x.x
turbo --version         # 2.x.x
java -version           # openjdk 17 Temurin
sdkmanager --version    # 12.0 or later
adb version             # connects to host ADB
docker --version        # 27.x.x
docker compose version  # 2.x.x
```

```powershell
# From Windows PowerShell
adb devices             # emulator-5554   device  (if emulator running)
docker --version        # Docker version 27.x.x
```

##### Local Checklist

```
[ ] WSL2 Ubuntu 22.04 installed and updated
[ ] Node 22 in WSL2 (nvm install 22)
[ ] pnpm 9 + Turbo 2 in WSL2
[ ] JDK 17 Temurin in WSL2 (java -version)
[ ] Android SDK API 35 + Build Tools 35.0.0 in WSL2
[ ] ANDROID_HOME set in WSL2 ~/.bashrc
[ ] Android Emulator (Pixel 8 API 35) running on Windows host
[ ] adb devices shows the emulator from Windows and WSL2
[ ] Docker Desktop 4.30+ installed, WSL2 integration enabled
[ ] VS Code with WSL2 + Dev Containers extensions
[ ] Git configured (name + email) on Windows + WSL2
[ ] All verify commands in Step 11 pass
```

> Once this checklist is complete — **build the local MVP** before continuing to Phase 8 (Go Online / Ecosystem).

---

### Phase 8 — Go Online (Ecosystem)

> Do this after the local MVP is running end-to-end.

#### Step 12 — GitHub CLI + Authentication

```powershell
# Windows
winget install GitHub.cli
gh auth login
# Choose: GitHub.com → HTTPS → Authenticate with browser
```

```bash
# WSL2
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt-get update && sudo apt-get install -y gh

gh auth login
```

---

#### Step 13 — GitHub Organization + Repositories

```bash
# Create the capsule-framework organization
# GitHub web UI: github.com → + → New organization → Free plan
# Organization name: capsule-framework

# Create the monorepo
gh repo create capsule-framework/capsule \
  --public \
  --description "Capsule — app ships inside a managed native capsule" \
  --clone

# iOS shell repo (separate — linked as git submodule or Swift Package URL)
gh repo create capsule-framework/capsule-ios \
  --public \
  --description "Capsule iOS shell — XCFramework"
```

---

#### Step 14 — GHCR + Docker buildx

GHCR is included with your GitHub account — no extra setup.

```bash
# Authenticate Docker with GHCR
gh auth token | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# Create a buildx builder for multi-arch (linux/amd64 + linux/arm64)
docker buildx create --name capsule-builder --use --bootstrap
docker buildx ls
```

---

#### Step 15 — Secrets & Tokens

Add to `~/.capsule-dev.env`:

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx      # GitHub PAT with packages:write
```

For CI, these go into GitHub repository/organization secrets:

- `GITHUB_TOKEN` — auto-provided by Actions
- `CAPSULE_KEYSTORE_PASS`, `CAPSULE_KEY_ALIAS`, `CAPSULE_KEY_PASS`
- `PLAY_STORE_JSON_KEY_DATA` (when ready for store publishing)

---

#### Online Checklist

```
[ ] GitHub CLI authenticated on Windows + WSL2
[ ] GitHub org capsule-framework created
[ ] Repo capsule-framework/capsule created and cloned
[ ] GHCR: docker login ghcr.io works
[ ] Docker buildx multi-arch builder created
[ ] GitHub Actions CI workflow passing
```

---

#### What's Next

Once the local checklist is complete, proceed to [roadmap.md](../project/roadmap.md) to start building Phase 1.

---

## Part 3 — Framework Contributors

> **This section is for contributors building Capsule itself** — the CLI, the Kotlin AAR, the Swift XCFramework, the CodeSync backend. Skip if you are building an app with Capsule.

Two setup paths available:

```
Path A — Full Local Install          Path B — Docker-First (Dev Container)
────────────────────────────────     ────────────────────────────────────────
Install Node, JDK, Android SDK,      Install only Docker Desktop + ADB.
pnpm, etc. directly on your host.    Everything else runs inside a container.

Pros: fastest iteration, direct      Pros: zero host environment setup,
  IDE integration, no overhead         identical to CI, onboard in minutes
Cons: version juggling, "works on    Cons: first build slower, emulator
  my machine" risk                     still needs host ADB bridge
```

**TL;DR**: Use Path B if you want the cleanest setup with the fewest host installs. Use Path A if you need direct Android Studio access or work heavily on the Kotlin/Swift shells.

---

### 5.0 Bootstrap — Starting from Zero (before the GitHub repo exists)

> **This is where you actually start.** Section 5.2 assumes a published GitHub repo to clone. If you are bootstrapping the monorepo from scratch (Phase 1), follow this instead.

**Prerequisites first** — complete section 1.1 (Node.js 22 + pnpm) and section 1.3 (JDK 17 + Android SDK) before continuing.

**Create the monorepo:**

```bash
mkdir capsule && cd capsule

# Workspace root
pnpm init

# Dev toolchain
pnpm add -D -w turbo@2 typescript @types/node eslint prettier
pnpm add -D -w @changesets/cli
pnpm changeset init

# Package directories
mkdir -p packages/cli/src
mkdir -p packages/core/src
mkdir -p packages/capsule-android
mkdir -p examples   # demo apps — their own pnpm workspace (examples/pnpm-workspace.yaml)
```

**Create `pnpm-workspace.yaml`:**

```yaml
packages:
  - 'packages/*'
# examples/ is its own pnpm workspace (examples/pnpm-workspace.yaml) — not listed here
```

**Create `turbo.json`:**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "test":  { "dependsOn": ["build"] },
    "lint":  {}
  }
}
```

**Create `tsconfig.base.json`:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

**Use the local CLI during development** (not the global npm install):

```bash
# Build the CLI package first
cd packages/cli && pnpm build && cd ../..

# Run it directly — no global install needed
node packages/cli/dist/index.js --version

# Or add a root-level convenience script in package.json:
# "scripts": { "capsule": "node packages/cli/dist/index.js" }
# Then: pnpm capsule --version
```

**For test-app development**, use `CAPSULE_SHELL_OVERRIDE_PATH` to bypass the shell registry (which doesn't exist yet in Phase 1):

```bash
export CAPSULE_SHELL_OVERRIDE_PATH=/path/to/capsule-debug.aar
node ../../packages/cli/dist/index.js build android
```

Once the monorepo is running locally, continue with Phase 1 in `cli.md`. Section 5.2 below applies once you have a GitHub remote.

---

### 5.1 Additional tools for contributors (Path A)

App developer prerequisites from Parts 1–4 above are a baseline. Add:

**Turbo 2** (monorepo task pipeline)

```bash
npm install -g turbo@2
turbo --version   # 2.x.x
```

**Docker Desktop 4.30+** (CodeSync local stack + CI parity)

```bash
docker compose version    # Docker Compose version v2.x.x
```

**iOS (macOS only)**

```bash
sudo gem install cocoapods fastlane
pod --version        # 1.15.x
fastlane --version   # 2.x.x
```

**Android Studio** (only needed for heavy Kotlin/AAR work — optional)

Download: `developer.android.com/studio` (Ladybug 2024.2 or later).
Set SDK path to `~/android-sdk` and JDK to Eclipse Temurin 17.

**Pinned toolchain versions:**

| Component | Version | Reason |
|-----------|---------|--------|
| Node.js | 22 LTS | Matches Docker images |
| JDK | 17 (Temurin) | AGP 8.x requirement |
| Android SDK Platform | android-35 | targetSdk in capsule.config.ts |
| Build Tools | 35.0.0 | Must match platform |
| Gradle | 8.10 | Pinned via gradlew |
| AGP | 8.7.x | Aligns with Gradle 8.10 |

---

### 5.2 Repository setup

```bash
git clone https://github.com/capsule-framework/capsule
cd capsule
pnpm install
pnpm build         # Turbo resolves build order automatically
cp .env.example .env.local   # per-machine paths (JAVA_HOME, ANDROID_HOME, …) — git-ignored
pnpm dev:env                 # check what the contributor scripts will use
```

**Contributor scripts** (`scripts/`, Node only — the same on Windows, macOS and Linux; they read
`.env.local`, documented key by key in `.env.example`):

| Script | What it does |
|---|---|
| `pnpm dev:env` | Show the effective JDK / SDK / AAR paths; `--sh` / `--ps` emit them for your shell |
| `pnpm with-env [--cwd dir] <cmd>` | Run one command with that env (`gradlew`, `adb`, `emulator`, `avdmanager` resolved per OS) |
| `pnpm dev:emulator start\|stop\|status` | Contributor AVD, waits for a full boot (`--fresh`, `--no-wait`, `--headless`, `--gpu`, `--avd`) |
| `pnpm dev:examples install\|build\|test\|all` | Batch over the example apps in `examples/` (`--release`, `--filter`) |
| `pnpm update:quickjs [ref]` / `pnpm update:civetweb [tag]` | Re-vendor the native sources |
| `pnpm docs:check` / `pnpm docs:lint` | Docs gates (nav + map links / deep consistency) |

Full command reference: [commands.md](commands.md).

**Monorepo structure:**

```
capsule/
  packages/
    cli/                    ← @capsule/cli
    core/                   ← @capsule/core (JS bridge runtime)
    capsule-android/        ← Kotlin AAR (Android shell)
    capsule-ios/            ← Swift XCFramework (iOS shell)
    codesync-api/           ← Node.js/Fastify backend
    codesync-dashboard/     ← React dashboard
  examples/               ← demo apps (own nested pnpm workspace; apps link packages/core)
    react-ts/  vue-from-template/  …
  docker/
  pnpm-workspace.yaml
  turbo.json
```

**Build order** (Turbo handles this via `turbo.json`):

```
1. @capsule/core       — JS bridge runtime
2. @capsule/cli        — imports core for types
3. codesync-api        — standalone Node.js service
4. codesync-dashboard  — standalone React app
```

---

### 5.3 Verify the Android build chain

```bash
cd examples && pnpm install && cd react-ts   # after the root pnpm install && pnpm build

node ../../packages/cli/dist/index.js sync
node ../../packages/cli/dist/index.js build android
# → .capsule/android/app-debug.apk

adb install .capsule/android/app-debug.apk
```

---

### 5.4 Run the CodeSync local stack

```bash
docker compose up codesync-api postgres redis minio

# First time only — run migrations
docker compose exec codesync-api npm run migrate

curl http://localhost:3000/health    # {"status":"ok"}
# MinIO console → http://localhost:9001  (minioadmin / minioadmin)
# Dashboard    → http://localhost:8080
```

---

### 5.5 Test suite

```bash
pnpm test                                  # all packages
pnpm test --filter=@capsule/core -- --coverage
pnpm typecheck
pnpm lint

# Android (Kotlin) — with-env applies JAVA_HOME and picks gradlew / gradlew.bat
pnpm with-env --cwd packages/capsule-android gradlew testDebugUnitTest          # JVM unit tests (fast)
pnpm with-env --cwd packages/capsule-android gradlew connectedDebugAndroidTest  # instrumented (running emulator: pnpm dev:emulator start)
```

---

### 5.6 Path B — Docker-First (VS Code Dev Container)

What stays on the host:

| Tool | Host install needed | Why |
|------|---------------------|-----|
| Docker Desktop 4.30+ | ✅ Yes | Container runtime |
| VS Code + Dev Containers extension | ✅ Yes | Your IDE |
| ADB (platform-tools) | ✅ Yes | Bridge to host emulator |
| Android Emulator | ✅ Mac/Win | Cannot run inside Docker on Mac/Win |
| Node.js, pnpm, JDK, SDK, Gradle | ❌ No | Runs in container |
| Xcode / iOS tools | ✅ macOS | Apple constraint |

**Linux exception**: With KVM passthrough, even the emulator runs inside the container — 100% containerized.

**Install host ADB only:**

```bash
# macOS
brew install android-platform-tools

# Linux
sudo apt-get install -y adb

# Windows — download platform-tools-latest-windows.zip from developer.android.com
```

**`.devcontainer/devcontainer.json`:**

```json
{
  "name": "Capsule Framework",
  "dockerComposeFile": ["../docker-compose.yml"],
  "service": "dev",
  "workspaceFolder": "/workspace",
  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "ms-vscode.vscode-typescript-next",
        "fwcd.kotlin",
        "ms-azuretools.vscode-docker",
        "eamodio.gitlens"
      ],
      "settings": {
        "editor.formatOnSave": true,
        "editor.defaultFormatter": "esbenp.prettier-vscode",
        "typescript.tsdk": "node_modules/typescript/lib",
        "typescript.enablePromptUseWorkspaceTsdk": true
      }
    }
  },
  "forwardPorts": [5173, 3000, 8080, 9000, 9001],
  "portsAttributes": {
    "5173": { "label": "Vite dev server" },
    "3000": { "label": "CodeSync API" },
    "8080": { "label": "CodeSync Dashboard" }
  },
  "postCreateCommand": "pnpm install",
  "remoteEnv": { "ANDROID_HOME": "/opt/android-sdk" }
}
```

**ADB bridge — container to host emulator:**

```yaml
# docker-compose.yml — dev service additions
services:
  dev:
    extra_hosts:
      - "host.docker.internal:host-gateway"   # Linux needs explicit; Mac/Win get it automatically
    environment:
      - ANDROID_ADB_SERVER_ADDRESS=host.docker.internal
      - ANDROID_ADB_SERVER_PORT=5037
```

```bash
# Inside container terminal:
adb connect host.docker.internal:5555
adb devices     # emulator-5555   device

capsule dev     # Vite runs on container:5173, forwarded to host:5173
                # CLI runs adb reverse tcp:5173 tcp:5173 automatically
```

**Linux — emulator inside container (KVM):**

```yaml
services:
  dev:
    devices:
      - /dev/kvm:/dev/kvm
```

```bash
emulator -avd Pixel_8_API35 -no-window -no-audio &
adb wait-for-device && adb devices
```

**Opening the Dev Container:**

```bash
git clone https://github.com/capsule-framework/capsule
code capsule
# VS Code prompts: "Reopen in Container" → click it
# (or: Ctrl+Shift+P → Dev Containers: Reopen in Container)
# First time: ~5–10 min to pull/build (cached after)
```

---

### 5.7 Path A vs Path B

| Scenario | Recommended |
|----------|-------------|
| New contributor, first setup | **Path B** — fastest to working state |
| Heavy Kotlin/AAR work (Android Studio) | **Path A** — better IDE integration |
| Windows developer | **Path B** — avoids Windows toolchain pain |
| macOS, iOS shell development | Either — Xcode is always on host |
| Linux developer | **Path B** — emulator in container with KVM |
| CI environment | Path B model — exactly what CI uses |

---

### 5.8 `buildNumber` auto-commit in CI

`capsule publish android|ios` auto-increments `version.buildNumber` in `capsule.config.ts` after a successful upload and commits the bump. In CI, push it back:

```yaml
# .github/workflows/release.yml
- run: capsule publish android --track internal
  env:
    PLAY_STORE_JSON_KEY_DATA: ${{ secrets.PLAY_STORE_JSON_KEY_DATA }}

- run: |
    git config user.name  "capsule-bot"
    git config user.email "bot@capsule.dev"
    git push origin HEAD:${{ github.ref_name }}
```

The commit message includes `[skip ci]` to prevent a loop.

---

## Toolchain Version Reference

| Tool | Version | App dev | Contributor A | Contributor B |
|------|---------|---------|---------------|---------------|
| Node.js | 22 LTS | ✅ host | ✅ host | ❌ container |
| pnpm | 9.x | ✅ host | ✅ host | ❌ container |
| Turbo | 2.x | ❌ | ✅ host | ❌ container |
| JDK | 17 (Temurin) | ✅ host | ✅ host | ❌ container |
| Android SDK | API 35 | ✅ host | ✅ host | ❌ container |
| Build Tools | 35.0.0 | ✅ host | ✅ host | ❌ container |
| Gradle | 8.10 | auto (gradlew) | auto | auto |
| Docker Desktop | 4.30+ | ❌ optional | ✅ host | ✅ required |
| ADB | latest | ✅ host | ✅ host | ✅ host |
| Android Emulator | API 35 | ✅ host | ✅ host | ✅ host (Mac/Win) |
| VS Code Dev Containers | latest | ❌ | ❌ optional | ✅ host |
| Xcode | 15+ | ✅ macOS (iOS) | ✅ macOS (iOS) | ✅ macOS (iOS) |
| CocoaPods | 1.15.x | ❌ | iOS packaging | iOS packaging |
| Fastlane | 2.x | store publishing | store publishing | store publishing |

---

## Getting Started Checklist

### App developer

```
[ ] Node.js 22 installed (nvm)
[ ] @capsule/cli installed globally: npm install -g @capsule/cli
[ ] JDK 17 installed, JAVA_HOME set
[ ] ANDROID_HOME set, Android SDK API 35 + Build Tools 35.0.0
[ ] Emulator created and boots (or physical device connected via USB)
[ ] capsule init my-app succeeds
[ ] capsule add android succeeds
[ ] capsule dev — app loads in emulator, hot reload works (<50ms)
[ ] capsule build android — APK builds successfully
[ ] (iOS, macOS only) Xcode 15+ installed, capsule add ios succeeds
```

### Framework contributor — Path A

```
[ ] Node.js 22, pnpm 9, Turbo 2 installed
[ ] JDK 17 installed, JAVA_HOME set
[ ] ANDROID_HOME set, Android SDK API 35 + Build Tools 35.0.0
[ ] Emulator created and boots
[ ] Docker Desktop installed, docker compose version shows V2
[ ] git clone capsule repo
[ ] pnpm install succeeds
[ ] pnpm build succeeds (Turbo pipeline)
[ ] capsule build android succeeds (from examples/react-ts)
[ ] capsule run android deploys to emulator
[ ] docker compose up — CodeSync stack boots
```

### Framework contributor — Path B

```
[ ] Docker Desktop 4.30+ installed and running
[ ] VS Code + Dev Containers extension installed
[ ] ADB installed on host (platform-tools)
[ ] Emulator created and boots on host (Mac/Win) — or KVM verified (Linux)
[ ] git clone capsule repo
[ ] VS Code: "Reopen in Container" succeeds
[ ] Container: pnpm install succeeds (auto-run by postCreateCommand)
[ ] Container: pnpm build succeeds
[ ] Host emulator running → container: adb connect host.docker.internal:5555 succeeds
[ ] Container: capsule build android succeeds
[ ] Container: capsule dev — hot reload works in emulator
```

### iOS (macOS only — all paths)

```
[ ] Xcode 15+ installed, xcodebuild -version works
[ ] iOS Simulator available: xcrun simctl list devices
[ ] Fastlane installed: gem install fastlane
```
