---
title: "Infrastructure and hosting economics"
audience: maintainer
status: planned
---
# Infrastructure & Hosting Economics (Server Code Push)

> Where to run the Capsule Cloud, and why bandwidth — not compute — is the decision that makes or breaks
> OTA margins. Decided in the 2026-06-15 strategy session. The *application* stack (API, dashboard,
> Postgres, Redis, MinIO/S3, workers) is specified in [../Server/](server-design/overview.md); this doc
> is about **deployment targets and cost**.

---

## The one fact that dominates everything

**OTA = shipping bundles to thousands of devices. Bandwidth is the dominant variable cost.** And cloud
egress is where AWS/Azure quietly destroy OTA margins:

| Provider | Egress (approx) |
|---|---|
| AWS / Azure | ~$0.08–0.09 / GB |
| **Hetzner** | ~**€1 / TB** (≈ $0.001/GB) + generous included traffic |
| **Cloudflare R2** | **$0 egress** (S3-compatible) |

That's a ~100× difference on the exact operation the product does most. **Do not serve OTA bundles from
AWS/Azure egress** unless a customer is paying a premium that covers it.

---

## Split the planes

| Plane | What runs | Where | Why |
|---|---|---|---|
| **Data plane** (bandwidth-heavy) | Bundle storage + delivery (the actual OTA downloads) | **Cloudflare R2** (zero egress) and/or **Hetzner behind Bunny.net / Cloudflare CDN** | Margin lives or dies here. `file-storage.md` already recommends R2. |
| **Control plane** (low bandwidth) | API, dashboard, Postgres, Redis, BullMQ workers | **Hetzner k8s (k3s / Talos)** to start | Keeps fixed cost near-zero while bootstrapping. |

**Rule of thumb:** control plane wherever is convenient; **data plane wherever egress is cheapest.**

---

## Recommended starting topology

- **Bundle storage:** Cloudflare R2 (content-addressed, per `server-design/file-storage.md`).
- **CDN:** Cloudflare or Bunny.net in front of R2/origin for global edge delivery + cheap egress.
- **Control plane:** k8s nodes running the `server-design/overview.md` stack (Postgres, Redis, API,
  dashboard, workers) translated from `docker-compose` to manifests/Helm.
- **Differential updates** (binary diffs) on the data plane cut bandwidth further **and** sell as a
  premium "instant updates" feature — double win on the cost axis.

---

## Available infrastructure (mapped 2026-06-15)

The creator's actual clusters/machines, and how each maps to a role (the maintainer's hosted CodeSync
offer — self-hosters bring their own; see `server-design/overview.md`).

| Resource | Specs / cost | Already running | Capsule role |
|---|---|---|---|
| **`aks-azure`** (own) | ~$500/mo subscription | Keycloak, Postgres, pgAdmin, MongoDB (min resources) | **Control plane.** Reuse the existing **Postgres** for the CodeSync DB and **Keycloak** for auth — see below. |
| **`aks-ssdnodes`** | 64 GB RAM / 1 TB disk, **temporary (3-mo trial)**, shared | — | **Staging / load-test only.** Great for bringing up + load-testing the server stack; **never persistent production state** (expires, shared). |
| **k0s box** | 8 GB RAM / 50 GB disk | — | **Dev / single-node.** Run the whole `docker-compose` stack as one local instance, or a CI/runner. Too small for production. |
| **Cloudflare R2 + CDN** | $0 egress | — | **Data plane** (bundle storage + delivery). Add this — it's the margin decision. |

### Reuse what's already on `aks-azure`

- **Postgres** → point `DATABASE_URL` at the existing instance (separate database/schema for CodeSync).
  Saves standing up a new DB; watch resource limits ("min resources" today — may need a bump).
- **Keycloak** → a genuine upgrade over the Server doc's built-in email/password JWT auth. Keycloak
  gives **OIDC + SAML SSO** out of the box, which `server-design/overview.md` lists as "roadmap" and
  which is a **paid enterprise feature** in the business model. Wire the API/dashboard to Keycloak as
  the IdP instead of (or alongside) the built-in auth.
- **MongoDB / pgAdmin** → not required by the design (it's Postgres-first); leave as-is.

### Critical caveat: keep bundle egress OFF aks-azure

The control plane on `aks-azure` is fine cost-wise because it's **low bandwidth** — device check-ins are
many small JSON requests (cached in Redis), not the heavy bytes. **The bundle downloads — the only
bandwidth that matters — must go to R2/CDN, never AKS/Azure egress** (~$0.08/GB would wreck margins).
This split is exactly the data-plane/control-plane separation above.

### Suggested bring-up sequence

1. **Dev:** run the full stack via `docker-compose` on the k0s box (or locally) against a scratch DB.
2. **Staging / load-test:** deploy to `aks-ssdnodes` (64 GB) while it lasts; hammer the check + download
   paths; validate R2/CDN delivery.
3. **Production control plane:** `aks-azure`, reusing Postgres + Keycloak; bundles on R2 + CDN.
4. Reserve a migration path off `aks-ssdnodes` before its 3-month trial expires.

---

## When to reach for AWS / Azure

You have Azure + AWS accounts and k8s skills — keep them for **enterprise-driven** needs, billed
accordingly:

- A customer requires a specific cloud / region for **data residency** or procurement reasons.
- **On-prem / self-managed** Enterprise license: ship the same k8s manifests for the customer to run in
  their own AKS/EKS/on-prem cluster (high-ticket — see [business/business-model.md](business/business-model.md)).

Until then, AWS/Azure are *options you charge for*, not the default.

---

## Reliability is the trust currency

A startup running production OTA infra must earn trust: uptime, CDN reliability, and — eventually — an
SLA for paid tiers. Atomic two-slot bundles + on-device crash-loop rollback (Phase 2 Step 7) already
protect the *device* side; the *service* side needs monitoring, health checks, and staged rollout of
the control plane itself.
