import { describe, it, expect } from 'vitest'
import { CONFIG_FIELDS, DEFAULT_DEV_PORT, type CapsuleConfig, type ConfigField } from '../config.js'

// CONFIG_FIELDS feeds docs/reference/generated/config.md. Exhaustiveness against the
// CapsuleConfig interface is enforced by `tsc` (allPathsDescribed in config.ts); these tests pin
// the runtime shape the generator relies on.

const keys = CONFIG_FIELDS.map((field) => field.key as string)
const byKey = new Map<string, ConfigField>(
  CONFIG_FIELDS.map((field) => [field.key as string, field])
)

/** Parent of `a.b` and of `a[].b` is `a`. */
const parentOf = (key: string) => key.slice(0, key.lastIndexOf('.')).replace(/\[\]$/, '')

/** Every dotted path in a config object, the way CONFIG_FIELDS spells them. */
function pathsOf(value: unknown, prefix = ''): string[] {
  if (prefix && byKey.get(prefix)?.type.startsWith('Record')) return []
  if (Array.isArray(value)) {
    return value.flatMap((element) =>
      typeof element === 'object' ? pathsOf(element, `${prefix}[]`) : []
    )
  }
  if (value === null || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return [path, ...pathsOf(child, path)]
  })
}

describe('CONFIG_FIELDS', () => {
  it('lists each key once', () => {
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('lists the parent of every nested key', () => {
    const orphans = keys.filter((key) => key.includes('.') && !byKey.has(parentOf(key)))
    expect(orphans).toEqual([])
  })

  it('gives every key a type and a description', () => {
    const incomplete = CONFIG_FIELDS.filter(
      (field) => !field.type.trim() || !field.description.trim()
    )
    expect(incomplete).toEqual([])
  })

  it('describes every key of a fully populated config', () => {
    const everything: CapsuleConfig = {
      appId: 'com.acme.app',
      appName: 'Acme',
      devPort: 5173,
      version: { name: '1.0.0', buildNumber: 1 },
      android: {
        minSdk: 26,
        targetSdk: 35,
        compileSdk: 35,
        permissions: ['CAMERA'],
        signing: { storeFile: 'k.jks', storePassword: 'p', keyAlias: 'a', keyPassword: 'p' },
        gradleOverrides: { anything: true },
        push: { googleServicesFile: 'google-services.json' },
      },
      ios: { deployment: '15.0', bundleId: 'com.acme.app' },
      deepLinks: {
        schemes: ['acme'],
        universalLinks: [{ host: 'acme.com', pathPrefix: '/invite' }],
      },
      plugins: ['@capsule-community/x', { path: './p', trust: 'unverified', overrides: 'camera' }],
      codeSync: {
        enabled: true,
        url: 'http://localhost:3000',
        apiKey: 'k',
        channel: 'production',
        strategy: 'background',
        checkOnForeground: true,
        mandatory: false,
      },
      web: { mobileReset: true, buildCommand: 'vite build', devCommand: 'vite' },
      jobs: [
        {
          id: 'sync',
          interval: '15m',
          constraints: { network: 'required', battery: 'notLow' },
          sync: { url: 'https://api.acme.com/items', collection: 'items', strategy: 'merge' },
          notify: {
            from: 'items',
            where: { done: false },
            limit: 10,
            notifications: [
              { trigger: { minutesBefore: 5 }, title: 't', body: 'b', idTemplate: 'id' },
            ],
          },
        },
      ],
    }

    const undescribed = [...new Set(pathsOf(everything))].filter((path) => !byKey.has(path))
    expect(undescribed).toEqual([])
  })

  it('documents the dev-port default the code applies', () => {
    expect(byKey.get('devPort')?.default).toBe(String(DEFAULT_DEV_PORT))
  })
})
