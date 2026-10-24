#!/usr/bin/env node
// Docs: docs/contributing/commands.md, docs/contributing/environment.md
// Shows the dev environment the contributor scripts use (.env.local over your shell, see
// .env.example), or emits it for your shell so later commands in that shell see it too.
//
// Usage:
//   pnpm dev:env                                            # show the effective values + adb version
//   eval "$(pnpm -s dev:env --sh)"                          # bash / zsh: apply to this shell
//   pnpm -s dev:env --ps | Out-String | Invoke-Expression   # PowerShell: apply to this session
//
// For a single command, `pnpm with-env <cmd>` is simpler — nothing to apply.

import { existsSync } from 'node:fs'
import { capture, devEnv, envFile, pathKey, sdkTool } from './lib/env.mjs'

const KNOWN = [
  'JAVA_HOME',
  'ANDROID_HOME',
  'ANDROID_AVD_HOME',
  'AVD_NAME',
  'CAPSULE_SHELL_OVERRIDE_PATH',
  'CAPSULE_EXAMPLES_DIR',
]

const { vars, fromFile } = devEnv()
const keys = [...new Set([...KNOWN, ...Object.keys(fromFile)])].filter((key) => vars[key])
const exported = [...keys, pathKey(vars)]

const flag = process.argv[2]
if (flag === '--sh') {
  for (const key of exported) console.log(`export ${key}='${vars[key].replace(/'/g, `'\\''`)}'`)
} else if (flag === '--ps') {
  for (const key of exported) console.log(`$env:${key} = '${vars[key].replace(/'/g, "''")}'`)
} else if (flag) {
  console.error(`Unknown option ${flag}. Use --sh, --ps or nothing.`)
  process.exit(2)
} else {
  console.log(
    existsSync(envFile)
      ? `From .env.local over your shell:`
      : `No .env.local — your shell + defaults (copy .env.example to .env.local):`
  )
  for (const key of keys) console.log(`  ${key.padEnd(28)}= ${vars[key]}`)
  if (vars.ANDROID_HOME) {
    const adb = sdkTool(vars.ANDROID_HOME, 'adb')
    console.log(
      existsSync(adb)
        ? capture(adb, ['version'], { env: vars }).split(/\r?\n/)[0]
        : `adb not found at ${adb}`
    )
  }
}
