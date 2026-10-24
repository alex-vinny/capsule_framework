---
title: "OTA policy and liability"
audience: maintainer
status: current
---
# OTA Policy & Liability (Apple / Google)

> Where Capsule's responsibility ends and the customer's begins, how store policy bounds OTA, and the
> one clause to keep an eye on. Decided in the 2026-06-15 strategy session.

---

## Liability posture: you are a tool vendor

**If a customer uses OTA to change their app's behavior in violation of store policy, that is the
customer's problem, not Capsule's.** The customer holds the developer account, signs the binary, agreed
to Apple's/Google's developer terms, and submits the app. Stores enforce against the *app/account*, not
the tool that produced the bundle. CodePush, Expo Updates, and Appflow all enable exactly this — none is
liable for what customers push. Same posture for Capsule.

That default only holds if you don't undermine it:

1. **Terms of Service + Acceptable Use Policy** (non-negotiable before charging): the customer is
   solely responsible for store compliance; Capsule may suspend accounts pushing policy-violating
   updates. Standard SaaS shield.
2. **Never market "bypass review."** Position = *"ship fixes and content fast, within policy"* —
   never *"skip the store."* Marketing language is legally and reputationally load-bearing.
3. **Warn + require acknowledgment** (below).

---

## Two kinds of guardrail

### Deterministic — capability gating (BUILD THIS; it's also a feature)

You can detect *exactly* when an OTA needs something the installed shell doesn't have: a new
permission, a new native plugin, or a bridge-contract / `minNativeVersion` bump. This is deterministic.
The tool **blocks the OTA** and says *"this needs a new store release — run `capsule publish`."*

- Same mechanism as `minNativeVersion` gating in [../../guide/publishing.md](../../guide/publishing.md).
- Doubles as the strongest safety guardrail and a sellable governance feature.

### Best-effort — semantic policy warning (warn + acknowledge, don't promise)

You **cannot** auto-detect a "primary purpose change" — that's semantic. So the diff tool surfaces
*signals* (new top-level routes, large bundle delta, anything resembling an added payment flow or
external-purchase link — Apple's hot button) and shows a **one-time "Confirm this update complies with
store policy"** acknowledgment.

- Moves responsibility explicitly onto the customer.
- Creates an **audit-trail entry** (who acknowledged what, when) — itself an enterprise feature.

---

## The clause to keep an eye on: QuickJS vs JavaScriptCore

Apple's developer agreement permits OTA **interpreted code** as long as it doesn't change the app's
primary purpose — but historically references code run by **Apple's WebKit / JavaScriptCore**.

| Capsule surface | Engine | Status |
|---|---|---|
| Web bundle (UI) | WKWebView (WebKit) | ✅ Squarely allowed |
| Server route runtime | **QuickJS** (third-party JS engine) | ⚠️ The gray edge of the clause |

**Reassuring precedent:** React Native's Hermes engine is also *not* JavaScriptCore, and CodePush
OTA-updated Hermes/RN bundles for years with no Apple action. In practice Apple tolerates non-JSC
interpreted code over OTA as long as the primary-purpose rule holds.

**Conservative framing to maintain:** position QuickJS server routes as handling *logic/data*, not the
app's *nature*. Keep an eye on the clause; don't build messaging that depends on its loosest reading.

---

## Google

Looser than Apple on OTA, but watching for: dynamic code that circumvents the permission model, or
behavior that materially differs from the reviewed listing. The same capability-gating guardrail
(no new permissions/native via OTA) keeps you onside.

---

## Summary

- **Customer owns compliance.** Protect the default with a ToS/AUP and non-evasion marketing.
- **Build the deterministic capability gate** (real guardrail + governance feature).
- **Treat the semantic policy check as best-effort + acknowledgment + audit log.**
- **Watch the QuickJS-OTA clause**; Hermes/CodePush precedent says it's been fine.
