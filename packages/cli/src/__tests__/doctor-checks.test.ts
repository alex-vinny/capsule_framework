import { describe, it, expect } from 'vitest'
import { evaluateCheck } from '../commands/doctor.js'

const java = { parse: (s: string) => s.split('\n')[0], require: '17' }

describe('evaluateCheck', () => {
  it('accepts a version at or above the minimum', () => {
    expect(
      evaluateCheck(java, { exitCode: 0, stdout: 'openjdk 17.0.19 2026-07-15\nOpenJDK Runtime' })
    ).toEqual({
      ok: true,
      version: 'openjdk 17.0.19 2026-07-15',
    })
    expect(evaluateCheck({ require: '22.12' }, { stdout: '22.22.3' }).ok).toBe(true)
  })

  it('rejects a version below the minimum, with the reason', () => {
    const outcome = evaluateCheck(java, { exitCode: 0, stdout: 'openjdk 11.0.16.1 2022-08-12' })
    expect(outcome).toMatchObject({ ok: false, reason: '11.0.16.1 is too old (need ≥ 17)' })
    expect(evaluateCheck({ require: '22.12' }, { stdout: '22.11.0' }).ok).toBe(false)
  })

  it('reports a missing tool (spawn failure or non-zero exit) as not found', () => {
    expect(evaluateCheck(java, { failed: true })).toEqual({ ok: false, reason: 'not found' })
    expect(evaluateCheck(java, { exitCode: 127, stdout: '' })).toEqual({
      ok: false,
      reason: 'not found',
    })
  })

  it("'present' accepts any version string", () => {
    expect(
      evaluateCheck({ require: 'present' }, { stdout: 'Android Debug Bridge version 1.0.41' }).ok
    ).toBe(true)
  })

  it('fails when no version can be read', () => {
    expect(evaluateCheck({ require: '9' }, { stdout: 'weird' })).toMatchObject({ ok: false })
  })
})
