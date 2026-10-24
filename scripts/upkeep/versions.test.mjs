import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  classifyUpdate,
  compareVersions,
  isPrerelease,
  pickLatest,
  satisfiesRange,
  versionFlavour,
} from './lib/versions.mjs'

describe('versions', () => {
  it('recognises prereleases but not flavours', () => {
    for (const v of [
      '1.0.0-beta2',
      '9.5.0-rc01',
      '2.5.0-Beta2',
      '1.6.0-alpha01',
      '3.0.0-SNAPSHOT',
      '5.0.0-M1',
      '0.1.0-dev.3',
    ]) {
      assert.equal(isPrerelease(v), true, v)
    }
    for (const v of ['33.3.1-android', '33.3.1-jre', '1.16', 'v0.17.0', '2.0.0-1.0.24'])
      assert.equal(isPrerelease(v), false, v)
  })

  it('compares numerically, prerelease before release', () => {
    assert.ok(compareVersions('1.10.0', '1.9.0') > 0)
    assert.ok(compareVersions('v1.16', '1.15.9') > 0)
    assert.ok(compareVersions('1.0.0-beta2', '1.0.0') < 0)
    assert.ok(compareVersions('1.0.0-beta10', '1.0.0-beta2') > 0)
    assert.equal(compareVersions('2.0', '2.0.0'), 0)
  })

  it('picks the latest stable, or the latest beta for a beta pin, in the same flavour', () => {
    const guava = ['33.3.1-android', '33.4.0-jre', '33.4.0-android', '34.0.0-rc1-android']
    assert.equal(pickLatest(guava, { flavourOf: '33.3.1-android' }), '33.4.0-android')
    assert.equal(pickLatest(['1.0.0-beta2', '1.0.0-beta4', '0.9.0']), '0.9.0')
    assert.equal(
      pickLatest(['1.0.0-beta2', '1.0.0-beta4', '0.9.0'], { allowPrerelease: true }),
      '1.0.0-beta4'
    )
    assert.equal(pickLatest([]), undefined)
    assert.equal(versionFlavour('33.3.1-android'), 'android')
    assert.equal(versionFlavour('1.0.0-beta2'), '')
  })

  it('classifies an update', () => {
    assert.equal(classifyUpdate('8.7.0', '9.4.1'), 'major')
    assert.equal(classifyUpdate('2.0.0', '2.4.21'), 'minor')
    assert.equal(classifyUpdate('1.7.0', '1.7.1'), 'patch')
    assert.equal(classifyUpdate('v1.16', 'v1.16'), 'same')
    assert.equal(classifyUpdate('35', '37'), 'major')
    assert.equal(classifyUpdate('2.0', '1.9'), 'ahead')
    assert.equal(classifyUpdate('1.0.0-beta2', '1.0.0-beta4'), 'patch')
    assert.equal(classifyUpdate(undefined, '1.0'), 'unknown')
  })

  it('evaluates advisory ranges', () => {
    assert.equal(satisfiesRange('0.15.1', '< 0.16.0'), true)
    assert.equal(satisfiesRange('0.16.0', '< 0.16.0'), false)
    assert.equal(satisfiesRange('0.15.1', '>= 0.10.0, < 0.16.0'), true)
    assert.equal(satisfiesRange('0.9.0', '>= 0.10.0, < 0.16.0'), false)
    assert.equal(satisfiesRange('1.2.3', '= 1.2.3'), true)
    assert.equal(satisfiesRange('1.2.3', ''), undefined)
    assert.equal(satisfiesRange('1.2.3', 'garbage ~~'), undefined)
  })
})
