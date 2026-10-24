// node --test "scripts/**/*.test.mjs"   (pnpm test:scripts)
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import {
  devEnv,
  gradlew,
  needsShell,
  parseEnv,
  pathKey,
  repoRoot,
  sdkTool,
  withJavaOnPath,
} from './env.mjs'

test('parseEnv reads KEY=VALUE, skips comments and blanks, strips one pair of quotes', () => {
  const text =
    '# comment\n\nJAVA_HOME="C:\\jdk 17"\r\nAVD_NAME=CapsuleTest\nURL=http://x?a=b\nQUOTE=\'single\'\nnot a pair\n'
  assert.deepEqual(parseEnv(text), {
    JAVA_HOME: 'C:\\jdk 17',
    AVD_NAME: 'CapsuleTest',
    URL: 'http://x?a=b',
    QUOTE: 'single',
  })
})

test('devEnv: .env.local beats the shell, the shell beats defaults, relative paths resolve from the repo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'capsule-env-'))
  try {
    const file = join(dir, '.env.local')
    writeFileSync(file, 'JAVA_HOME=/opt/jdk-17\nCAPSULE_EXAMPLES_DIR=../my-examples\n')
    const base = { JAVA_HOME: '/stale/jdk', AVD_NAME: 'Pixel', PATH: '/usr/bin' }

    const { vars, fromFile } = devEnv({ file, base, platform: 'linux' })

    assert.deepEqual(Object.keys(fromFile), ['JAVA_HOME', 'CAPSULE_EXAMPLES_DIR'])
    assert.equal(vars.JAVA_HOME, '/opt/jdk-17')
    assert.equal(vars.AVD_NAME, 'Pixel')
    assert.equal(vars.CAPSULE_EXAMPLES_DIR, resolve(repoRoot, '../my-examples'))
    assert.equal(
      vars.CAPSULE_SHELL_OVERRIDE_PATH,
      resolve(repoRoot, 'packages/capsule-android/capsule/build/outputs/aar/capsule-release.aar')
    )
    assert.equal(vars.PATH, `${join('/opt/jdk-17', 'bin')}:/usr/bin`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('devEnv works without a .env.local', () => {
  const { vars, fromFile } = devEnv({
    file: join(tmpdir(), 'no-such-capsule-env'),
    base: {},
    platform: 'linux',
  })
  assert.deepEqual(fromFile, {})
  assert.equal(vars.AVD_NAME, 'CapsuleTest')
})

test("Windows' Path variable is updated in place, never duplicated as PATH", () => {
  const vars = { JAVA_HOME: 'C:\\jdk', Path: 'C:\\Windows' }
  assert.equal(pathKey(vars), 'Path')
  assert.equal(withJavaOnPath(vars, 'win32'), `${join('C:\\jdk', 'bin')};C:\\Windows`)
  assert.equal(pathKey({}), 'PATH')
})

test('JAVA_HOME/bin is not prepended twice', () => {
  const javaBin = join('/opt/jdk', 'bin')
  assert.equal(
    withJavaOnPath({ JAVA_HOME: '/opt/jdk', PATH: `${javaBin}:/usr/bin` }, 'linux'),
    `${javaBin}:/usr/bin`
  )
})

test('SDK tools and the Gradle wrapper get the right per-OS names', () => {
  assert.equal(sdkTool('/sdk', 'adb', 'linux'), join('/sdk', 'platform-tools', 'adb'))
  assert.equal(sdkTool('/sdk', 'adb', 'win32'), join('/sdk', 'platform-tools', 'adb') + '.exe')
  assert.equal(sdkTool('/sdk', 'emulator', 'darwin'), join('/sdk', 'emulator', 'emulator'))
  assert.equal(
    sdkTool('/sdk', 'avdmanager', 'win32'),
    join('/sdk', 'cmdline-tools', 'latest', 'bin', 'avdmanager') + '.bat'
  )
  assert.throws(() => sdkTool('/sdk', 'fastboot', 'linux'), /Unknown SDK tool/)
  assert.equal(gradlew('/repo/android', 'win32'), join('/repo/android', 'gradlew.bat'))
  assert.equal(gradlew('/repo/android', 'linux'), join('/repo/android', 'gradlew'))
})

test('only Windows batch files and npm-style shims need a shell', () => {
  assert.equal(needsShell('gradlew.bat', 'win32'), true)
  assert.equal(needsShell('pnpm', 'win32'), true)
  assert.equal(needsShell('C:\\sdk\\adb.exe', 'win32'), false)
  assert.equal(needsShell('pnpm', 'linux'), false)
  assert.equal(needsShell('gradlew', 'darwin'), false)
})
