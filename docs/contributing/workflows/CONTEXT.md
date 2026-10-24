---
title: "Workflows"
audience: contributor
status: current
---
# CONTEXT — workflows/ (Layer 2: recurring agent procedures)

Stage contracts for multi-step tasks an agent performs repeatedly. Each subfolder is one
procedure with an **Inputs / Process / Outputs** contract (ICM "configure the factory"):
load the Inputs, run the Process, produce the Outputs, stop at the human checkpoints.
Workspace map: `../CONTEXT.md`. Conventions: `../../_core/conventions.md`.

| Workflow | When to run it |
|----------|----------------|
| `add-native-api/`  | Add a new native capability to `@capsule/core` (interface → Android → demo → tests). |
| `author-plugin/`   | Author a third-party SDK-wrapper plugin (manifest + Android/iOS/web bridge). *Forward contract — plugin CLI not built yet.* |
| `upkeep-sweep/`    | Periodic dependency/tooling audit across the three version sources. |

> These are *how-to* contracts, not task output — they hold no one-off results. A workflow's
> Outputs are edits to real source + docs, not a new artifact folder (this is a product repo).
