import { describe, it, expect } from 'vitest'
import {
  compareVersions,
  daysUntil,
  evaluateRequirements,
  loadRequirements,
  parseVersion,
  requirementsAgeDays,
  validateRequirements,
  type PlatformRule,
} from '../platform/requirements.js'

// A rule like Play's API-36 deadline: in effect 2026-08-31, extension window to 2026-11-01.
const play: PlatformRule = {
  id: 'play-target-36',
  store: 'google-play',
  field: 'android.targetSdk',
  min: 36,
  effective: '2026-08-31',
  appliesTo: 'new-and-updates',
  extensionUntil: '2026-11-01',
  source: 'https://developer.android.com/google/play/requirements/target-sdk',
}

const apple: PlatformRule = {
  id: 'apple-deployment-13',
  store: 'app-store',
  field: 'ios.deploymentTarget',
  min: '13',
  effective: '2026-09-09',
  appliesTo: 'new-and-updates',
  source: 'https://developer.apple.com/news/upcoming-requirements/',
}

/** A local calendar day — evaluation works on the day the user sees, not UTC. */
const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

const evaluateOne = (rule: PlatformRule, pin: number | string | undefined, today: string) =>
  evaluateRequirements([rule], pin === undefined ? {} : { [rule.field]: pin }, day(today))[0]

describe('versions', () => {
  it('parses API levels and dotted versions', () => {
    expect(parseVersion(36)).toEqual([36])
    expect(parseVersion('13.0.1')).toEqual([13, 0, 1])
    expect(parseVersion('13.x')).toBeNull()
    expect(parseVersion('')).toBeNull()
  })

  it('treats missing parts as zero', () => {
    expect(compareVersions('13', '13.0')).toBe(0)
    expect(compareVersions('13.1', '13')).toBe(1)
    expect(compareVersions('12.4', '13')).toBe(-1)
    expect(compareVersions(36, '35')).toBe(1)
  })

  it('rejects non-numeric versions', () => {
    expect(() => compareVersions('beta', 1)).toThrow(/beta/)
  })
})

describe('evaluateRequirements', () => {
  it('is ok once the pin meets the rule, even before it takes effect', () => {
    expect(evaluateOne(play, 36, '2026-01-01').status).toBe('ok')
    expect(evaluateOne(play, 37, '2027-01-01').status).toBe('ok')
  })

  it('is violated from the effective day, with the open extension window', () => {
    const finding = evaluateOne(play, 35, '2026-08-31')
    expect(finding.status).toBe('violated')
    expect(finding.daysLeft).toBe(62)
    expect(finding.message).toContain('An extension runs to 2026-11-01 (62 days left)')
  })

  it('counts the last extension day as open, and drops it after', () => {
    expect(evaluateOne(play, 35, '2026-11-01').daysLeft).toBe(0)
    const after = evaluateOne(play, 35, '2026-11-02')
    expect(after.status).toBe('violated')
    expect(after.daysLeft).toBeUndefined()
    expect(after.message).not.toContain('extension')
  })

  it('is due-soon inside the horizon and upcoming beyond it', () => {
    const soon = evaluateOne(play, 35, '2026-08-01')
    expect(soon.status).toBe('due-soon')
    expect(soon.daysLeft).toBe(30)
    expect(evaluateOne(play, 35, '2026-05-01').status).toBe('upcoming')
    expect(
      evaluateRequirements([play], { 'android.targetSdk': 35 }, day('2026-05-01'), 365)[0].status
    ).toBe('due-soon')
  })

  it('compares dotted versions', () => {
    expect(evaluateOne(apple, '13.0', '2026-10-24').status).toBe('ok')
    expect(evaluateOne(apple, '12.4', '2026-10-24').status).toBe('violated')
  })

  it('is unknown without a pin or with a pin that is not a version', () => {
    const missing = evaluateOne(apple, undefined, '2026-10-24')
    expect(missing.status).toBe('unknown')
    expect(missing.current).toBeUndefined()
    expect(missing.message).toContain('not set')
    const bad = evaluateOne(apple, 'latest', '2026-10-24')
    expect(bad.status).toBe('unknown')
    expect(bad.current).toBe('latest')
  })

  it('carries the rule identity and source on every finding', () => {
    const finding = evaluateOne(play, 35, '2026-10-24')
    expect(finding).toMatchObject({
      ruleId: 'play-target-36',
      store: 'google-play',
      field: 'android.targetSdk',
      current: 35,
      required: 36,
      effective: '2026-08-31',
      extensionUntil: '2026-11-01',
      source: play.source,
    })
  })

  it('words existing-app rules as visibility, not submission', () => {
    const existing = { ...play, id: 'play-existing-35', min: 35, appliesTo: 'existing' as const }
    expect(evaluateOne(existing, 34, '2026-10-24').message).toContain('to stay available')
  })
})

describe('dates', () => {
  it('counts whole calendar days', () => {
    expect(daysUntil('2026-11-01', day('2026-10-24'))).toBe(8)
    expect(daysUntil('2026-10-24', day('2026-10-24'))).toBe(0)
  })
})

describe('requirements.json', () => {
  it('passes validation and has unique rule ids', () => {
    const requirements = loadRequirements()
    expect(requirements.rules.length).toBeGreaterThan(0)
    expect(requirementsAgeDays(requirements, day(requirements.reviewed))).toBe(0)
  })

  it('rejects malformed rules', () => {
    const valid = { reviewed: '2026-10-24', rules: [play], watch: [] }
    expect(validateRequirements(valid).rules).toHaveLength(1)
    expect(() => validateRequirements({ ...valid, rules: [play, play] })).toThrow(/duplicated/)
    expect(() => validateRequirements({ ...valid, rules: [{ ...play, field: 'x' }] })).toThrow(
      /field/
    )
    expect(() => validateRequirements({ ...valid, rules: [{ ...play, min: 'v36' }] })).toThrow(
      /min/
    )
    expect(() =>
      validateRequirements({ ...valid, rules: [{ ...play, effective: '31/08/2026' }] })
    ).toThrow(/effective/)
    expect(() =>
      validateRequirements({ ...valid, watch: [{ id: 'a', url: 'http://x', sha256: '' }] })
    ).toThrow(/url/)
  })
})
