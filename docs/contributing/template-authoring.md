---
title: "Template authoring"
audience: contributor
status: current
code:
  - packages/cli/src/commands/init.ts
  - packages/cli/templates/**
---
# Authoring a Capsule Template

> How to create a scaffold template for `capsule init`. A **template** is a starter web app
> that giget copies into a new project — distinct from a **plugin** (a native SDK wrapper;
> see [plugin-authoring.md](plugin-authoring.md)). The official set lives in the
> `templates/` repo; you can also point `init` at any custom source.

## What a template is

A template's files **become the user's generated project verbatim** (giget copies the
subdir). So a template is just a minimal, runnable Capsule app for one framework. Mirror an
existing one — `../../templates/capsule-react-ts-template/` is the reference.

## Anatomy (the contract)

| File / dir | Required | Notes |
|------------|----------|-------|
| `package.json` | ✅ | Depends on `@capsule/core`; framework + bundler deps; standard scripts. |
| web entry | ✅ | `index.html` (Vite-based) or the framework's equivalent. |
| `src/` | ✅ | The app. Convention: **Home tab + Server tab** (`bridge.call` + `GET /api/ping`) so all templates demo the same surface (see [examples/README.md](https://github.com/alex-vinny/capsule_framework/blob/main/examples/README.md)). |
| bundler config | ✅ | `vite.config.ts`, `angular.json`, etc. — non-Vite declares `web.devCommand`/`buildCommand` in `capsule.config.ts`. |
| `tsconfig.json` | for TS | — |
| `.gitignore` | ✅ | `node_modules/`, build output, `.capsule/`. |
| **`README.md`** | **recommended** | The **generated app's** readme: what it is + how to `dev`/`build`/`run`. **Portable — no machine-specific absolute paths.** Don't restate framework or Capsule docs. |
| `capsule.config.ts` | optional | `capsule init`/`add` generate it if absent; if a custom template ships its own, `init` **won't clobber it**. |

> No machine-specific files in a template — same rule as the `examples/` folder. The README and
> all paths must be portable.

## Using / registering a template

```powershell
# Official (manifest -> templates-repo subdir):
capsule init my-app --template react-ts
# Any giget source (GitHub/GitLab/Bitbucket/tarball):
capsule init my-app --template gh:acme/capsule-tpl#v2
# Local path:
capsule init my-app --template ./my-local-template
```

**Add an official template** (no CLI release needed): drop the subdir into the `templates/`
repo and add a row to `templates/manifest.json`:

```json
{ "value": "solid-ts", "title": "Solid + TypeScript", "dir": "capsule-solid-ts-template" }
```

Resolution (from [cli.md](../reference/cli.md) `init`): **dev** reads local `templates/manifest.json`
and copies the subdir; **prod** fetches the manifest from the templates repo and giget pulls
`gh:<repo>/<dir>#<branch>`; the bundled list is the offline fallback.

## Pending (tracked in [roadmap.md](../project/roadmap.md) §Template extensibility)

- Company/internal template registry via `~/.capsulerc` (adds entries to the picker).
- Confirm the published templates-repo org/name (`TEMPLATES_REPO` in `init.ts`) at GitHub publish.

All 7 official templates now ship a portable `README.md` (the generated app's readme).

See also: [cli.md](../reference/cli.md) (`init` implementation), [examples/README.md](https://github.com/alex-vinny/capsule_framework/blob/main/examples/README.md)
(the shared Home/Server demo convention).
