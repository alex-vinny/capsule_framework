#!/usr/bin/env node
// Docs: docs/contributing/commands.md, docs/contributing/environment.md
// Runs one command with the dev environment applied (.env.local over your shell — JAVA_HOME first
// on PATH, CAPSULE_SHELL_OVERRIDE_PATH, ANDROID_HOME, …). Replaces dot-sourcing env.ps1.
//
// Usage (from the repo root):
//   pnpm with-env --cwd packages/capsule-android gradlew testDebugUnitTest
//   pnpm with-env --cwd examples/react-ts node ../../packages/cli/dist/index.js build android
//
// `gradlew` resolves to the wrapper in --cwd (gradlew.bat on Windows); `adb`, `emulator` and
// `avdmanager` resolve to $ANDROID_HOME's copies, so none of them has to be on PATH.

import { resolve } from 'node:path'
import { devEnv, gradlew, repoRoot, run, sdkTool } from './lib/env.mjs'

const argv = process.argv.slice(2)
let cwd = repoRoot
if (argv[0] === '--cwd') {
  if (!argv[1]) usage()
  cwd = resolve(repoRoot, argv[1])
  argv.splice(0, 2)
}
if (argv[0] === '--') argv.shift()
if (argv.length === 0) usage()

const [command, ...args] = argv
const { vars } = devEnv()
process.exit(run(resolveCommand(command), args, { env: vars, cwd }))

function resolveCommand(name) {
  if (name === 'gradlew') return gradlew(cwd)
  if (['adb', 'emulator', 'avdmanager'].includes(name) && vars.ANDROID_HOME)
    return sdkTool(vars.ANDROID_HOME, name)
  return name
}

function usage() {
  console.error('Usage: pnpm with-env [--cwd <dir>] <command> [args...]')
  process.exit(2)
}
