---
title: "Decision log"
audience: contributor
status: record
---
# Capsule Framework — Decisions

> This document consolidates all design decisions for the Capsule Framework: API design decisions (Q-series, from spec review) and implementation decisions (D-series, ordered by urgency before each phase).

---

# Part 1 — API & Design Decisions

> Gaps, uncertainties, and unresolved design questions to be answered before or during implementation. Add answers inline as they are decided.

---

## Q1 — SDK Update: What If the Capsule Team Falls Behind?

**Context:** The "shell as binary dep" model means developers can't bump `targetSdk` themselves — they wait for a new shell release from the Capsule team.

**Risk:** Google mandates a new `targetSdk` by a hard deadline (e.g., August each year for Play Store). If the Capsule team hasn't shipped a compatible shell by then, apps can't be updated on the Play Store.

**Questions:**
- What is the Capsule team's SLA for releasing a new shell when Google/Apple change requirements?
- Is there a documented emergency path for developers to manually override `targetSdk` without waiting for a shell release?
- Should `capsule.config.ts` expose a `android.gradleOverrides: {}` escape hatch for exactly this scenario?

**Answer:** **Decided — closed.**

Four-layer approach:

**Layer 1 — Proactive tracking (prevents the crisis).** Capsule team follows Google Developer Preview 1 (January) and Apple WWDC (June) from day one. Work starts on beta SDKs immediately, not after GA release. Since the shell is open source (Q15), community contributors can also submit SDK-update PRs.

**Layer 2 — SLA commitment.** Capsule team ships a compatible shell within **6 weeks of the first stable SDK release**. Google's stable API 36 → Capsule ships compatible shell → developers have 3–4 months before the Play Store deadline. This SLA is published in the docs and tracked via a public GitHub milestone.

**Layer 3 — `capsule doctor` deadline awareness.** CLI warns proactively:
```
⚠ Upcoming deadline: Google requires targetSdk 36 by Aug 31, 2026.
  Your shell targets 35. Watch for capsule update --shell in the next weeks.
  Status: https://github.com/capsule-framework/capsule/milestones/sdk-36
```

**Layer 4 — `android.gradleOverrides` escape hatch (break-glass only).** If the Capsule team misses the deadline, developers are not stuck:
```typescript
android: {
  gradleOverrides: {
    targetSdk: 36,          // emergency override — bypasses managed shell
    compileSdk: 36,
  }
}
```
CLI warns loudly: "gradleOverrides bypasses the managed shell. Some capsule features may break. Remove this after running `capsule update`." The override is injected into the generated `build.gradle` and is not guaranteed stable across shell versions — it is intentionally a last resort, not a feature.

---

## Q2 — Plugin Gradle Dependencies

**Context:** `capsule-plugin.json` currently only declares `permissions`, `minSdk`, and `infoPlist` keys. It has no way to declare arbitrary Maven dependencies a plugin needs (e.g., `com.google.zxing:core:3.5.0`).

**Questions:**
- How does a source plugin declare its own Gradle dependencies?
- Should `capsule-plugin.json` gain a `dependencies.android[]` array of Maven coordinates?
- How are version conflicts between plugin dependencies resolved (Gradle's resolution strategy)?

**Example of what's missing:**
```json
{
  "name": "barcode",
  "android": {
    "dependencies": [
      "com.google.zxing:core:3.5.0",
      "androidx.camera:camera-core:1.3.0"
    ]
  }
}
```

**Answer:** **Decided — closed.**

`capsule-plugin.json` gains `android.dependencies[]` and `ios.podDependencies[]`. Plugin author declares Maven coordinates — no Gradle syntax required:

```json
{
  "android": {
    "dependencies": ["com.google.zxing:core:3.5.0", "androidx.camera:camera-core:1.3.0"]
  },
  "ios": {
    "podDependencies": [{ "name": "ZXingObjC", "version": "~> 3.6" }]
  }
}
```

At `capsule sync`, the CLI:
1. Collects all dependencies from installed plugins **and** core overrides (`capsule override`)
2. Groups by `groupId:artifactId`, applies "highest compatible version wins" (mirrors Gradle default)
3. Hard-errors only when versions are in different majors — names exactly which plugins conflict
4. Injects the resolved set into the generated `build.gradle`

Conflict detection runs **before Gradle** — actionable CLI error, not a cryptic build failure:
```
✗ Dependency conflict: com.squareup.okhttp3:okhttp
  @capsule-community/stripe requires 4.9.0
  @capsule-community/maps requires 4.11.0
  Resolved to 4.11.0 (highest compatible — patch-level only, safe).
```

**Rejected alternatives:**
- **`build.gradle.fragment` file per plugin** — Plugin author writes raw Gradle syntax. Breaks the no-Gradle-knowledge rule; fragile across AGP versions.
- **Semantic version aliases ("needs-camerax")** — CLI maintains an alias-to-version mapping. Too rigid for community plugins, high Capsule team maintenance burden.
- **Delegate to `android.gradleOverrides`** — Developer resolves conflicts manually. Last resort, not a first-class solution.

---

## Q3 — ProGuard / R8 Rules for Source Plugins

**Context:** `../guide/plugins.md` mentions ProGuard as a gotcha for plugins that use reflection, but doesn't specify how a developer adds `-keep` rules to the generated `proguard-rules.pro`.

**Questions:**
- Can a source plugin ship a `proguard.rules` file that gets merged by the CLI into the generated project?
- For binary plugins (AAR), do they bundle their own consumer ProGuard rules (standard AAR feature)?
- Is R8 enabled by default in Capsule release builds?

**Answer:** **Decided — closed.**

**AAR plugins (binary integrations):** Standard AAR format embeds consumer ProGuard rules. AGP applies them automatically when the AAR is consumed. No CLI action needed.

**Source plugins and core overrides:** Three-layer approach:

**Layer 1 — Safe default (zero config):** CLI adds a blanket `-keep class <plugin.package>.** { *; }` for every source plugin and override package. R8 still optimizes the rest of the app; plugin/override classes are preserved.

**Layer 2 — Explicit rules (opt-in optimization):** Plugin ships a `proguard.rules` file at the plugin root. CLI merges it verbatim into the generated `proguard-rules.pro`, overriding the blanket keep. Plugin authors who understand R8 use this to enable full optimization.

**Layer 3 — `@CapsuleKeep` annotations (Phase 2):** Annotation on Kotlin classes generates ProGuard rules at `capsule sync` time — plugin author never writes ProGuard syntax. Aligns with the existing bridge annotation pattern for TypeScript type generation.

**R8:** Enabled by default on release builds. Blanket keep ensures correctness; explicit `proguard.rules` unlocks maximum optimization for authors who want it.

**Rejected alternatives:**
- **Disable R8 entirely for plugin/override packages** — Penalizes app binary size with no benefit to authors who write clean code.
- **Require all authors to write ProGuard rules** — High barrier, common source of production reflection crashes.

---

## Q4 — Gradle / AGP Build Error UX

**Context:** When `./gradlew` fails inside `capsule build android`, the developer sees raw Gradle output — which is often cryptic and unrelated to anything in `capsule.config.ts`.

**Questions:**
- Should the CLI intercept common Gradle error patterns and translate them to actionable Capsule messages?
- Example: `minSdk < 21` error → "Set `android.minSdk` to at least 21 in capsule.config.ts"
- What is the intended workflow when a Gradle error has no fix at the Capsule config level?

**Answer:** **Decided — closed.**

**Layer 1 — Pre-flight validation (before Gradle runs):** `capsule build` validates config state first. Most common errors are caught here with direct `capsule.config.ts` field references:
- minSdk conflict between app config and plugin/override requirements
- Missing signing config for `--release` builds
- Missing `google-services.json` path
- Unsatisfied `requiresShell` ranges on installed plugins

**Layer 2 — Error pattern registry (for what slips through):** CLI maintains a community-contributed JSON registry of `{ pattern, capsuleMessage, fix, docsUrl }` entries. Gradle stderr is scanned on non-zero exit. Match → human-readable message. No match → raw Gradle output (last 30 lines) + `capsule doctor` suggestion:

```
✗ Build failed: minSdk conflict
  Plugin "@capsule-community/biometrics" requires android.minSdk ≥ 28.
  Your app declares android.minSdk: 24.
  Fix: raise android.minSdk to 28 in capsule.config.ts (drops Android 7.x support)
  Docs: https://capsule.dev/docs/errors/minsdk-conflict
```

The pattern registry lives as a JSON file in the CLI repo — community PRs add patterns. After real-world usage the registry covers the 80% of common failures. Unknown errors: raw Gradle output + `capsule doctor --verbose` + GitHub issue link.

**Rejected alternatives:**
- **Gradle build scan (`--scan`)** — Uploads data to Gradle infrastructure by default. Privacy concern disproportionate to the benefit.
- **Full structured Gradle output parsing** — Fragile across Gradle/AGP version combinations, high ongoing maintenance.

---

## Q5 — `capsule init` Framework Selection

**Context:** The CLI has a `capsule init` command but the docs don't specify whether it prompts for a web framework (React, Vue, Svelte, etc.) or just scaffolds a bare Vite project.

**Questions:**
- Does `capsule init` offer a framework selection menu (React / Vue / Svelte / Vanilla)?
- Is Angular supported? Angular has its own build pipeline (not Vite-native) — does Capsule support it or explicitly not?
- Who configures `vite.config.ts` with the correct framework plugin — the developer manually, or the CLI scaffolds it?

**Answer:** **Decided — closed.**

`capsule init` uses a `--template` flag backed by a template registry — same mental model as `npm create vite@latest`:

```bash
capsule init my-app --template react-ts
capsule init my-app --template vue-ts
capsule init my-app --template svelte-ts
capsule init my-app --template vanilla-ts
capsule init my-app --template github:myorg/my-capsule-template  # community / org template
```

Without `--template`: interactive prompt listing official templates with "Custom (GitHub URL)" at the bottom.

Official templates live in `capsule-framework/templates` repo. Each includes a pre-configured `vite.config.ts`, `capsule.config.ts`, `package.json`, and framework-specific entry point. The CLI uses `degit` to clone the template — no git history, clean working directory.

**Angular:** Not in official templates. Angular's build pipeline diverges enough to require disproportionate ongoing maintenance. Documented explicitly as unsupported with a note on the Vite-based Angular path. Community template via `github:` URL is the route for Angular users.

**Rejected alternatives:**
- **Interactive menu built into CLI core** — Framework-specific Vite plugin setup logic lives in CLI, breaks whenever a framework updates its Vite plugin.
- **Delegate to `create-vite` first, then add Capsule** — Two sequential interactive sessions on first use. Awkward UX for new developers.
- **Bare scaffold, developer adds framework manually** — Every developer performs 3–5 manual steps before writing a line of app code. Poor first impression.

---

## Q6 — Mobile CSS Reset / Layout Library

**Context:** There is no mention of a CSS baseline for mobile layout (safe area insets, tap highlight removal, font normalization, etc.). Ionic provides this as `@ionic/core/css`. Capsule has no equivalent.

**Questions:**
- Should Capsule ship a `@capsule/mobile-css` package with a minimal mobile reset?
- Minimum contents would include:
  - `env(safe-area-inset-*)` variables
  - `-webkit-tap-highlight-color: transparent`
  - `touch-action: manipulation` on interactive elements
  - `overscroll-behavior: none` where appropriate
  - Viewport height fix for mobile browsers (`100dvh`)
- Should this be bundled automatically, or opt-in via `capsule.config.ts`?
- Should `capsule init` prompt "Include Capsule mobile CSS reset? (Y/n)"?

**Answer:** **Decided — closed.**

Two automatic layers — zero developer configuration:

**Layer 1 — Shell injects CSS custom properties (native layer, always on):**
The shell writes accurate device-specific values to `:root` at startup and on orientation change:
```css
:root {
  --sai-top: 44px;     /* safe-area-inset-top — notch / Dynamic Island */
  --sai-bottom: 34px;  /* safe-area-inset-bottom — home indicator */
  --sai-left: 0px;
  --sai-right: 0px;
}
```
Values come from the native shell, not from `env(safe-area-inset-*)` CSS which is unreliable inside WebView.

**Layer 2 — CLI injects a minimal mobile reset into the built `index.html` (~150 bytes, opt-out):**
```css
*, *::before, *::after { box-sizing: border-box; }
html, body { height: 100%; margin: 0; overscroll-behavior: none; }
body { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
```
Opt-out: `web.mobileReset: false` in `capsule.config.ts`. No prompt during `capsule init`.

**`@capsule/mobile-css`** may exist as an optional package for utility classes (safe area helpers, styled scroll containers) but is never required and never prompted.

**Rejected alternatives:**
- **Opt-in package (`import '@capsule/mobile-css'`)** — Developers forget it on every new project. The framework should be correct by default.
- **CSS variables only** — Doesn't fix tap highlights, touch behavior, or overscroll. Every developer still writes the same 3 lines manually.
- **Full mobile UI component library (Ionic-style)** — Out of scope for the framework layer. Capsule is infrastructure, not a design system.

---

## Q7 — Minimum Plugin Set to Ship with Framework

**Context:** Phase 3 of the roadmap lists camera, filesystem, push, geolocation, and haptics. But some of these are available via standard Web APIs without a plugin.

**Questions:**
- What is the exact minimum plugin set for a real-world production app?
- Which capabilities are handled by Web APIs (no plugin needed) vs. require native plugins?
  - Geolocation: `navigator.geolocation` works in WebView — plugin needed?
  - Camera: `navigator.mediaDevices.getUserMedia` works — is `@capsule/camera` for native camera UX only?
  - Push: definitely needs native plugin (APNs/FCM registration)
- Should there be a "starter bundle" (`@capsule/essentials`) that installs the common set in one command?

**Answer:** **Decided — closed.** All platform OS APIs are built into `@capsule/core`. There is no "minimum plugin set" because there are no plugins for platform capabilities. Camera, GPS, push, NFC, Bluetooth, haptics, biometrics, filesystem, microphone, barcode, connectivity, clipboard, share sheet, battery, and device info all ship with the framework and are tree-shaken if unused. `@capsule/essentials` is not needed — `@capsule/core` is already the essentials. See the architectural decision in Q16.

---

## Q8 — Plugin LTS / Long-Term Support Policy

**Context:** One of the stated goals is to avoid "plugin hell." But this depends on the Capsule team committing to a support timeline for major versions.

**Questions:**
- How long is a major version of `@capsule/core` supported after the next major is released?
- What is the migration path when `@capsule/core` bumps a major version? Is there a codemod?
- What happens to community (`@capsule-community/*`) plugins when `@capsule/core` bumps? Is there a grace period before they are delisted?
- Is there a compatibility matrix published (core version × shell version × plugin version)?

**Answer:** **Decided — closed.**

The monolithic core model eliminates the cross-plugin compatibility matrix: there is only one version (core/shell) that everything is tied to. Community integrations still declare a `requiresShell` semver range. The `capsule override` mechanism (Q20) further reduces LTS urgency — bugs in core capabilities can be patched surgically without waiting for a new shell release.

**LTS policy: 24-month security window after next major.**

Major version bumps are rare by design — they happen only when:
- The bridge protocol changes incompatibly
- A core API must be renamed for platform reasons
- A minimum supported Android/iOS version is dropped

Published policy: the previous major receives security patches for **24 months** after the next major ships. This is the Node.js LTS model — well understood by enterprise teams.

**`capsule migrate` command** is required before any major version ships:
```bash
capsule migrate --from v1 --to v2
# Automated codemods: renamed imports, config field changes, deprecated API replacements
# Produces a diff — developer reviews and commits
```
Migration guides alone are not sufficient. Automated tooling is the bar.

**Community integrations (`@capsule-community/*`)** declare their own support policy via `capsule-plugin.json`. CLI warns at install if a plugin's `requiresShell` range excludes the current shell version.

**Rejected alternatives:**
- **Two-version support window (Apple-style)** — Potentially aggressive if majors ship on a fast cadence in early years.
- **No formal EOL — community takes over** — Unpredictable for enterprises doing multi-year planning. The 24-month window is explicit and contractual.

---

## Q9 — CodeSync: Manual Approval Gate / Pilot Targeting

**Context:** CodeSync supports percentage-based rollout and channels, but has no concept of a named device list or explicit approval step before promoting a rollout.

**Questions:**
- Can a release be put in "pending approval" state — staged but not delivered to any device until someone approves in the dashboard?
- Can a specific set of named devices (by `device_id` or device model) be targeted for a pilot before opening to a percentage rollout?
- Can devices be grouped by region, locale, or custom metadata tags?
- Should the dashboard support a "promote to production" workflow with a required approver?

**Answer:** **Decided — closed.**

Channels are the approval mechanism — no new state machine needed. "Approval" is the act of running `capsule codesync promote`. Role-based access determines who can promote to production.

**Deployment flow:**
```
developer publishes → staging channel → QA validates → Releaser promotes → production
```

```bash
# Publish to staging, targeting only QA devices
capsule codesync publish --channel staging --filter "metadata.group = 'qa'"

# After QA sign-off — promotion IS the approval gesture
capsule codesync promote --from staging --to production --rollout 5
```

**Role-based access (`capsule portal roles`):** `Developer` can publish to any non-production channel. `Releaser` role required to run `promote --to production`. This satisfies enterprise compliance without adding a separate approval state to the bundle lifecycle.

**Pilot targeting via device metadata filters:**
```bash
# Target named pilot group before opening to percentage rollout
capsule codesync publish --channel staging --filter "metadata.group = 'pilot'"
# After pilot validation:
capsule codesync promote --from staging --to production --rollout 5
```

**Scheduled releases:**
```bash
capsule codesync publish --channel production --at "2026-06-01T09:00:00Z"
# Bundle is ready and signed; delivery begins at the specified time
```
Useful for coordinated marketing launches across timezones.

**Dashboard named groups:** Saved filter expressions ("Brazil Enterprise", "Beta Testers"). `capsule codesync publish --group "beta-testers"` is shorthand for the saved filter. Groups are stored server-side, not in `capsule.config.ts`.

**Rejected alternatives:**
- **Formal `draft → staged → approved` state machine** — Same outcome achievable with channels + RBAC. Extra states add implementation complexity with no behavioral difference.
- **Named device lists (manual dashboard tagging)** — Only scales to small fleets. Metadata filters compose with channels and rollout %, making them strictly more powerful.

---

## Q10 — CodeSync Version Numbering Convention

**Context:** The relationship between the store app version (`1.0.0`) and the CodeSync bundle version is not explicitly defined as a convention.

**Questions:**
- Is the CodeSync bundle version always tied to the store version name, or is it independent?
- Proposed convention: `{appVersion}.{bundlePatch}` — e.g., store version `1.0.0`, CodeSync bundles `1.0.0+1`, `1.0.0+2`, etc.
- How is this displayed in the dashboard — does it show `1.0.0 (bundle #3)` or something else?
- How does `capsule codesync releases` output version info in a way that maps clearly to store releases?

**Answer:** **Decided — closed.**

**Canonical format:** `{appVersion}+{bundlePatch}` — semver build metadata. `1.0.0+3` means the 3rd CodeSync patch on the `1.0.0` store release. The bundle counter resets to `1` when `appVersion` changes.

Internal API and `capsule-bundle.json` use the canonical form. CLI and dashboard never surface the `+` notation directly — they display as two separate dimensions:

```
VERSION    BUNDLE  CHANNEL     ROLLOUT  STATUS       PUBLISHED
1.0.0      +3      production  100%     active       2026-05-21 14:30
1.0.0      +2      production  —        rolled-back  2026-05-19 09:12
1.0.0      +1      production  100%     superseded   2026-05-15 16:45
0.9.1      +7      production  100%     superseded   2026-04-30 10:00
```

`capsule codesync publish` auto-increments the bundle counter within the current `appVersion` and validates that `appVersion` in `capsule.config.ts` matches what's in `capsule.lock`.

**Rejected alternatives:**
- **Independent monotonic counter** — Loses the "which store version was this built from" traceability in CLI output. Requires a dashboard lookup to understand context.
- **`{appVersion}-bundle.{N}` (pre-release notation)** — Pre-release semver implies instability. Semantically wrong for production bundles.
- **Timestamp-based (`1.0.0-20260521.1`)** — Verbose in logs, doesn't survive timezone differences in CI pipelines.

---

## Q11 — GTM / Analytics: Native Navigation Events

**Context:** GTM works as a standard web script with no plugin needed. However, Android's hardware back button is handled at the native layer and may not fire browser `history` events.

**Questions:**
- Does the Capsule shell synthesize `popstate` or History API events when the Android back button is pressed?
- If not, GTM's History Change trigger won't track navigation in multi-page Capsule apps — who is responsible for bridging this?
- Should there be a `@capsule/navigation` bridge plugin that emits JS navigation events for GTM/analytics?
- For single-page apps using React Router / Vue Router, this is a non-issue — should the docs clarify this?

**Answer:** **Decided — closed.** `capsule.navigation` is part of `@capsule/core` (not a plugin). Robust default behavior, fully overridable.

**Default shell behavior (automatic, no developer code needed):**
1. Android hardware back button intercepted by shell
2. Shell calls `window.history.back()` if `history.length > 1` → this fires a native `popstate` event → GTM's History Change trigger fires automatically
3. If no history to go back to, shell dispatches a `capsule:backbutton` custom event on `window` → developer can handle "exit app?" confirmation

**Developer override API (`@capsule/core`):**
```typescript
import { navigation } from '@capsule/core'

// Override back button completely
navigation.onBackButton((event) => {
  if (event.canGoBack) {
    // custom logic before going back
    showExitConfirmation().then(confirmed => {
      if (confirmed) navigation.goBack()
    })
  } else {
    // no history — custom exit flow
    showExitConfirmation()
  }
})

// Listen without overriding (additive)
window.addEventListener('capsule:backbutton', (e) => {
  analytics.track('back_button_pressed', { canGoBack: e.detail.canGoBack })
})
```

**For SPA frameworks (React Router, Vue Router):** The `popstate` event fires normally — their routers already handle it. No action needed.

**For GTM:** The `popstate` event that fires from `window.history.back()` is the standard History Change trigger. Works automatically with zero GTM configuration.

---

## Q12 — iOS: `capsule dev --qr` Without macOS

**Context:** The QR code dev flow is documented for both platforms, but iOS builds always require macOS + Xcode.

**Questions:**
- If a developer is on Windows/Linux, can they use `capsule dev --qr` for Android while a teammate handles the iOS side?
- Is there a cloud macOS option (GitHub Actions macOS runner, Mac-in-Cloud) documented for teams without Apple hardware?
- Should `capsule dev` clearly detect the platform and warn "iOS dev requires macOS" before attempting?

**Answer:** **Decided — closed.**

iOS requires macOS. This is Apple policy, not a Capsule limitation. The framework does not attempt to work around it.

**DX handling:**
- `capsule add ios` on Windows/Linux → clear warning at setup time (not at build time, when the developer has already invested time)
- `capsule dev` on Windows/Linux → starts Android-only mode silently; prints one note: `iOS dev requires macOS — running Android only`
- `capsule build ios` on Windows/Linux → hard error with docs link

**For cross-platform teams (Windows/Linux primary development):**
Develop and test on Android (95%+ of app code is platform-agnostic). Run iOS builds in CI on GitHub Actions macOS runners. Document this workflow explicitly in the docs as "The Windows/Linux team setup."

**Phase 6 roadmap — `capsule build ios --cloud`:**
First-party or partnered Mac-in-Cloud integration. Configures via `capsule portal` with an API key. Handles production builds only (not dev hot reload — that round-trip is too slow for iteration). Removes the macOS dependency for release builds.

**Rejected alternatives:**
- **Remote relay (`capsule dev --ios-relay <ip>`)** — macOS machine on the network serves as the iOS build/deploy relay. Complex networking, niche setup, hard to support and document.
- **WebKit emulation on Windows** — Apple's rendering stack is not portable. Not realistic.
- **Hide the constraint** — Worse than being explicit. Developers discover it mid-project rather than at setup time.

---

## Q13 — `capsule eject` for Closed-Source Plugins

**Context:** `capsule eject` requires a `sourceRepo` field in `capsule-plugin.json`. Closed-source plugins cannot be ejected.

**Questions:**
- Should closed-source plugins be explicitly prohibited from the `@capsule-community/*` tier?
- If a commercial plugin (e.g., a paid SDK wrapper) has no `sourceRepo`, what is the developer's recourse when it breaks?
- Should the CLI warn at install time if a plugin has no `sourceRepo`?

**Answer:** **Decided — closed.**

**`@capsule-community/*` scope requires open source.** `sourceRepo` is a required field to publish under the community scope. Without it, `capsule plugin publish` rejects:
```
✗ Community-scoped plugins must have a sourceRepo in capsule-plugin.json.
  For closed-source plugins, publish under your own npm scope
  and declare trust: 'unverified' in capsule.config.ts.
```

**For closed-source or commercial plugins:** They live outside `@capsule-community/*`, are `trust: 'unverified'` by default, and the developer must explicitly acknowledge the risk:
```typescript
plugins: [
  { path: 'vendor-sdk-plugin', trust: 'unverified' }  // required for non-community-scoped plugins
]
```

CLI warning at install for `unverified` plugins:
```
⚠ Plugin "vendor-sdk" has no sourceRepo. capsule override and capsule eject are not available.
  If this plugin breaks or is abandoned, you cannot fork or patch it.
  Ensure you have a vendor support contract before shipping this to production.
```

**The `trust: 'unverified'` declaration is deliberate friction** — not a blocker, but an acknowledgment. This is the same model as Android's "Unknown sources" toggle.

**Escape hatch context:** For plugins that *do* have source (even if not in `@capsule-community/*`), `capsule override` covers surgical bug fixes and `capsule eject` covers full forks. For genuinely closed-source plugins, neither is available — the developer's only recourse is the vendor.

**Rejected alternatives:**
- **Allow closed-source in `@capsule-community/*` with a `"license": "commercial"` flag** — Weakens the trust tier signal. The community scope should be a reliable indicator of open, auditable code.
- **Source escrow requirement for commercial plugins** — Hard to enforce, complex verification process, disproportionate overhead for the community registry.

---

## Q14 — Capsule Server: Device Grouping by Custom Metadata

**Context:** The `devices` table has a `metadata JSONB` column, but the dashboard and API don't document how custom metadata is set or queried.

**Questions:**
- Can the native client send custom metadata at check-in time (e.g., `{ "region": "br-south", "tier": "enterprise" }`)?
- Can CodeSync channel targeting use metadata filters (e.g., "deliver to all devices where `metadata.region = 'br-south'"`)?
- If not, how do you do region-based or customer-segment-based rollouts?

**Answer:** **Decided — closed.**

Two-layer metadata model — automatic standard metadata + developer-registered business metadata:

**Layer 1 — Shell sends standard metadata at every check-in (zero config):**
```json
{
  "os_version": "Android 14",
  "locale": "pt-BR",
  "timezone": "America/Sao_Paulo",
  "device_model": "Pixel 8",
  "app_version": "1.0.0",
  "bundle_version": "1.0.0+3"
}
```
Handles geographic targeting (`locale`), OS version targeting, and device model targeting with no app code.

**Layer 2 — App registers business metadata via bridge API:**
```typescript
import { codesync } from '@capsule/core'

// Called after authentication — when business context is known
codesync.setDeviceMetadata({
  user_tier: user.subscriptionPlan,  // 'free' | 'pro' | 'enterprise'
  experiment_group: abTest.group,    // 'control' | 'checkout-v2'
  store_id: user.assignedStore       // for retail chains
})
```
Stored in `devices.metadata JSONB`. Merged with standard metadata. No PII — docs explicitly warn against storing email/name; use opaque identifiers.

**Channel targeting uses filter expressions on any metadata key:**
```bash
# Geographic (automatic metadata — no app code needed)
capsule codesync publish --channel staging --filter "metadata.locale LIKE 'pt-%'"

# Business segment (custom metadata)
capsule codesync publish --channel staging --filter "metadata.user_tier = 'enterprise'"

# Composable
capsule codesync publish --channel staging \
  --filter "metadata.user_tier = 'enterprise' AND metadata.locale LIKE 'pt-%'"
```

**Dashboard named groups** are saved filter expressions — `capsule codesync publish --group "brazil-enterprise"` is shorthand. Groups are stored server-side.

**Rejected alternatives:**
- **Server-side device tagging via dashboard** — Only practical for fleets under ~100 devices. No scale.
- **Named device lists (by explicit device IDs)** — Not composable. Doesn't work for dynamic populations (new devices, new users).

---

## Q15 — Who Maintains the Capsule Shell Long-Term?

**Context:** The entire framework depends on the Capsule team continuously publishing new shell versions (AAR for Android, XCFramework for iOS) as Google and Apple evolve their platforms.

**Questions:**
- Is the shell open source? Can the community contribute patches or fork it?
- If the project is abandoned, is there a documented path for an organization to take over shell maintenance?
- Should the shell source be published even if the CLI and portal remain proprietary?

**Answer:** **Decided — closed.** Open source from day one. Shell (Kotlin/Swift), CLI, and bridge runtime are all public repositories under the `capsule-framework` GitHub org. The portal/cloud infrastructure may have a proprietary tier, but the core toolchain is MIT or Apache 2.0. Any developer or organization can fork and continue maintenance. Community SDK-update PRs are explicitly welcome.

---

## Q16 — Architectural Decision: Monolithic Core SDK

**Context:** After design review, a fundamental architectural shift was made from a plugin-based model (where even platform OS APIs were separate packages) to a monolithic core SDK model.

**Decision: Adopted.**

**Rule:**
- If a capability uses an OS API that ships with Android/iOS → it is part of `@capsule/core`
- If a capability requires a third-party SDK dependency → it is a community integration (`@capsule-community/*` or local `capsule-plugins/`)

**Core capabilities (always in `@capsule/core`, tree-shaken if unused):**
Camera, GPS/Geolocation, Push Notifications, NFC, Bluetooth LE, Haptics, Biometrics, Filesystem, Microphone/Audio, Barcode/QR, Connectivity, Clipboard, Share Sheet, Battery, Device Info, Screen Orientation, Accelerometer/Gyroscope, Preferences (key-value), Database (SQLite), Browser (in-app browser), InlineWebView

**Community integrations (separate packages, require third-party SDK):**
Google Maps, Stripe, Braintree, Firebase, Facebook Auth, Segment, Twilio, etc.

**CodeSync:** Built into `@capsule/core`. Activated via `codeSync.enabled: true` in `capsule.config.ts`. Compiled out when disabled.

**Rationale:** Eliminates plugin compatibility matrix, reduces DX friction (no installs for OS APIs), enables one-version-manages-everything upgrade model. Tree-shaking ensures app size is not penalized for unused capabilities.

---

## Q17 — Shell Host Strategy: Expo/RN vs Custom Native Binary

**Context:** Two options were evaluated: (A) build the native shell as a custom Kotlin/Swift binary maintained by the Capsule team; (B) use Expo/React Native as the shell host, delegating Gradle/AGP/Xcode maintenance to the Expo team.

**Decision: Decided — closed. Custom Kotlin/Swift binary (Option A).**

Rationale: Expo dependency would introduce a large runtime (~12–15 MB), force React-only JS engine, and trade Gradle maintenance pain for Expo major-version migration pain. The open source model (Q15) and community SDK-update SLA (Q1) mitigate the maintenance risk that originally motivated Option B. Full control over the shell means the bridge protocol, WebView configuration, and lifecycle behavior are owned entirely by the project.

---

## Q18 — WASM Components for Community Integrations

**Context:** Community integrations currently support two modes: binary (AAR/XCFramework via npm) and source (Kotlin/Swift compiled alongside app). WASM components were evaluated as a third mode enabling OTA-updatable logic integrations without native code.

**Decision: Decided — adopt as third mode.**

WASM components work for pure-logic capabilities (barcode decoding, PDF, image processing, crypto, compression). They cannot directly call platform APIs — those still require native code. The split:
- **Logic integrations** → WASM component, OTA-updatable via CodeSync, single `.wasm` binary for both platforms
- **Platform API integrations** → native Kotlin/Swift, store update required

**Toolchain responsibilities (`@capsule/cli`):**
```bash
capsule plugin create my-barcode --wasm   # scaffold Rust/C/TS WASM component
capsule plugin build --wasm               # compile to .wasm via wasm-pack / wasi-sdk
capsule plugin publish ./path             # packages .wasm into npm tarball (same flow)
```

**Resolved via D2**: WAMR is **not** embedded in the shell. It ships as the `@capsule/wasm` first-party plugin. Apps that need WASM capabilities install `@capsule/wasm`; apps that don't pay zero binary size overhead. The shell strictly contains native OS capabilities only — see D2.

**Language support:** Rust (best), C/C++, TypeScript via `jco`. Other languages are community-supported.

---

## Q19 — Push Notifications: Firebase SDK Ownership

**Context:** Q16's rule states "third-party SDK dependency → community integration." Push notifications on Android require FCM, which is implemented via `com.google.firebase:firebase-messaging`. This creates a conflict: push feels like a core OS capability, but its Android implementation requires a Google-owned third-party SDK.

**Decision: Decided — Firebase FCM included in `@capsule/core`. Capsule team owns the dependency version.**

**Rationale:** FCM is the only practical Android push mechanism. Every major framework (Expo, Capacitor, React Native) includes it. Google will not abandon its own push infrastructure. The risk of including it is manageable; the cost of not including it is mandatory developer boilerplate.

**Q16 exception rule:** Firebase FCM is a pragmatic exception because it is effectively Android's OS-level push infrastructure despite being distributed as a separate SDK.

**iOS:** APNs is a pure platform API — no third-party SDK, no exception needed.

**Developer configuration in `capsule.config.ts`:**
```typescript
android: {
  push: {
    // Path to google-services.json downloaded from Firebase Console
    // CLI injects this into the generated Android project
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON  // e.g. './google-services.json'
  }
}
```

The `google-services.json` is app-specific (contains project ID, API key, app ID). It cannot be bundled in the shell — the app developer generates it from the Firebase Console and provides the path. The CLI copies it to `.capsule/android/app/google-services.json` during `capsule sync`.

**Version conflict risk:** Apps that also use Firebase for Firestore/Analytics may encounter Gradle dependency conflicts. Gradle resolves these via "highest compatible version wins," but the Capsule team commits to supporting a range of Firebase BOM versions to reduce friction. If a conflict occurs, `android.gradleOverrides` is the escape hatch.

---

## Q20 — Core Capability Override System

**Context:** `@capsule/core` is monolithic — all platform capabilities are compiled into the shell binary. If a bug exists in a core capability (e.g., `camera.capture`), developers have no path to fix it without: (a) waiting for a Capsule team patch, (b) compiling the entire shell from source, or (c) a full `capsule eject`-style fork.

**Decision: Decided — closed. Runtime dispatch registry with surgical override support.**

**Shell internals (inside the compiled AAR/XCFramework — fixed at build time):**
```kotlin
object CapsuleBridgeRegistry {
    private val overrides = mutableMapOf<String, CapsuleHandler>()
    private val builtins  = mapOf(
        "camera.capture"           to CapsuleCameraHandler(),
        "camera.getPermission"     to CapsuleCameraPermissionHandler(),
        "gps.getCurrentPosition"   to CapsuleGpsHandler(),
        // ... all core capabilities pre-registered
    )

    fun registerOverride(method: String, handler: CapsuleHandler) {
        overrides[method] = handler   // called at app startup, before any JS runs
    }

    fun dispatch(method: String, params: JsonObject): JsonObject {
        return (overrides[method] ?: builtins[method])
            ?.handle(params) ?: throw CapsuleError(1002, "METHOD_NOT_FOUND")
    }
}
```

The registry is mutable at runtime. Built-ins are the defaults. Overrides win when present. This is a first-class design requirement — not retrofitted.

**Developer workflow:**

```typescript
// capsule.config.ts
plugins: [
  { path: './capsule-plugins/camera-fix', overrides: 'camera' }
]
```

```kotlin
// capsule-plugins/camera-fix/android/CameraFix.kt
@CapsulePlugin("camera-fix")
class CameraFix(bridge: CapsuleBridge) : CapsuleCoreOverride(bridge) {

    @BridgeMethod("capture")
    suspend fun capture(params: JsonObject): JsonObject {
        // only this method is intercepted — others fall through to built-in
        return super.capture(params).also { result ->
            // patch the broken behavior here
        }
    }
    // getPermission(), getSupportedFormats(), etc. → fall through to built-in automatically
}
```

**At `capsule sync`**, the CLI detects the `overrides` declaration and generates registration code in the thin `.capsule/android/` wrapper:
```kotlin
// .capsule/android/CapsuleApp.kt (generated — do not edit)
class CapsuleApp : Application() {
    override fun onCreate() {
        CapsuleBridgeRegistry.registerOverride("camera.capture", CameraFix(this))
        CapsuleShell.initialize(this)
    }
}
```

**What compiles:** only the developer's fix file — not the shell, not `@capsule/core`.
**TypeScript API:** unchanged. `camera.capture()` still works identically from the web layer.
**Removal:** when the official shell patch ships, delete the folder and the `plugins` entry.

**CLI scaffolding:**
```bash
capsule override camera
# Creates capsule-plugins/camera-override/ pre-populated with the built-in source
# (fetched from the open-source shell repo at the currently locked shell version)
# Developer deletes all methods they don't need to override.
```

**What `capsule override camera` generates** (the scaffold IS the documentation):
```kotlin
// capsule-plugins/camera-override/android/CameraOverride.kt
//
// Core capability override for: camera
// Shell version this was generated from: 1.4.2
//
// HOW TO USE:
//   1. Delete every method you do NOT need to change — they fall through to the
//      built-in implementation automatically. Do not leave empty method bodies.
//   2. Use super.capture(params) to call the original built-in from within your fix.
//   3. When the official shell patch ships: delete this file and remove the
//      plugins entry from capsule.config.ts.
//
// The TypeScript API (camera.capture() etc.) is unchanged — this only affects
// the native layer. No web-side changes needed.

@CapsulePlugin("camera-override")
class CameraOverride(bridge: CapsuleBridge) : CapsuleCoreOverride(bridge) {

    // ← EDIT or DELETE: replace with your fix.
    // Returning super.capture(params) calls the original built-in.
    @BridgeMethod("capture")
    suspend fun capture(params: JsonObject): JsonObject {
        return super.capture(params)
    }

    // ← EDIT or DELETE
    @BridgeMethod("getPermission")
    suspend fun getPermission(params: JsonObject): JsonObject {
        return super.getPermission(params)
    }

    // ... all other camera methods pre-populated ...
    // Delete the ones you don't touch — fall-through is automatic
}
```

**Relationship to `capsule eject`:**

| | `capsule override` | `capsule eject` |
|---|---|---|
| Scope | Single core capability | Entire community integration |
| Use case | Bug fix / surgical patch | Long-term customization |
| TypeScript API | Unchanged | Developer-owned |
| Effort | One Kotlin/Swift file | Full integration authoring |
| Intended lifetime | Temporary (remove after patch) | Permanent source dependency |

---

## Q21 — Database API: Raw SQL Bridge vs. Ergonomic Wrapper

**Context:** SQLite ships natively on both Android (`android.database.sqlite`) and iOS (`libsqlite3.dylib`), making it a core OS API that belongs in `@capsule/core` by Q16's rule. The question is what shape the TypeScript API should take.

**Decision: Decided — closed. Two-layer ergonomic API with a `db` singleton.**

**Why not expose raw SQL alone:**
A bridge that only exposes `{ sql, values }` objects forces every app to manage database handles explicitly, write boilerplate open/close logic on every screen, and wrap every call in a verbose options object. Web developers are not SQLite experts — exposing raw SQL as the *only* surface raises the floor too high.

**Layer 1 — `db` singleton (covers 95% of apps):**

The `db` export is a pre-opened singleton backed by `capsule.db`. No `open()` / `close()` required. The `collection()` API auto-manages schema — no migration files needed for simple cases. For raw SQL, use the `db.sql` tagged template with full parameterization.

```typescript
import { db } from '@capsule/core'

// Zero-SQL CRUD — auto-schema
const notes = db.collection<Note>('notes')
const note  = await notes.add({ title: 'Hello' })
const all   = await notes.getAll()

// Raw SQL when you need joins or aggregates — values always parameterized
const recent = await db.sql<Note[]>`SELECT * FROM notes ORDER BY id DESC LIMIT 20`
```

**Layer 2 — `db.collection()` for zero-SQL CRUD:**

For tables with simple access patterns, `db.collection<T>('name')` returns a typed handle with `add`, `get`, `getAll`, `where`, `update`, `remove`. No SQL written. Falls through to `db.sql` the moment you need joins or complex filters — the two layers compose naturally.

```typescript
const notes = db.collection<Note>('notes')
const note = await notes.add({ title: 'Hello' })
const all  = await notes.getAll()
const one  = await notes.get(note.id)
```

**`database.open()` still available for advanced use:**

Multi-database apps and encrypted databases use `database.open({ name, encrypted, encryptionKey })`, which returns a `DatabaseHandle` with the same `all/first/run/transaction/schema` methods. This is the escape hatch — not the default path.

**`preferences` for key-value storage:**

The `preferences` capability (`SharedPreferences` / `UserDefaults`) is a separate export for lightweight persistent flags, tokens, and settings. It is not SQLite — it has no query capability and is not a substitute for `db`.

**Rationale:** The layered design follows the same principle as `@capsule/core` overall — zero-config default that works for the common case, with explicit escape hatches for advanced needs. A developer who only needs to store a list of items should never need to know what SQLite is.

**Rejected alternatives:**
- **Raw SQL bridge only** — Too verbose for simple use cases. Every app writes the same open/close/schema boilerplate.
- **ORM bundled in the shell** — Shell binary size penalty for apps that don't use complex queries. Opinionated schema definition conflicts with code-first and migration-first approaches. Community ORMs (Drizzle, Kysely) can target the `db` bridge natively.
- **IndexedDB / localStorage on web layer only** — No cross-platform backup, limited query capability, size-constrained by the OS WebView storage quota. Not reliable for production app data.

---

## Q22 — AI / LLM Inference & Agents: Ownership and Shape

**Context:** Every platform is being asked for AI. Q16's rule (OS API → `@capsule/core`) plus the fact
that the OS-native on-device models (Apple Foundation Models, Gemini Nano) only cover recent flagships
raises the question of what an `ai` capability should be, and whether Capsule should also expose *agents*.

**Decision: Proposed — see [adr-003](0003-ai-and-agents.md) for the full record.** Summary:

- **`ai` is a core capability** (`@capsule/core`, opt-in + tree-shaken per Q16), exposed as an `ai`
  singleton via the standard `interface → provider → Fake → handler` pattern, with a **provider behind
  it** like `geolocation`/`camera`.
- **Three tiers, one TS surface, hybrid by default:** Tier 1 OS-native (flagship-only checkbox) · Tier 2
  bundled engine (**Cactus** primary, **llama.cpp** escape hatch — universal, offline) · Tier 3 cloud
  (the Phase-5 billing meter). `ai.availability()` reports the honest tier.
- **Agents = `@capsule/core/agent`** — a *thin* layer where the **native bridge methods are the tool
  surface** (every Phase-3 API is a free agent tool), the loop runs in **QuickJS** (inference is a bridge
  call, never in QuickJS), and agent definitions are **OTA-updatable** via Server Code Push. We do **not**
  build a LangChain-style framework; tool protocol likely **MCP**.
- **Constraints (inherit the Phase-3 OTA rules):** models persist **outside** the OTA bundle dirs;
  `ai` carries a native-capability version for OTA gating; a per-tool **permission model** for agent tools.
- **Phasing:** Tier-1 `ai` spike in late Phase 3; iOS Tier-1 in Phase 4; Tier 2/3 + agent layer +
  OTA-updatable agent logic in Phase 6. **Gates before Tier 2+:** confirm Cactus license + `.cact`
  longevity (keep the GGUF/llama.cpp escape hatch), MCP-vs-custom tool protocol, tool-permission UX,
  model-distribution + default tier-escalation policy.

---

# Part 2 — Implementation Decisions

Decisions that must be made before the relevant phase starts. Ordered by urgency.

---

## Phase 1 — Foundation

### D1: APK debug keystore for `capsule build android --release`

**Context**: Phase 1 uses a debug keystore for `--release` builds (real signing lands with publishing in Phase 8+; Fastlane automation in Phase 9 DX). Needs a clear behavior when no keystore is configured.

**Options**:
- **A — Delegate to Gradle** — Let Gradle use its own auto-generated debug keystore (`~/.android/debug.keystore`). Zero CLI code. Familiar to Android devs. Capsule just runs `./gradlew assembleRelease` without injecting signing config. *(Recommended — aligns with "shell is a dependency" philosophy: native tooling handles native things)*
- **B — Auto-generate at `~/.capsule/debug.keystore`** — CLI generates a debug keystore once on first build if none found. Capsule-managed, consistent path, no dependency on Android Studio having run first.
- **C — Require explicit config** — Developer must add `android.signing` block in `capsule.config.ts`. Fails with a clear error if missing. Most explicit, most friction for first build.

**Needed before**: Implementing `capsule build android --release` (Step 3.7).

**Status**: ✅ **DECIDED — Option A (Delegate to Gradle)**
Gradle auto-manages `~/.android/debug.keystore`. CLI runs `./gradlew assembleRelease` without injecting signing config. No CLI keystore code in Phase 1.

---

## Phase 2 — Embedded Runtime

### D2: WASM runtime (WAMR) — always embedded vs. on-demand

**Context**: WAMR (~500KB native binary) enables WASM integrations (Q18 above). If always embedded, every app pays the size penalty even if unused.

**Options**:
- **A — Always embedded** — WAMR is compiled into the AAR for all shells. Simple, one shell variant, no conditional compilation. All apps pay ~500KB regardless.
- **B — On-demand via config flag** — Shell is built with WAMR only when `capsule.config.ts` declares `wasm: { enabled: true }`. CLI downloads the correct AAR variant. Two AAR variants exist in the registry (`standard`, `wasm`). *(Recommended — aligns with tree-shaking philosophy)*
- **C — Separate plugin** — WASM runtime ships as a first-party plugin `@capsule/wasm` that adds WAMR to the build. Developer installs only if needed. Cleanest API surface, but adds complexity to the plugin system before it matures.

**Needed before**: Building the shell registry and the second AAR publish (Phase 2).

**Status**: ✅ **DECIDED — Option C (`@capsule/wasm` first-party plugin)**
WASM runtime (WAMR) ships as `@capsule/wasm`, not in the shell. Aligns with the core architectural principle: shell = native OS capabilities only; code-logic integrations = plugins. Community WASM plugin authors declare `@capsule/wasm` as a peer dependency.

---

## Phase 3 — Native APIs Expansion

### D3: Plugin override — fallthrough semantics for partial overrides

**Context**: `capsule override camera` scaffolds a patch class. If the override only implements some methods, what happens to unimplemented ones?

**Options**:
- **A — Silent fallthrough** — Unimplemented methods in the override delegate automatically to the built-in handler. No error. Developer gets partial patch behavior by default. *(Recommended — lowest friction, least surprising)*
- **B — Explicit delegation required** — Override must call `super.methodName(call)` to delegate. Unimplemented methods → error 1002 `METHOD_NOT_FOUND`. Explicit, but breaks anything not consciously delegated.
- **C — Runtime warning + fallthrough** — Silently falls through (like A) but logs a warning in debug mode: `[Capsule] Override for camera.capture not found — falling back to built-in`. Best of both worlds for discoverability.

**Needed before**: Implementing `capsule override` CLI command and the registry dispatch system.

**Status**: ✅ **DECIDED — Option A (silent fallthrough) + full scaffold**
`capsule override <capability>` scaffolds a class with ALL capability methods listed (so developer sees the full surface and TypeScript enforces signatures). Developer deletes methods they don't want to touch — deleted methods fall through to the built-in at runtime silently. Methods kept in the class run as the override. No runtime warnings.

### D4: Encrypted database — key management model

**Context**: The `db` API (`../reference/core-api.md`) supports encryption, but key derivation, storage, and rotation are unspecified. This is a security contract that cannot be retrofitted after apps ship.

**Options**:
- **A — Developer-supplied key** — Developer provides the key explicitly: `database.open('secure.db', { key: derivedKey })`. Capsule stores nothing. Developer is responsible for key derivation and secure storage (e.g., using the biometrics API). *(Recommended — most flexible, no opinion on key derivation)*
- **B — Capsule-managed key via secure storage** — CLI generates a per-app key stored in Android Keystore / iOS Secure Enclave. Transparent to developer. `db` is encrypted by default with zero config. No rotation support without a migration.
- **C — Two-tier** — `db` (unencrypted, default) + `database.open('path', { key })` (developer-supplied key for sensitive data). Q21 already implies this split — just needs the key contract documented explicitly.

**Needed before**: Implementing the database capability in Phase 3.

**Status**: ✅ **DECIDED — Combined A+B API + Option C for encryption**

`db` exposes two complementary APIs on the same SQLite engine:
- `db.collection<T>()` — zero-SQL CRUD with query builder + sync hooks (`changesSince` / `applyChanges`). Auto-manages table schema. No migrations needed for simple cases.
- `db.sql` tagged template literal — full SQLite access for joins, aggregates, DDL. Values always parameterized (no injection risk). Collection tables and raw SQL tables share the same database file.
- `db.schema()` — manual migrations only for raw SQL managed tables.
- `db.transaction()` — atomic operations spanning both APIs.

`database.open(name, { key })` = encrypted named database via SQLCipher. Same combined API. Developer supplies the key (Capsule never derives or stores it). Key typically retrieved via biometrics or secure preferences API.

See `../reference/core-api.md` § db (planned additions) for the full TypeScript interface.

---

## Phase 8 — Ecosystem

### D5: Differential update algorithm

**Context**: The roadmap mentions "80% size reduction via delta bundles" but the algorithm is unspecified. The CodeSync server architecture depends on this choice.

**Options**:
- **A — bsdiff/bspatch** — Binary diff at the bundle level. Industry standard (Chrome, Android OTA). ~80% reduction for incremental web changes. Mature implementations exist. Server generates the diff; client applies it. Complexity: medium (server must store previous bundle to diff against).
- **B — File-level content-addressed storage** — Bundle is a ZIP. Server only transfers files with changed hashes. Simple to implement, no diff algorithm. Works well for many small changed files. Less effective for large minified bundles with small logical changes.
- **C — No differential (Phase 6 MVP)** — Full bundle always. Decide delta strategy in Phase 6 after measuring real bundle sizes. Don't over-engineer before data exists. *(Pragmatic choice for the initial OTA cloud)*

**Needed before**: Designing the CodeSync server storage model (Phase 6).

**Status**: ✅ **DECIDED — Option B (file-level, content-addressed)**
CodeSync is a service pack / hotfix mechanism — not a full app update channel. A typical hotfix changes 1–3 Vite output chunks out of a 2MB bundle. Vite's content-hashed output (e.g. `chunk-abc123.js`) means unchanged files have identical hashes. Server stores all bundle files by content hash. Devices request only files they don't already have. In practice this transfers 10–50KB for a hotfix instead of 2MB. bsdiff (A) offers marginal additional gains (~5–10KB) at major complexity cost — not justified for this use case.

---

## Cross-phase

### D6: Safe area insets — timing contract

**Context**: Q6 above specifies that the shell injects `--sai-*` CSS custom properties. The timing relative to WebView loading is not defined. App CSS that reads `--sai-*` before injection = wrong layout on first paint.

**Options**:
- **A — Inject before navigation** — Shell writes `--sai-*` via a `<style>` tag injected into the WebView configuration before the URL loads. Guaranteed available before any app CSS runs. Zero race condition.
- **B — Inject via `evaluateJavascript` + `capsule.ready()` promise** — Shell fires the injection after `onPageFinished`. `@capsule/core` exposes `capsule.ready()` that resolves after insets are set. App code awaits `capsule.ready()` before reading `--sai-*`. Explicit contract.
- **C — Both** — Inject known safe defaults (0px) before navigation, then update to real values after `onPageFinished`. No race condition, no `capsule.ready()` needed. First paint uses 0px; correct values arrive before any user interaction.

**Needed before**: Implementing safe area support in the shell (Phase 3 shell; iOS in Phase 4).

**Status**: ⬜ Undecided

---

# Part 3 — Embedded Runtime Decisions

These were decided together in **[`0001-embedded-runtime.md`](0001-embedded-runtime.md)**,
which is the authoritative source — read it there. (This section previously restated those
decisions inline as R1–R14; removed to avoid drift per [`../_core/conventions.md`](../_core/conventions.md).)

adr-001 covers: embedded server as router/SSR (not static serving) · `/capsule` vs `/api`
namespace split · TypeScript + QuickJS route language · HTTP = data, bridge = events ·
the QuickJSBridge (4th Bridge impl) · splash + timeout readiness · deterministic port hash from
`appId` · two-process / one-command dev mode · file-based routing · server is optional ·
two bundles deployed atomically · invisible infrastructure · the `CapsuleRuntime` coordinator ·
interfaces + fakes as a mandatory pattern.
