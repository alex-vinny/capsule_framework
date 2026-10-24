// Docs: docs/contributing/upkeep.md
// Store requirements — the minimum SDK / toolchain levels Google Play and the App Store accept.
//
// The rules are curated by hand in requirements.json (neither store publishes them in a
// machine-readable form); `pnpm upkeep` watches the source pages and flags when they change.
// evaluateRequirements() is pure: `capsule doctor`, `capsule build` and the upkeep report all
// call it with their own pins (an app's config, or the framework's own defaults).

import requirementsJson from './requirements.json' with { type: 'json' }

export type Store = 'google-play' | 'app-store'

export type RequirementField =
  'android.targetSdk' | 'android.compileSdk' | 'ios.deploymentTarget' | 'ios.xcode' | 'ios.sdk'

export interface PlatformRule {
  id: string
  store: Store
  field: RequirementField
  /** Lowest accepted value: an API level (36) or a dotted version ("26", "13.0"). */
  min: number | string
  /** First day the rule applies, YYYY-MM-DD. */
  effective: string
  /** `existing` rules keep a published app visible; `new-and-updates` gate every submission. */
  appliesTo: 'new-and-updates' | 'existing'
  /** Last day a deadline extension can be requested or runs to, YYYY-MM-DD. */
  extensionUntil?: string
  source: string
  note?: string
}

/** A store page whose content hash `pnpm upkeep` compares to spot new rules. */
export interface PageWatch {
  id: string
  url: string
  /** sha256 of the page's main text when it was last reviewed; "" = never reviewed. */
  sha256: string
  /** Date of that review, YYYY-MM-DD; "" = never reviewed. */
  reviewed: string
}

export interface PlatformRequirements {
  /** Date the rules were last checked against their sources, YYYY-MM-DD. */
  reviewed: string
  rules: PlatformRule[]
  watch: PageWatch[]
}

export type FindingStatus = 'ok' | 'violated' | 'due-soon' | 'upcoming' | 'unknown'

export interface Finding {
  ruleId: string
  store: Store
  field: RequirementField
  current?: number | string
  required: number | string
  status: FindingStatus
  effective: string
  extensionUntil?: string
  /**
   * Days until the rule takes effect (`due-soon`, `upcoming`), or until an open extension
   * window closes (`violated`). Absent otherwise.
   */
  daysLeft?: number
  message: string
  source: string
}

export type Pins = Partial<Record<RequirementField, number | string>>

/** How long the CLI's bundled rules are trusted before doctor suggests updating the CLI. */
export const REQUIREMENTS_STALE_DAYS = 120

/** Default window in which an upcoming rule counts as `due-soon`. */
export const DEFAULT_HORIZON_DAYS = 90

const FIELDS: readonly RequirementField[] = [
  'android.targetSdk',
  'android.compileSdk',
  'ios.deploymentTarget',
  'ios.xcode',
  'ios.sdk',
]

const STORE_NAMES: Record<Store, string> = {
  'google-play': 'Google Play',
  'app-store': 'App Store',
}

const DAY_MS = 24 * 60 * 60 * 1000

// ─── Versions & dates ───────────────────────────────────────────────────────

/** Parses `36`, `"13"` or `"13.0.1"` into numeric parts; null when it isn't a dotted number. */
export function parseVersion(value: number | string): number[] | null {
  const text = String(value).trim()
  if (!/^\d+(\.\d+)*$/.test(text)) return null
  return text.split('.').map(Number)
}

/** Compares dotted numeric versions; missing parts count as 0 ("13" equals "13.0"). */
export function compareVersions(a: number | string, b: number | string): number {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (!left || !right) throw new Error(`Not a dotted numeric version: "${left ? b : a}"`)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return Math.sign(diff)
  }
  return 0
}

/** A YYYY-MM-DD date as a day number (UTC days since the epoch). */
function dayOf(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new Error(`Not a YYYY-MM-DD date: "${date}"`)
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS
}

/** The calendar day `today` falls on for the user, as a day number comparable with dayOf(). */
function dayOfLocal(today: Date): number {
  return Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / DAY_MS
}

/** Whole days from `today` to a YYYY-MM-DD date (negative once it has passed). */
export function daysUntil(date: string, today: Date): number {
  return dayOf(date) - dayOfLocal(today)
}

// ─── Evaluation ─────────────────────────────────────────────────────────────

function plural(days: number): string {
  return `${days} day${days === 1 ? '' : 's'}`
}

function audience(rule: PlatformRule): string {
  return rule.appliesTo === 'existing'
    ? 'for published apps to stay available to new users'
    : 'for new apps and updates'
}

/**
 * Checks `pins` against every rule. A rule is `ok` once the pin meets it (even before it takes
 * effect), `violated` when it is in effect and the pin is below it, `due-soon` when it takes
 * effect within `horizonDays`, `upcoming` when later than that, and `unknown` without a pin.
 */
export function evaluateRequirements(
  rules: readonly PlatformRule[],
  pins: Pins,
  today: Date,
  horizonDays: number = DEFAULT_HORIZON_DAYS
): Finding[] {
  return rules.map((rule): Finding => {
    const store = STORE_NAMES[rule.store]
    const current = pins[rule.field]
    const base = {
      ruleId: rule.id,
      store: rule.store,
      field: rule.field,
      required: rule.min,
      effective: rule.effective,
      source: rule.source,
      ...(rule.extensionUntil !== undefined && { extensionUntil: rule.extensionUntil }),
    }

    if (current === undefined || parseVersion(current) === null) {
      const reason = current === undefined ? 'not set' : `"${current}" is not a version`
      return {
        ...base,
        ...(current !== undefined && { current }),
        status: 'unknown',
        message: `${rule.field} ${reason}; ${store} requires ${rule.min} ${audience(rule)} from ${rule.effective}.`,
      }
    }

    if (compareVersions(current, rule.min) >= 0) {
      return {
        ...base,
        current,
        status: 'ok',
        message: `${rule.field} ${current} meets the ${store} requirement (${rule.min}).`,
      }
    }

    const untilEffective = daysUntil(rule.effective, today)
    if (untilEffective <= 0) {
      let message = `${rule.field} ${current} is below the ${store} requirement: ${rule.min} ${audience(rule)} since ${rule.effective}.`
      let daysLeft: number | undefined
      if (rule.extensionUntil !== undefined) {
        const untilExtension = daysUntil(rule.extensionUntil, today)
        if (untilExtension >= 0) {
          daysLeft = untilExtension
          message += ` An extension runs to ${rule.extensionUntil} (${plural(untilExtension)} left).`
        }
      }
      return {
        ...base,
        current,
        status: 'violated',
        message,
        ...(daysLeft !== undefined && { daysLeft }),
      }
    }

    return {
      ...base,
      current,
      status: untilEffective <= horizonDays ? 'due-soon' : 'upcoming',
      daysLeft: untilEffective,
      message: `${rule.field} ${current} is below ${rule.min}, which ${store} requires ${audience(rule)} from ${rule.effective} (in ${plural(untilEffective)}).`,
    }
  })
}

// ─── Loading ────────────────────────────────────────────────────────────────

function fail(path: string, problem: string): never {
  throw new Error(`requirements.json: ${path} ${problem}`)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

/** Checks the shape of a parsed requirements file, so a bad hand edit fails loudly. */
export function validateRequirements(data: unknown): PlatformRequirements {
  if (!isRecord(data)) fail('root', 'must be an object')
  if (!isDate(data.reviewed)) fail('reviewed', 'must be a YYYY-MM-DD date')
  if (!Array.isArray(data.rules)) fail('rules', 'must be an array')
  if (!Array.isArray(data.watch)) fail('watch', 'must be an array')

  const ids = new Set<string>()
  data.rules.forEach((rule: unknown, i: number) => {
    const at = `rules[${i}]`
    if (!isRecord(rule)) fail(at, 'must be an object')
    if (typeof rule.id !== 'string' || rule.id === '') fail(`${at}.id`, 'must be a string')
    if (ids.has(rule.id)) fail(`${at}.id`, `"${rule.id}" is duplicated`)
    ids.add(rule.id)
    if (rule.store !== 'google-play' && rule.store !== 'app-store')
      fail(`${at}.store`, 'is unknown')
    if (!FIELDS.includes(rule.field as RequirementField)) fail(`${at}.field`, 'is unknown')
    if (
      (typeof rule.min !== 'number' && typeof rule.min !== 'string') ||
      parseVersion(rule.min) === null
    ) {
      fail(`${at}.min`, 'must be a number or dotted version')
    }
    if (!isDate(rule.effective)) fail(`${at}.effective`, 'must be a YYYY-MM-DD date')
    if (rule.appliesTo !== 'new-and-updates' && rule.appliesTo !== 'existing') {
      fail(`${at}.appliesTo`, 'must be "new-and-updates" or "existing"')
    }
    if (rule.extensionUntil !== undefined && !isDate(rule.extensionUntil)) {
      fail(`${at}.extensionUntil`, 'must be a YYYY-MM-DD date')
    }
    if (typeof rule.source !== 'string' || !rule.source.startsWith('https://')) {
      fail(`${at}.source`, 'must be an https URL')
    }
  })

  data.watch.forEach((page: unknown, i: number) => {
    const at = `watch[${i}]`
    if (!isRecord(page)) fail(at, 'must be an object')
    if (typeof page.id !== 'string' || page.id === '') fail(`${at}.id`, 'must be a string')
    if (typeof page.url !== 'string' || !page.url.startsWith('https://')) {
      fail(`${at}.url`, 'must be an https URL')
    }
    if (typeof page.sha256 !== 'string') fail(`${at}.sha256`, 'must be a string')
    if (page.reviewed !== '' && !isDate(page.reviewed)) {
      fail(`${at}.reviewed`, 'must be "" or a YYYY-MM-DD date')
    }
  })

  return data as unknown as PlatformRequirements
}

/** The rules bundled with this CLI version (requirements.json, inlined at build time). */
export function loadRequirements(): PlatformRequirements {
  return validateRequirements(requirementsJson)
}

/** Days since the bundled rules were reviewed against their sources. */
export function requirementsAgeDays(requirements: PlatformRequirements, today: Date): number {
  return dayOfLocal(today) - dayOf(requirements.reviewed)
}
