---
title: "Pricing, payments and trial"
audience: maintainer
status: draft
---
# Capsule — Pricing, Payments & Trial

> Illustrative pricing decided in the 2026-06-15 strategy session. **Validate against 5–10 customer
> interviews before locking numbers.** Strategy context: [business-model.md](business-model.md).

---

## Pricing principle

**Meter on MAU (monthly active devices) + bandwidth — never on deploy count.** Deploys are cheap to
serve; frequent small deploys are the behavior to encourage. Bandwidth is the real cost driver (see
[../infrastructure.md](../infrastructure.md)).

Anchors: Appflow Live Updates ~$499+/mo; Expo EAS has a free tier + usage; the dead-CodePush gap is the
opening.

---

## Tiers

| Tier | Price | MAU | Seats | Apps | Key features |
|---|---|---|---|---|---|
| **Community (self-host)** | Free, OSS | Unlimited (your infra) | n/a | n/a | Run the OSS server. No canary/analytics/multi-tenant/SSO modules. |
| **Free (hosted)** | $0 | 1,000 | 3 | 1 | Unlimited deploys, unmetered staging, 30-day / last-10 retention, basic metrics |
| **Pro** | ~$49/mo | 10,000 | 5 | 3 | Scheduled sync, basic canary, device segments, metrics + logs portal |
| **Team** | ~$199/mo | 50,000 | 15 | 10 | **Canary + auto-rollback**, multi-tenant channels, audit log, priority support |
| **Business** | ~$499/mo | 200,000 | unlimited | unlimited | SSO/SAML, RBAC, differential updates, managed signing |
| **Enterprise** | Custom | unlimited | unlimited | unlimited | On-prem / self-managed license, SLA, data residency, support contract |

- **Overage:** ~$10–20 per additional 1,000 MAU. (Meter the bandwidth axis, not deploys.)
- **Annual billing:** 2 months free (~17% off) — pulls cashflow forward for a self-funded project.

---

## Trial

- **Free tier forever** (product-led growth — the freelancer/indie on-ramp).
- **14-day trial of Team-tier features, no credit card.** Converts agencies who hit multi-tenant /
  canary needs.

---

## Payment processor

**Start with a Merchant-of-Record (Paddle or Lemon Squeezy), not raw Stripe.**

- The hard part of international SaaS isn't taking payments — it's **global sales-tax / VAT
  compliance.** Raw Stripe makes *you* the merchant: you owe VAT registration/filing across many
  jurisdictions.
- **Paddle / Lemon Squeezy are the merchant of record** — they collect and remit VAT/tax worldwide for
  you, for ~5% + fees. Worth it for a solo founder until there's finance headcount.
- **Migrate to Stripe Billing later** at scale, when you want fine-grained **usage-based metering**
  (MAU/bandwidth) control and can absorb tax compliance.

| Need | Pick |
|---|---|
| Solo founder, global sales, no tax team | **Paddle / Lemon Squeezy** (MoR) |
| Scale, usage-based metering, own the stack | **Stripe Billing** |

---

## Metering implementation note

MAU and bandwidth are computed from CodeSync check-in / download events already flowing through the
control plane (see [../server-design/workers.md](../server-design/workers.md) job queues and
[../server-design/database.md](../server-design/database.md)). Bill on the metered axis; expose current
usage in the dashboard so customers self-serve upgrades before hitting hard caps.
