## What changed and why

<!-- One concern per PR. Link the issue or ADR it implements. -->

## How it was tested

<!-- Which layers you ran (JS · Kotlin JVM · Android instrumented · Swift · docs) and anything checked by hand. -->

## Checklist

- [ ] Tests added or updated for every layer this touches (see CONTRIBUTING.md → "Tests")
- [ ] `pnpm verify` is green (plus `pnpm verify:android` / `pnpm verify:ios` if native code changed)
- [ ] Formatted — `pnpm format`, and `pnpm format:check` is clean
- [ ] Docs updated for what changed, and `pnpm docs:check` is green
- [ ] Roadmap / STATE updated if a status or the next action changed
- [ ] No machine-absolute paths, secrets or session notes in the diff
