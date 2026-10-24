// Docs: docs/contributing/commands.md, docs/contributing/environment.md
// Shared helpers for the contributor scripts in scripts/: the machine config in .env.local and
// running Android/Gradle/pnpm tools the same way on Windows, macOS and Linux. Node built-ins only.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The capsule repo root. */
export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Per-machine config; git-ignored. `.env.example` (committed) documents every key. */
export const envFile = join(repoRoot, '.env.local')

/** KEY=VALUE lines → object. `#` comments and blank lines are skipped; one pair of quotes is stripped. */
export function parseEnv(text) {
  const vars = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 1) continue
    let value = line.slice(eq + 1).trim()
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
      value = value.slice(1, -1)
    }
    vars[line.slice(0, eq).trim()] = value
  }
  return vars
}

/** Defaults for keys .env.local may leave out — all relative to the repo root. */
export const defaults = {
  AVD_NAME: 'CapsuleTest',
  CAPSULE_SHELL_OVERRIDE_PATH:
    'packages/capsule-android/capsule/build/outputs/aar/capsule-release.aar',
  CAPSULE_EXAMPLES_DIR: 'examples',
}

/** Keys whose values are paths; relative ones resolve against the repo root. */
const pathKeys = new Set([
  'JAVA_HOME',
  'ANDROID_HOME',
  'ANDROID_AVD_HOME',
  'CAPSULE_SHELL_OVERRIDE_PATH',
  'CAPSULE_EXAMPLES_DIR',
])

/**
 * The effective dev environment: defaults < the shell's own variables < .env.local. The file wins
 * on purpose — it pins JAVA_HOME even when a version manager left a stale one in the shell.
 * Returns `{ vars, fromFile }`; `vars` is a full environment to hand to child processes.
 */
export function devEnv({ file = envFile, base = process.env, platform = process.platform } = {}) {
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}
  const vars = { ...defaults, ...base, ...fromFile }
  for (const key of pathKeys) {
    if (vars[key] && !isAbsolute(vars[key])) vars[key] = resolve(repoRoot, vars[key])
  }
  if (vars.JAVA_HOME) vars[pathKey(vars)] = withJavaOnPath(vars, platform)
  return { vars, fromFile }
}

/** The PATH variable's actual name — Windows spells it `Path`, and a second `PATH` would clash. */
export function pathKey(vars) {
  return Object.keys(vars).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH'
}

/** The PATH value with `$JAVA_HOME/bin` first. */
export function withJavaOnPath(vars, platform = process.platform) {
  const sep = platform === 'win32' ? ';' : ':'
  const current = vars[pathKey(vars)] ?? ''
  const javaBin = join(vars.JAVA_HOME, 'bin')
  return current.split(sep).includes(javaBin) ? current : `${javaBin}${sep}${current}`
}

/** Fails with a pointer to .env.example when a required key is missing. */
export function requireVars(vars, keys) {
  const missing = keys.filter((key) => !vars[key])
  if (missing.length > 0) {
    console.error(
      `Missing ${missing.join(', ')} — set it in .env.local (see .env.example) or in your shell.`
    )
    process.exit(1)
  }
}

const sdkTools = {
  adb: ['platform-tools', 'adb'],
  emulator: ['emulator', 'emulator'],
  avdmanager: ['cmdline-tools', 'latest', 'bin', 'avdmanager'],
}

/** Absolute path of an Android SDK tool for this OS (`.exe` / `.bat` on Windows). */
export function sdkTool(androidHome, tool, platform = process.platform) {
  const parts = sdkTools[tool]
  if (!parts) throw new Error(`Unknown SDK tool: ${tool}`)
  const suffix = platform === 'win32' ? (tool === 'avdmanager' ? '.bat' : '.exe') : ''
  return join(androidHome, ...parts) + suffix
}

/** The Gradle wrapper inside `dir` for this OS. */
export function gradlew(dir, platform = process.platform) {
  return join(dir, platform === 'win32' ? 'gradlew.bat' : 'gradlew')
}

/**
 * Windows runs `.bat`/`.cmd` files — and npm-style shims such as `pnpm` — only through a shell
 * (Node refuses to spawn batch files directly since 18.20 / 20.12).
 */
export function needsShell(command, platform = process.platform) {
  return (
    platform === 'win32' &&
    (/\.(bat|cmd)$/i.test(command) || ['pnpm', 'npm', 'npx'].includes(command))
  )
}

function shellQuote(arg) {
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg
}

function spawnArgs(command, args, platform) {
  return needsShell(command, platform)
    ? [[command, ...args].map(shellQuote).join(' '), [], { shell: true }]
    : [command, args, {}]
}

/** Runs a command to completion with inherited stdio; returns its exit code. */
export function run(command, args = [], { env, cwd } = {}) {
  const [cmd, argv, extra] = spawnArgs(command, args, process.platform)
  const result = spawnSync(cmd, argv, { stdio: 'inherit', env, cwd, ...extra })
  if (result.error) throw result.error
  return result.status ?? 1
}

/** Runs a command and returns its stdout ('' if it fails or is not installed). */
export function capture(command, args = [], { env, cwd } = {}) {
  const [cmd, argv, extra] = spawnArgs(command, args, process.platform)
  const result = spawnSync(cmd, argv, { encoding: 'utf8', env, cwd, ...extra })
  return result.status === 0 ? result.stdout : ''
}

/** Starts a long-lived process detached from this one, writing its output to the given file descriptors. */
export function startDetached(command, args, { env, stdoutFd, stderrFd }) {
  const child = spawn(command, args, { env, detached: true, stdio: ['ignore', stdoutFd, stderrFd] })
  child.unref()
  return child
}

export const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
