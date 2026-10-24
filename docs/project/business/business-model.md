---
title: "Business model"
audience: maintainer
status: current
---
# Capsule — Business Model (Server Code Push as the Funding Engine)

> The framework is free and open source. The money is a managed cloud for OTA delivery + governance +
> analytics. This is **open-core SaaS** — the same model as Expo EAS, Appflow, and the (now-dead)
> CodePush. This doc captures the commercial strategy decided in the 2026-06-15 strategy session.
>
> Technical specs for the server itself live in [../server-design/overview.md](../server-design/overview.md)
> (control plane), [../server-design/file-storage.md](../server-design/file-storage.md) (bundle delivery/CDN),
> and [../../guide/publishing.md](../../guide/publishing.md) (`codesync publish` vs `publish`). This doc is the
> *why* and the *who-pays*, not the *how*.

---

## The model in one line

**Free, open, no-lock-in framework + Ionic/F7 migration on-ramp = the funnel. A managed
"safe-deploy" OTA cloud whose flagship is canary + auto-rollback = the revenue. Sold first to
agencies. Gated on iOS shipping.**

---

## Why open source the framework at all

Lock-in fear is the #1 reason developers refuse hybrid OTA tooling (Appflow is the cautionary tale).
Open-sourcing the runtime, CLI, and sync *protocol* — and shipping a **self-hostable server** — makes
the anti-lock-in pitch real and removes adoption friction. The cloud (convenience, scale, governance,
analytics, multi-tenant) is the moat, not the protocol.

This also defuses the **CodePush death trap**: CodePush offered unlimited free hosted OTA and the
bandwidth bill helped kill it. With a self-hostable server, "free + unlimited" = *bring your own infra* —
you're never on the hook for someone else's egress.

---

## Market timing (lead with this)

- **Microsoft App Center retired (March 2025); CodePush deprecated** → many RN/Cordova/hybrid apps
  orphaned and actively shopping for a new OTA provider.
- **Appflow is expensive and Ionic-locked.**
- Wedge sentence: *"CodePush is dead, Appflow is a tax. Capsule gives you OTA with automatic
  crash-rollback, an open-source runtime, and no lock-in."*

---

## ICP — agencies first, freelancers as the funnel

Three buyers want opposite things; do not design for all three at once:

| Buyer | Wants | Role in strategy |
|---|---|---|
| **Freelancers / indie devs** | Free + simple | **Funnel.** Served by the free tier + OSS. Cheapest acquisition channel — they recommend Capsule into agencies. Keep them happy; don't design the product around them. |
| **Agencies** (many client apps) | Multi-tenant, many apps, per-client channels | **Primary ICP.** Most apps, clearest multi-tenant pain, budget, most CodePush-orphaned. Land these first. |
| **Enterprises** | Canary, SSO, audit, on-prem, SLA | **Upmarket pull.** Agencies pull you here; high-ticket, but heavier sales. |

---

## Free vs paid — what's the line

**Meter on MAU + bandwidth, NOT on deploy count.** Deploys are nearly free to serve and frequent small
deploys are the behavior to encourage. The original "1 codesync/day / 100 test versions/day" axes were
wrong — dropped. (Pricing table: [pricing.md](pricing.md).)

**Free tier shape:** unlimited production deploys, unmetered dev/staging channels, **1,000 MAU**, 3
seats, 30-day / last-10-version retention, basic metrics. Plus a **self-hostable OSS server** with no
caps (your infra). The premium *modules* (canary/auto-rollback, multi-tenant, advanced analytics, SSO,
managed signing) are the open-core "closed" parts — absent from the free hosted tier and the OSS server.

### Paid feature priorities (graded)

| Feature | Verdict |
|---|---|
| **Canary / pilot rollout + auto-rollback on crash signal** | 🥇 **Flagship.** Enterprises pay for safe deploys. The on-device crash-loop guard already exists (Phase 2 Step 7) — the server side reports crashes → halts rollout → auto-rolls-back. Monetizes work already done. |
| **Multi-app / multi-tenant per company** | 🥇 **Enterprise gold.** Exactly the agency + white-label-SaaS pain. Per-tenant channels + RBAC = top tier. |
| Device segmentation (geo, version) | ✅ Substrate canary/targeting rides on. |
| Scheduled sync | ✅ Easy paid lever. |
| Metrics + logs portal + crash analytics | ✅ Closes the loop with auto-rollback (data-driven decisions). |
| Unlimited devices/deploys/seats | ✅ Standard scaling lever. |
| **MCP server for AI** | ⚠️ **Distribution channel, not a SKU.** Make read/deploy-status MCP *free* (gets Capsule into every AI dev workflow); gate only scoped automation (CI deploys, agent-triggered prod rollout) behind paid. |
| **AI app-builder + online VSCode** | 🛑 **Scope creep, wrong customer.** Serves greenfield/new apps, not the migrate-off-Ionic ICP. A whole separate product (IDE infra, sandboxes, hosting). **Defer**, or run a stripped version purely as lead-gen — never a revenue line now. |

### Features the original list missed (enterprises pay for these)

1. **Compatibility gating** — `minNativeVersion` / bridge-contract version per bundle so a new OTA
   refuses to activate on an old shell *before* it crashes (already in `publishing.md`). Feature +
   safety story. See [ota-policy-and-liability.md](ota-policy-and-liability.md).
2. **Mandatory vs optional updates** + forced-update screens.
3. **Differential / binary-diff updates** — cuts your bandwidth bill *and* sells as "instant updates."
   Pure margin (see [../server-design/file-storage.md](../server-design/file-storage.md)).
4. **Compliance tier** — SSO/SAML, audit log, RBAC.
5. **On-prem / self-managed Enterprise license** — banks/gov/health. High-ticket; it's the OSS server +
   license + support SLA.
6. **Bundle signing / integrity** — tamper protection on the OTA payload.

---

## Store positioning (the superpower)

Two update paths (full detail in [ota-policy-and-liability.md](ota-policy-and-liability.md) and
`publishing.md`):

- **`capsule codesync publish`** → OTA, instant, no store review (most updates: JS/web bundle + QuickJS logic).
- **`capsule publish`** → automated store submission via Fastlane/store APIs (native-shell changes only).

**Headline: most updates never touch the store.** The store becomes an occasional event, not a
per-release tax. Never market this as "bypass review" — see the liability doc.

---

## Open risks tracked

1. **iOS is the gate.** Almost nobody pays for Android-only OTA. Monetization is sequenced *after* iOS.
   See roadmap re-sequencing in [../roadmap.md](../roadmap.md) and bring-up plan in
   [../../contributing/ios-bring-up.md](../../contributing/ios-bring-up.md).
2. **Apple/Google OTA policy** + the QuickJS-vs-JavaScriptCore clause → [ota-policy-and-liability.md](ota-policy-and-liability.md).
3. **Trust / reliability.** A startup running production OTA infra must earn trust: uptime, SLA, CDN
   reliability. Infra economics in [../infrastructure.md](../infrastructure.md).
