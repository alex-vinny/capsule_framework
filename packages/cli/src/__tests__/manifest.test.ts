import { describe, it, expect } from 'vitest'
import { generateManifest } from '../sync/sync.js'

const APP_ID = 'com.example.app'

describe('generateManifest', () => {
  describe('permissions & features (baseline)', () => {
    it('declares the auto permissions and the camera feature', () => {
      const xml = generateManifest(APP_ID, [])
      expect(xml).toContain('android.permission.INTERNET')
      expect(xml).toContain('android.permission.VIBRATE')
      expect(xml).toContain('android.permission.ACCESS_NETWORK_STATE')
      expect(xml).toContain('android.permission.CAMERA')
      expect(xml).toContain('<uses-feature android:name="android.hardware.camera"')
    })

    it('merges extra permissions without duplicating', () => {
      const xml = generateManifest(APP_ID, ['CAMERA', 'RECORD_AUDIO'])
      expect(xml).toContain('android.permission.RECORD_AUDIO')
      expect(xml.match(/android\.permission\.CAMERA/g)).toHaveLength(1)
    })
  })

  describe('without deepLinks', () => {
    it('adds no launchMode and no BROWSABLE filter', () => {
      const xml = generateManifest(APP_ID, [])
      expect(xml).not.toContain('launchMode')
      expect(xml).not.toContain('android.intent.category.BROWSABLE')
    })

    it('treats empty arrays as no deep links', () => {
      const xml = generateManifest(APP_ID, [], { schemes: [], universalLinks: [] })
      expect(xml).not.toContain('launchMode')
      expect(xml).not.toContain('android.intent.category.BROWSABLE')
    })
  })

  describe('custom schemes', () => {
    it('emits a VIEW + DEFAULT + BROWSABLE filter and singleTask launchMode', () => {
      const xml = generateManifest(APP_ID, [], { schemes: ['myapp'] })
      expect(xml).toContain('android:launchMode="singleTask"')
      expect(xml).toContain('android.intent.action.VIEW')
      expect(xml).toContain('android.intent.category.DEFAULT')
      expect(xml).toContain('android.intent.category.BROWSABLE')
      expect(xml).toContain('<data android:scheme="myapp" />')
    })

    it('emits one filter per scheme', () => {
      const xml = generateManifest(APP_ID, [], { schemes: ['myapp', 'acme'] })
      expect(xml).toContain('<data android:scheme="myapp" />')
      expect(xml).toContain('<data android:scheme="acme" />')
    })
  })

  describe('universal links', () => {
    it('emits an autoVerify https filter with host and pathPrefix', () => {
      const xml = generateManifest(APP_ID, [], {
        universalLinks: [{ host: 'app.acme.com', pathPrefix: '/invite' }],
      })
      expect(xml).toContain('<intent-filter android:autoVerify="true">')
      expect(xml).toContain('<data android:scheme="https" />')
      expect(xml).toContain('<data android:host="app.acme.com" />')
      expect(xml).toContain('<data android:pathPrefix="/invite" />')
      expect(xml).toContain('android:launchMode="singleTask"')
    })

    it('omits pathPrefix when not given', () => {
      const xml = generateManifest(APP_ID, [], { universalLinks: [{ host: 'app.acme.com' }] })
      expect(xml).toContain('<data android:host="app.acme.com" />')
      expect(xml).not.toContain('pathPrefix')
    })
  })

  it('produces well-formed XML preamble and a single application node', () => {
    const xml = generateManifest(APP_ID, [], { schemes: ['myapp'] })
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true)
    expect(xml.match(/<application/g)).toHaveLength(1)
    expect(xml).toContain(`${APP_ID}.capsule.fileprovider`)
  })
})
