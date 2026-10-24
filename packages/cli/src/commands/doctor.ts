// Docs: docs/reference/cli.md
import { Command } from 'commander'
import chalk from 'chalk'
import { execa } from 'execa'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig, type CapsuleConfig } from '../config.js'
import { compareVersions, type Pins } from '../platform/requirements.js'
import { checkStoreRequirements, hasViolation, printStoreReport } from '../platform/store-check.js'

interface Check {
  name: string
  command: string
  args: string[]
  parse?: (stdout: string) => string
  /** Minimum dotted version, or 'present' when any version will do. */
  require: string
}

export type CheckOutcome =
  { ok: true; version: string } | { ok: false; version?: string; reason: string }

/**
 * Judges one tool from its command result: missing (spawn failed / non-zero exit), too old (the
 * first dotted number in the output is below `require`), or fine.
 */
export function evaluateCheck(
  check: Pick<Check, 'parse' | 'require'>,
  result: { failed?: boolean; exitCode?: number; stdout?: string }
): CheckOutcome {
  if (result.failed || (result.exitCode ?? 0) !== 0) return { ok: false, reason: 'not found' }
  const stdout = result.stdout ?? ''
  const version = check.parse ? check.parse(stdout) : stdout.trim()
  if (check.require === 'present') return { ok: true, version }
  const found = /\d+(?:\.\d+)*/.exec(version)?.[0]
  if (!found)
    return { ok: false, version, reason: `cannot read the version (need ≥ ${check.require})` }
  if (compareVersions(found, check.require) < 0) {
    return { ok: false, version, reason: `${found} is too old (need ≥ ${check.require})` }
  }
  return { ok: true, version }
}

const CHECKS: Check[] = [
  {
    name: 'Node.js',
    command: 'node',
    args: ['--version'],
    parse: (s) => s.trim().replace('v', ''),
    require: '22.12', // commander 15 (the CLI's engines field)
  },
  {
    name: 'pnpm',
    command: 'pnpm',
    args: ['--version'],
    parse: (s) => s.trim(),
    require: '9',
  },
  {
    name: 'Java (JDK)',
    command: 'java',
    args: ['--version'],
    parse: (s) => s.split('\n')[0],
    require: '17',
  },
  {
    name: 'ADB',
    command: 'adb',
    args: ['--version'],
    parse: (s) => s.split('\n')[0],
    require: 'present',
  },
]

/** The local Xcode and iOS SDK versions (macOS only), so App Store toolchain rules can be checked. */
async function appleToolchainPins(): Promise<Pins> {
  if (process.platform !== 'darwin') return {}
  const pins: Pins = {}
  const xcode = await execa('xcodebuild', ['-version'], { reject: false })
  const version = /Xcode\s+([\d.]+)/.exec(xcode.stdout ?? '')?.[1]
  if (version) pins['ios.xcode'] = version
  const sdk = await execa('xcrun', ['--sdk', 'iphoneos', '--show-sdk-version'], { reject: false })
  const sdkVersion = (sdk.stdout ?? '').trim()
  if (/^[\d.]+$/.test(sdkVersion)) pins['ios.sdk'] = sdkVersion
  return pins
}

/** The store-requirements section; returns true when a rule is violated. */
async function checkStore(projectRoot: string): Promise<boolean> {
  console.log(chalk.bold('\nStore requirements\n'))
  let config: CapsuleConfig
  try {
    config = await loadConfig(projectRoot)
  } catch (err) {
    console.log(
      chalk.red('  ✗'),
      chalk.bold('capsule.config.ts'),
      chalk.red((err as Error).message)
    )
    return false
  }
  const report = checkStoreRequirements(config, new Date(), await appleToolchainPins())
  if (report.findings.length === 0) {
    console.log(chalk.gray('  –'), 'No android or ios section configured — nothing to check.')
  }
  printStoreReport(report)
  console.log(chalk.gray(`\n  Rules reviewed ${report.reviewed} (bundled with this CLI).`))
  return hasViolation(report)
}

const command = new Command('doctor')
  .description('Diagnose the development environment and check store requirements')
  .option('--strict', 'exit non-zero when the app violates a store requirement')
  .action(async (opts: { strict?: boolean }) => {
    console.log(chalk.bold('\nCapsule Environment Check\n'))

    let allGood = true

    for (const check of CHECKS) {
      const result = await execa(check.command, check.args, { reject: false })
      const outcome = evaluateCheck(check, result)
      if (outcome.ok) {
        console.log(chalk.green('  ✓'), chalk.bold(check.name), chalk.gray(outcome.version))
      } else {
        console.log(chalk.red('  ✗'), chalk.bold(check.name), chalk.red(outcome.reason))
        allGood = false
      }
    }

    try {
      const { stdout } = await execa('adb', ['devices'])
      const devices = stdout
        .split('\n')
        .slice(1)
        .filter((l) => l.trim() && !l.includes('offline'))
      if (devices.length > 0) {
        console.log(
          chalk.green('  ✓'),
          chalk.bold('Android device/emulator'),
          chalk.gray(devices.length + ' connected')
        )
      } else {
        console.log(
          chalk.yellow('  ⚠'),
          chalk.bold('Android device/emulator'),
          chalk.yellow('none connected')
        )
      }
    } catch {
      console.log(chalk.red('  ✗'), chalk.bold('ADB devices'), chalk.red('failed'))
    }

    const override = process.env.CAPSULE_SHELL_OVERRIDE_PATH
    if (override) {
      console.log(chalk.green('  ✓'), chalk.bold('Shell override'), chalk.gray(override))
    } else {
      console.log(
        chalk.yellow('  ⚠'),
        chalk.bold('Shell override'),
        chalk.yellow('CAPSULE_SHELL_OVERRIDE_PATH not set (required for Phase 1)')
      )
    }

    // Store rules only make sense inside an app (a capsule.config.ts in the current directory).
    const projectRoot = process.cwd()
    const violated = existsSync(join(projectRoot, 'capsule.config.ts'))
      ? await checkStore(projectRoot)
      : false

    console.log()
    if (violated && opts.strict) {
      console.log(chalk.red('A store requirement is violated (--strict).\n'))
      process.exit(1)
    }
    if (allGood) {
      console.log(chalk.green('All checks passed.\n'))
    } else {
      console.log(chalk.red('Some checks failed. Fix the above before continuing.\n'))
      process.exit(1)
    }
  })

export default command
