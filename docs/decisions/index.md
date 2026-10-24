---
title: "Decisions"
audience: everyone
status: current
---
# Decisions

Binding architecture decisions (ADRs). A decision here is never re-litigated in code comments or
other docs — change it by amending the ADR (dated section) or superseding it with a new one.

Decision `000N` is the ADR previously cited as `adr-00N`; both ids name the same record.

| Id | Decision | Status |
|---|---|---|
| [0001](0001-embedded-runtime.md) | Embedded runtime — loopback HTTP server + QuickJS route runtime | Decided (amended) |
| [0002](0002-capsule-ui.md) | Capsule UI — framework-agnostic native-look component layer | Proposed (foundation + `capsule add-ui` built) |
| [0003](0003-ai-and-agents.md) | On-device AI & agents — tiered `ai` API | Proposed (Tier-1 spike built) |
| [0004](0004-web-serving-transport.md) | Web-serving transport — CivetWeb on both platforms, `http://127.0.0.1` | Decided (amended 2026-10-24) |

Smaller, earlier decisions are recorded in the [decision log](log.md).

## Writing a new decision

Copy the shape of an existing ADR: Status · Date · Context · Decision · Alternatives considered ·
Consequences. Number it `000N-short-title.md`, add it to the table above and to `mkdocs.yml`.
