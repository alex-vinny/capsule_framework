// Docs: docs/contributing/upkeep.md
// Store-requirement checks for an app — shared by `capsule doctor` (full report) and
// `capsule build` (warnings only). The decisions live in pure functions so tests cover them;
// printStoreReport() is the only part that writes to the console.

import chalk from 'chalk'
import type { CapsuleConfig } from '../config.js'
import {
  evaluateRequirements,
  loadRequirements,
  requirementsAgeDays,
  REQUIREMENTS_STALE_DAYS,
  type Finding,
  type Pins,
  type PlatformRequirements,
} from './requirements.js'

export interface StoreReport {
  findings: Finding[]
  /** Date the CLI's bundled rules were last reviewed. */
  reviewed: string
  ageDays: number
  /** True once the bundled rules are older than REQUIREMENTS_STALE_DAYS. */
  stale: boolean
}

/** The values in an app's config that store rules gate. */
export function configPins(config: CapsuleConfig): Pins {
  const pins: Pins = {}
  if (config.android) {
    pins['android.targetSdk'] = config.android.targetSdk
    pins['android.compileSdk'] = config.android.compileSdk
  }
  if (config.ios?.deployment !== undefined) pins['ios.deploymentTarget'] = config.ios.deployment
  return pins
}

/**
 * Evaluates the rules that apply to the platforms the app configures (Android rules need an
 * `android` section, App Store rules an `ios` one). `extraPins` adds values the config doesn't
 * hold, such as the local Xcode version.
 */
export function checkStoreRequirements(
  config: CapsuleConfig,
  today: Date = new Date(),
  extraPins: Pins = {},
  requirements: PlatformRequirements = loadRequirements()
): StoreReport {
  const rules = requirements.rules.filter((rule) =>
    rule.store === 'google-play' ? config.android !== undefined : config.ios !== undefined
  )
  const ageDays = requirementsAgeDays(requirements, today)
  return {
    findings: evaluateRequirements(rules, { ...configPins(config), ...extraPins }, today),
    reviewed: requirements.reviewed,
    ageDays,
    stale: ageDays > REQUIREMENTS_STALE_DAYS,
  }
}

/** Findings a build should warn about: a store would reject the app now or soon. */
export function actionableFindings(report: StoreReport): Finding[] {
  return report.findings.filter((f) => f.status === 'violated' || f.status === 'due-soon')
}

export const hasViolation = (report: StoreReport): boolean =>
  report.findings.some((f) => f.status === 'violated')

export type FindingLevel = 'ok' | 'warn' | 'error' | 'info'

export function findingLevel(finding: Finding): FindingLevel {
  switch (finding.status) {
    case 'ok':
      return 'ok'
    case 'violated':
      return 'error'
    case 'due-soon':
      return 'warn'
    default:
      return 'info'
  }
}

export function staleMessage(report: StoreReport): string {
  return `Store rules in this CLI were last reviewed ${report.reviewed} (${report.ageDays} days ago) — update @capsule/cli for current requirements.`
}

const SYMBOLS: Record<FindingLevel, string> = {
  ok: chalk.green('  ✓'),
  warn: chalk.yellow('  ⚠'),
  error: chalk.red('  ✗'),
  info: chalk.gray('  –'),
}

/** Prints findings (all of them, or only actionable ones) plus the staleness warning. */
export function printStoreReport(report: StoreReport, opts: { actionableOnly?: boolean } = {}) {
  const findings = opts.actionableOnly ? actionableFindings(report) : report.findings
  for (const finding of findings) {
    const level = findingLevel(finding)
    const text = level === 'error' ? chalk.red(finding.message) : finding.message
    console.log(SYMBOLS[level], text)
    if (level !== 'ok') console.log(chalk.gray(`      ${finding.source}`))
  }
  if (report.stale) console.log(chalk.yellow('  ⚠'), chalk.yellow(staleMessage(report)))
}

/**
 * `capsule build`'s hook: prints violated and due-soon rules, never fails the build — the store
 * rejects the upload, not us, and a debug build for a device is still useful.
 */
export function warnStoreRequirements(config: CapsuleConfig, today: Date = new Date()) {
  try {
    const report = checkStoreRequirements(config, today)
    if (actionableFindings(report).length === 0 && !report.stale) return
    console.log(chalk.bold('\nStore requirements'))
    printStoreReport(report, { actionableOnly: true })
    console.log()
  } catch (err) {
    console.log(chalk.yellow('  ⚠'), `Store requirements not checked: ${(err as Error).message}`)
  }
}
