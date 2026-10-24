#!/usr/bin/env node
// Docs: docs/contributing/commands.md
// Manages the contributor Android emulator: start | stop | status.
//
// Usage:
//   pnpm dev:emulator status
//   pnpm dev:emulator start [--fresh] [--no-wait] [--headless] [--gpu host] [--avd <name>]
//   pnpm dev:emulator stop
//
// start   Launches the AVD detached (output to a log file in the temp dir) and waits for a FULL
//         boot: sys.boot_completed=1 AND a working `pm list packages`. boot_completed alone can
//         flip while `pm` is still down, and connectedDebugAndroidTest then fails with
//         "Can't find service: package".
//         Software rendering (swiftshader_indirect) by default: host-GPU mode hangs at boot on
//         GPUs without working Vulkan/OpenGL (e.g. Intel UHD). --gpu host if yours is fine.
//         --fresh cold-boots with -no-snapshot-load -wipe-data to recover a wedged snapshot.
// stop    Graceful shutdown (`adb emu kill`, keeps the snapshot).
//
// Needs ANDROID_HOME (and ANDROID_AVD_HOME if your AVDs are not in the default place); the AVD
// name defaults to AVD_NAME. All from .env.local or your shell — see .env.example.

import { openSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { capture, devEnv, requireVars, run, sdkTool, sleep, startDetached } from './lib/env.mjs'

const BOOT_TIMEOUT_S = 360
const POLL_S = 3

const argv = process.argv.slice(2)
const action = argv[0] && !argv[0].startsWith('--') ? argv.shift() : 'status'
const opts = {
  fresh: false,
  wait: true,
  headless: false,
  gpu: 'swiftshader_indirect',
  avd: undefined,
}
while (argv.length > 0) {
  const flag = argv.shift()
  if (flag === '--fresh') opts.fresh = true
  else if (flag === '--no-wait') opts.wait = false
  else if (flag === '--headless') opts.headless = true
  else if (flag === '--gpu') opts.gpu = argv.shift()
  else if (flag === '--avd') opts.avd = argv.shift()
  else fail(`Unknown option ${flag}`)
}

const { vars } = devEnv()
requireVars(vars, ['ANDROID_HOME'])
const adb = sdkTool(vars.ANDROID_HOME, 'adb')
const avd = opts.avd ?? vars.AVD_NAME
const adbOut = (...args) => capture(adb, args, { env: vars }).trim()

/** Boot readiness, probed only once an emulator is online (getprop on no device just errors). */
function signals() {
  const online = adbOut('devices')
    .split(/\r?\n/)
    .some((line) => /^emulator-\d+\s+device$/.test(line.trim()))
  if (!online) return { online, ready: false }
  const bootCompleted = adbOut('shell', 'getprop', 'sys.boot_completed')
  const bootAnim = adbOut('shell', 'getprop', 'init.svc.bootanim')
  const pm = adbOut('shell', 'pm', 'list', 'packages').includes('package:')
  // bootanim is informational only: with -no-boot-anim or odd GPU states it is unreliable.
  return { online, bootCompleted, bootAnim, pm, ready: bootCompleted === '1' && pm }
}

async function start() {
  if (signals().ready && !opts.fresh) {
    console.log('Emulator already fully booted. Nothing to do.')
    return run(adb, ['devices'], { env: vars })
  }
  const args = ['-avd', avd, '-gpu', opts.gpu, '-no-audio']
  if (opts.fresh) args.push('-no-snapshot-load', '-wipe-data')
  if (opts.headless) args.push('-no-window')

  const log = join(tmpdir(), `capsule-emulator-${avd}.log`)
  const fd = openSync(log, 'a')
  if (opts.fresh) console.log('Cold boot: -no-snapshot-load -wipe-data')
  console.log(`Starting emulator '${avd}' (gpu=${opts.gpu}) in the background…\n  log: ${log}`)
  startDetached(sdkTool(vars.ANDROID_HOME, 'emulator'), args, {
    env: vars,
    stdoutFd: fd,
    stderrFd: fd,
  })
  if (!opts.wait) {
    console.log('Launched (--no-wait). Check readiness with: pnpm dev:emulator status')
    return 0
  }

  console.log('Waiting for FULL boot (boot_completed + pm service)…')
  for (let waited = 0; waited < BOOT_TIMEOUT_S; waited += POLL_S) {
    const s = signals()
    if (s.ready) {
      console.log('Emulator ready.')
      return run(adb, ['devices'], { env: vars })
    }
    const state = s.online
      ? `boot_completed=${s.bootCompleted} bootanim=${s.bootAnim} pm=${s.pm}`
      : 'attaching…'
    console.log(`  [${String(waited).padStart(3)}s] ${state}`)
    await sleep(POLL_S * 1000)
  }
  console.error('Emulator did not fully boot in time. If pm never appears the snapshot is wedged:')
  console.error('  pnpm dev:emulator start --fresh')
  return 1
}

async function stop() {
  console.log('Killing emulator…')
  run(adb, ['emu', 'kill'], { env: vars })
  await sleep(2000)
  return run(adb, ['devices'], { env: vars })
}

function status() {
  run(adb, ['devices'], { env: vars })
  const s = signals()
  if (!s.online) {
    console.log('No emulator online.')
    return 0
  }
  console.log(
    `boot_completed=${s.bootCompleted}  bootanim=${s.bootAnim}  pm=${s.pm}  =>  ${s.ready ? 'READY' : 'NOT READY'}`
  )
  return 0
}

const actions = { start, stop, status }
if (!actions[action]) fail(`Unknown action ${action}`)
process.exit(await actions[action]())

function fail(message) {
  console.error(
    `${message}. Usage: pnpm dev:emulator <start|stop|status> [--fresh] [--no-wait] [--headless] [--gpu <mode>] [--avd <name>]`
  )
  process.exit(2)
}
