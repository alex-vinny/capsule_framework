import { describe, it, expect } from 'vitest'
import type { CapsuleConfig } from '../config.js'
import type { PlatformRequirements } from '../platform/requirements.js'
import {
  actionableFindings,
  checkStoreRequirements,
  configPins,
  findingLevel,
  hasViolation,
  staleMessage,
} from '../platform/store-check.js'

const requirements: PlatformRequirements = {
  reviewed: '2026-10-24',
  rules: [
    {
      id: 'play-target-36',
      store: 'google-play',
      field: 'android.targetSdk',
      min: 36,
      effective: '2026-08-31',
      appliesTo: 'new-and-updates',
      source: 'https://developer.android.com/google/play/requirements/target-sdk',
    },
    {
      id: 'play-compile-37',
      store: 'google-play',
      field: 'android.compileSdk',
      min: 37,
      effective: '2027-01-15',
      appliesTo: 'new-and-updates',
      source: 'https://developer.android.com/google/play/requirements/target-sdk',
    },
    {
      id: 'apple-deployment-13',
      store: 'app-store',
      field: 'ios.deploymentTarget',
      min: '13',
      effective: '2026-09-09',
      appliesTo: 'new-and-updates',
      source: 'https://developer.apple.com/news/upcoming-requirements/',
    },
    {
      id: 'apple-xcode-26',
      store: 'app-store',
      field: 'ios.xcode',
      min: '26',
      effective: '2026-04-28',
      appliesTo: 'new-and-updates',
      source: 'https://developer.apple.com/news/upcoming-requirements/',
    },
  ],
  watch: [],
}

const androidApp: CapsuleConfig = {
  appId: 'dev.capsule.test',
  appName: 'Test',
  version: { name: '1.0.0', buildNumber: 1 },
  android: { minSdk: 26, targetSdk: 35, compileSdk: 35 },
}

const today = new Date(2026, 9, 24, 12)

describe('configPins', () => {
  it('maps the config fields store rules gate', () => {
    expect(configPins(androidApp)).toEqual({ 'android.targetSdk': 35, 'android.compileSdk': 35 })
    expect(configPins({ ...androidApp, android: undefined, ios: { deployment: '15.0' } })).toEqual({
      'ios.deploymentTarget': '15.0',
    })
  })
})

describe('checkStoreRequirements', () => {
  it('checks only the platforms the app configures', () => {
    const report = checkStoreRequirements(androidApp, today, {}, requirements)
    expect(report.findings.map((f) => f.ruleId)).toEqual(['play-target-36', 'play-compile-37'])
  })

  it('flags an in-effect violation and a rule coming within the horizon', () => {
    const report = checkStoreRequirements(androidApp, today, {}, requirements)
    expect(hasViolation(report)).toBe(true)
    expect(report.findings.map((f) => f.status)).toEqual(['violated', 'due-soon'])
    expect(actionableFindings(report)).toHaveLength(2)
    expect(report.findings.map(findingLevel)).toEqual(['error', 'warn'])
  })

  it('takes extra pins, such as the local Xcode, over nothing', () => {
    const iosApp = { ...androidApp, android: undefined, ios: { deployment: '13.0' } }
    const report = checkStoreRequirements(iosApp, today, { 'ios.xcode': '26.1' }, requirements)
    expect(report.findings.map((f) => [f.ruleId, f.status])).toEqual([
      ['apple-deployment-13', 'ok'],
      ['apple-xcode-26', 'ok'],
    ])
    expect(hasViolation(report)).toBe(false)
    expect(checkStoreRequirements(iosApp, today, {}, requirements).findings[1].status).toBe(
      'unknown'
    )
  })

  it('reports nothing for an app with no native platform', () => {
    const webOnly = { ...androidApp, android: undefined }
    expect(checkStoreRequirements(webOnly, today, {}, requirements).findings).toEqual([])
  })

  it('marks the bundled rules stale after 120 days', () => {
    expect(checkStoreRequirements(androidApp, today, {}, requirements).stale).toBe(false)
    const later = new Date(2027, 2, 1, 12)
    const report = checkStoreRequirements(androidApp, later, {}, requirements)
    expect(report.stale).toBe(true)
    expect(report.ageDays).toBe(128)
    expect(staleMessage(report)).toContain('update @capsule/cli')
  })
})
