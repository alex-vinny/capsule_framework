---
title: "Docker strategy"
audience: contributor
status: draft
---
# Capsule Framework — Docker Strategy

> Docker as the backbone for framework development, app building, and CI/CD. No local SDK installs required.

---

## Goals

1. **Develop the framework itself** inside Docker — consistent environment across contributors
2. **Build Android APKs/AABs** inside Docker — no Android Studio or SDK on developer machines
3. **Build iOS IPAs** — addressed honestly (Docker cannot, macOS required — see iOS section)
4. **Publish Docker images** so app developers using Capsule can build without any native toolchain

---

## Image Family

```
ghcr.io/capsule/
  ├── dev                  # framework development (Node + Android SDK + all tools)
  ├── build-android        # production Android builds (leaner, no dev tools)
  ├── build-web            # web-only builds and tests (Node only, smallest)
  ├── codesync-api         # CodeSync Fastify backend (Node + Postgres + Redis client)
  └── codesync-dashboard   # CodeSync React dashboard (nginx static, multi-stage build)
```

---

## Image 1 — `capsule/dev`

Used by Capsule framework contributors. Everything needed to develop and test the framework.

### Dockerfile

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base

# ── System dependencies ──────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    unzip \
    zip \
    openjdk-17-jdk-headless \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ── Android SDK ──────────────────────────────────────────────────────────────
ENV ANDROID_HOME=/opt/android-sdk
ENV PATH="${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${PATH}"

RUN mkdir -p ${ANDROID_HOME}/cmdline-tools && \
    wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip \
         -O /tmp/cmdline-tools.zip && \
    unzip -q /tmp/cmdline-tools.zip -d /tmp/cmdline-tools && \
    mv /tmp/cmdline-tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest && \
    rm /tmp/cmdline-tools.zip

# Accept licenses non-interactively
RUN yes | sdkmanager --licenses > /dev/null 2>&1

# Install SDK components (pin exact versions for reproducibility)
RUN sdkmanager \
    "platform-tools" \
    "platforms;android-35" \
    "build-tools;35.0.0" \
    "extras;android;m2repository" \
    "extras;google;m2repository"

# ── Gradle distribution ──────────────────────────────────────────────────────
# Pre-download the Gradle distribution so first capsule build doesn't fetch it.
# Each app project brings its own gradlew wrapper — we don't install Gradle globally.
# The distribution is pre-cached at GRADLE_USER_HOME so gradlew finds it immediately.
ENV GRADLE_USER_HOME=/root/.gradle
RUN mkdir -p ${GRADLE_USER_HOME}/wrapper/dists/gradle-8.10-bin && \
    wget -q https://services.gradle.org/distributions/gradle-8.10-bin.zip \
         -O ${GRADLE_USER_HOME}/wrapper/dists/gradle-8.10-bin/gradle-8.10-bin.zip

# NOTE: We do NOT attempt to pre-warm the Android Gradle Plugin (AGP) here.
# AGP warmup requires a valid Android project with settings.gradle — a stub project
# silently fails (|| true) and wastes image build time. AGP deps are instead cached
# via the named `gradle-cache` Docker volume, which persists across runs.

# ── Node.js tooling ──────────────────────────────────────────────────────────
RUN npm install -g pnpm@9 turbo@2

# ── Working directory ────────────────────────────────────────────────────────
WORKDIR /workspace

CMD ["bash"]
```

---

## Image 2 — `capsule/build-android`

Leaner image for CI and app developers. No dev tools, just what's needed to run `capsule build android`.

```dockerfile
# syntax=docker/dockerfile:1
FROM eclipse-temurin:17-jdk-jammy AS base

# Android build requires JDK (not JRE) — Gradle's annotation processors and
# some AGP tasks invoke javac directly. JRE is insufficient.
# Minimal Android SDK — only what Gradle needs to build
ENV ANDROID_HOME=/opt/android-sdk
ENV PATH="${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${PATH}"

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget unzip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Node (slim install via NodeSource)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Android cmdline-tools + SDK components (same as dev image)
RUN mkdir -p ${ANDROID_HOME}/cmdline-tools && \
    wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip \
         -O /tmp/cmdline-tools.zip && \
    unzip -q /tmp/cmdline-tools.zip -d /tmp/cmdline-tools && \
    mv /tmp/cmdline-tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest && \
    rm /tmp/cmdline-tools.zip && \
    yes | sdkmanager --licenses > /dev/null 2>&1 && \
    sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"

# Pre-cache Gradle distribution (same version as dev image — must stay in sync)
ENV GRADLE_USER_HOME=/root/.gradle
RUN mkdir -p ${GRADLE_USER_HOME}/wrapper/dists/gradle-8.10-bin && \
    wget -q https://services.gradle.org/distributions/gradle-8.10-bin.zip \
         -O ${GRADLE_USER_HOME}/wrapper/dists/gradle-8.10-bin/gradle-8.10-bin.zip

# Capsule CLI (installed globally so it's available as a command)
RUN npm install -g @capsule/cli

WORKDIR /app

ENTRYPOINT ["capsule"]
CMD ["build", "android"]
```

**Usage by app developer** (zero local setup):

```bash
docker run --rm \
  -v $(pwd):/app \
  -v capsule-gradle-cache:/root/.gradle \
  -e CAPSULE_KEYSTORE_PASS=$CAPSULE_KEYSTORE_PASS \
  ghcr.io/capsule/build-android:latest \
  build android --release

# Output: /app/.capsule/android/app-release.apk
```

The named volume `capsule-gradle-cache` persists the Gradle cache across runs — subsequent builds are as fast as local.

---

## Image 3 — `capsule/build-web`

Smallest image. For web-only builds and tests.

```dockerfile
FROM node:22-alpine
RUN npm install -g pnpm@9 @capsule/cli
WORKDIR /app
CMD ["sh", "-c", "vite build"]
```

---

## Image 4 — `capsule/codesync-api`

The CodeSync backend service. Runs the Fastify API, connects to Postgres + Redis + S3.

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS base

WORKDIR /app

# ── Dependencies ─────────────────────────────────────────────────────────────
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm@9 && pnpm install --frozen-lockfile --prod

# ── Application source ────────────────────────────────────────────────────────
COPY dist/ ./dist/
COPY migrations/ ./migrations/

# ── Runtime config ────────────────────────────────────────────────────────────
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run migrations then start the server
# Migrations are idempotent — safe to run on every container start
CMD ["node", "dist/index.js"]
```

**Build context**: `packages/codesync-api/`

The image is kept minimal — no build tools, no devDependencies. The `dist/` is compiled in CI and copied in. This is the standard Node.js production image pattern.

---

## Image 5 — `capsule/codesync-dashboard`

The React dashboard served via nginx. A static site — no Node.js at runtime.

```dockerfile
# syntax=docker/dockerfile:1

# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm@9 && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build   # outputs to /app/dist

# ── Serve stage ───────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS final

# Custom nginx config: SPA routing (all paths → index.html) + gzip
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**`docker/nginx.conf`** (SPA routing + compression):

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 1024;

    # SPA: serve index.html for all routes; browser handles routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache hashed assets aggressively (Vite names them with content hash)
    location ~* \.(js|css|png|jpg|jpeg|gif|svg|woff2?)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**Build context**: `packages/codesync-dashboard/`

---

## Framework Development with Docker Compose

For contributors working on the Capsule framework itself.

```yaml
# docker-compose.yml (framework repo root)
services:

  # Main dev environment — framework source mounted in
  dev:
    build:
      context: .
      dockerfile: docker/dev.Dockerfile
    volumes:
      - .:/workspace                          # framework source
      - node_modules:/workspace/node_modules  # isolated node_modules
      - gradle-cache:/root/.gradle            # Gradle cache persisted
      - android-sdk:/opt/android-sdk          # SDK persisted (don't re-download)
    ports:
      - "5173:5173"   # Vite dev server (for testing web layer)
    environment:
      - ANDROID_HOME=/opt/android-sdk
    stdin_open: true
    tty: true

  # Run the CLI under test against a sample app
  test-app:
    build:
      context: .
      dockerfile: docker/dev.Dockerfile
    volumes:
      - ./examples/react-ts:/app              # sample app
      - .:/capsule-framework                  # framework source (symlinked via pnpm workspace)
      - gradle-cache:/root/.gradle
    working_dir: /app
    command: capsule dev
    ports:
      - "5174:5173"

  # CodeSync stack (for testing the full update pipeline locally)
  codesync-api:
    build:
      context: packages/codesync-api
      dockerfile: Dockerfile
    environment:
      DATABASE_URL: postgres://capsule:capsule@postgres:5432/capsule
      REDIS_URL: redis://redis:6379
      STORAGE_ENDPOINT: http://minio:9000
      STORAGE_BUCKET: capsule-bundles
      STORAGE_ACCESS_KEY: minioadmin
      STORAGE_SECRET_KEY: minioadmin
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started

  codesync-dashboard:
    build:
      context: packages/codesync-dashboard
      dockerfile: Dockerfile
    ports:
      - "8080:80"   # dashboard at http://localhost:8080
    depends_on:
      - codesync-api

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: capsule
      POSTGRES_PASSWORD: capsule
      POSTGRES_DB: capsule
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./packages/codesync-api/migrations:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U capsule"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

  minio:
    image: minio/minio:RELEASE.2024-11-07T00-52-20Z   # pin — never use latest for data stores
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio-data:/data
    ports:
      - "9000:9000"
      - "9001:9001"   # MinIO web console

volumes:
  node_modules:
  gradle-cache:
  android-sdk:
  postgres-data:
  redis-data:
  minio-data:
```

**Developer workflow:**

```bash
# First time
docker compose build dev
docker compose run --rm dev pnpm install

# Daily work — open a shell in the dev container
docker compose run --rm dev bash

# Inside container:
pnpm build           # build all framework packages
pnpm test            # run tests
capsule build android  # test a build against sample app

# Start full stack (CodeSync + DB + storage)
docker compose up codesync-api postgres redis minio
```

---

## iOS — Honest Assessment

Docker **cannot** build iOS IPAs. This is a hard platform constraint, not a tooling gap.

| Constraint | Detail |
|-----------|--------|
| Xcode runs only on macOS | Apple does not license macOS to run in containers or VMs on non-Apple hardware |
| `xcrun`, `xcodebuild`, `simctl` | macOS-only binaries, no Linux port |
| Code signing | Requires access to the macOS Keychain or a hardware Secure Enclave |

### What's possible

| Approach | Works? | Notes |
|---------|--------|-------|
| Docker on Linux for iOS | No | Xcode cannot run on Linux |
| Docker on macOS (Docker Desktop) | Partial | Container runs Linux; host macOS still needed for actual Xcode commands |
| macOS GitHub Actions runner | **Yes** | `runs-on: macos-15` — standard, free minutes for public repos |
| Xcode Cloud | **Yes** | Apple's own CI — tightly integrated, good for App Store delivery |
| Self-hosted macOS runner (Mac mini / Mac Studio) | **Yes** | Full control, fast, can be Dockerless |
| Fastlane on macOS runner | **Yes** | Automates signing, building, uploading — same result as manual |

### Recommended CI split

```yaml
# .github/workflows/release.yml

jobs:
  build-android:
    runs-on: ubuntu-latest         # Docker image, fully controlled
    container:
      image: ghcr.io/capsule/build-android:latest
    steps:
      - uses: actions/checkout@v4
      - run: capsule build android --release
      - uses: actions/upload-artifact@v4
        with:
          name: android-release
          path: .capsule/android/app-release.apk

  build-ios:
    runs-on: macos-15              # Apple's constraint — must be macOS
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install -g @capsule/cli
      - run: capsule build ios --release
        env:
          MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
          APP_STORE_CONNECT_KEY: ${{ secrets.ASC_KEY }}
```

The Android job is fully reproducible via the Docker image. The iOS job is macOS-native but equally automated via Fastlane (see [../project/known-issues.md](../project/known-issues.md) Issue 4).

---

## Image Versioning & Publishing

Images are tagged to match the Capsule CLI version:

```
ghcr.io/capsule/build-android:1.4.0   # pinned
ghcr.io/capsule/build-android:1.4     # minor-pinned
ghcr.io/capsule/build-android:latest  # rolling
```

The Android SDK version baked into each image is documented in the image label:

```dockerfile
LABEL org.capsule.android-sdk-version="35"
LABEL org.capsule.build-tools-version="35.0.0"
LABEL org.capsule.gradle-version="8.10"
LABEL org.capsule.node-version="22"
```

Published automatically on every Capsule CLI release via GitHub Actions:

```yaml
- name: Build and push Docker images
  uses: docker/build-push-action@v6
  with:
    context: .
    file: docker/build-android.Dockerfile
    push: true
    tags: |
      ghcr.io/capsule/build-android:${{ env.VERSION }}
      ghcr.io/capsule/build-android:latest
    cache-from: type=gha
    cache-to: type=gha,mode=max    # GitHub Actions layer cache
```

---

## Summary

| Need | Solution | iOS? |
|------|----------|------|
| Framework development | `capsule/dev` + docker compose | Partial (native compile needs macOS) |
| App developer builds Android | `capsule/build-android` image | N/A |
| App developer builds iOS | macOS runner (GitHub Actions / Mac mini) | Yes, but not Docker |
| CI/CD Android | Docker image in any Linux CI | Full |
| CI/CD iOS | `macos-15` GitHub Actions runner + Fastlane | Full (macOS only) |
| Full local stack (CodeSync) | `docker compose up` | Yes |
