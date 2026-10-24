// iOS: SwiftPM dependencies (Package.swift + Package.resolved), the Apple toolchain (latest final
// Xcode/Swift) against the Swift image CI and `pnpm verify:ios` build in, and CocoaPods/Carthage.

import { STATUS, row, unavailable, versionRow } from '../lib/report.mjs'
import { compareVersions, pickLatest } from '../lib/versions.mjs'
import { githubReleaseTags, latestXcodeRelease, swiftImageTags } from '../parsers/sources.mjs'
import { describeRequirement, findSwiftImages, requirementUpperBound } from '../parsers/swift.mjs'
import { PATHS } from '../repo.mjs'

export const XCODE_RELEASES = 'https://xcodereleases.com/data.json'
export const SWIFT_TAGS =
  'https://hub.docker.com/v2/repositories/library/swift/tags?page_size=100&name=jammy&ordering=last_updated'
const API = 'https://api.github.com'

/** Where CocoaPods / Carthage manifests would live if the iOS side ever grew them. */
const POD_MANIFESTS = [
  'Podfile',
  'Cartfile',
  'packages/capsule-ios/Podfile',
  'packages/capsule-ios/Cartfile',
]

/** Latest release tag of a GitHub repo; falls back to plain tags for repos that don't cut releases. */
async function latestGithubVersion(http, slug) {
  const releases = githubReleaseTags(await http.json(`${API}/repos/${slug}/releases?per_page=30`))
  if (releases.length > 0) return pickLatest(releases)
  const tags = (await http.json(`${API}/repos/${slug}/tags?per_page=100`)).map((t) => t.name)
  return pickLatest(tags)
}

/** A dependency row: resolved vs latest, 🟡 when the latest is outside Package.swift's range. */
export function dependencyRow(dep, resolved, latest) {
  const name = `${dep.owner}/${dep.repo}`
  const range = describeRequirement(dep.requirement)
  const upper = requirementUpperBound(dep.requirement)
  const r = versionRow({
    name,
    current: resolved?.version ?? dep.requirement.lower ?? '?',
    latest,
    source: `https://github.com/${dep.owner}/${dep.repo}/releases`,
    note: `Package.swift: ${range}${resolved?.version ? '' : ' (not in Package.resolved)'}`,
  })
  if (upper && latest && compareVersions(latest, upper) >= 0) {
    r.status = STATUS.yellow
    r.note = `latest ${latest} is outside ${range} — widen Package.swift, then re-resolve`
  }
  return r
}

export default {
  id: 'swift',
  title: 'iOS (SwiftPM · Xcode · Swift image)',
  async run({ repo, http }) {
    const rows = []
    const manifest = repo.packageSwift()
    const resolved = repo.packageResolved()

    rows.push(
      row({
        name: 'swift-tools-version',
        current: manifest.toolsVersion,
        status: STATUS.green,
        note: 'minimum SwiftPM that can read Package.swift — raise only when a newer manifest API is needed',
        source: 'https://www.swift.org/documentation/package-manager/',
      })
    )
    rows.push(
      row({
        name: 'iOS deployment target (Package.swift)',
        current: manifest.platforms.iOS ?? '—',
        status: STATUS.green,
        note: `macOS ${manifest.platforms.macOS ?? '—'} (for swift test on macOS). App Store minimum: store section.`,
      })
    )

    for (const dep of manifest.dependencies) {
      const pin = resolved.find(
        (p) =>
          p.url?.replace(/\.git$/, '').toLowerCase() === dep.url.replace(/\.git$/, '').toLowerCase()
      )
      if (!dep.owner) {
        rows.push(
          row({
            name: dep.url,
            current: pin?.version,
            status: STATUS.unavailable,
            note: 'not a GitHub URL — check by hand',
          })
        )
        continue
      }
      try {
        rows.push(
          dependencyRow(dep, pin, await latestGithubVersion(http, `${dep.owner}/${dep.repo}`))
        )
      } catch (error) {
        rows.push(unavailable(`${dep.owner}/${dep.repo}`, error, dep.url, pin?.version))
      }
    }

    let xcode
    try {
      xcode = latestXcodeRelease(await http.json(XCODE_RELEASES))
      rows.push(
        row({
          name: 'Xcode (latest final release)',
          current: '—',
          latest: xcode ? `${xcode.version} (Swift ${xcode.swift}, iOS SDK ${xcode.iosSdk})` : '?',
          status: xcode ? STATUS.green : STATUS.unavailable,
          note: `released ${xcode?.date ?? '?'}; CI's ios-macos job uses the runner image's default Xcode. App Store minimum: store section.`,
          source: 'https://xcodereleases.com',
        })
      )
    } catch (error) {
      rows.push(unavailable('Xcode (latest final release)', error, 'https://xcodereleases.com'))
    }

    try {
      const tags = swiftImageTags(await http.json(SWIFT_TAGS))
      const latest = pickLatest(tags)
      const images = new Set()
      for (const file of [PATHS.ci, PATHS.verify]) {
        if (repo.exists(file))
          for (const image of findSwiftImages(repo.read(file))) images.add(`${image}|${file}`)
      }
      for (const entry of images) {
        const [image, file] = entry.split('|')
        const version = image.replace(/-[a-z]+$/, '')
        const r = versionRow({
          name: `swift:${image} (${file})`,
          current: version,
          latest,
          source: 'https://hub.docker.com/_/swift',
        })
        if (xcode?.swift && compareVersions(version, xcode.swift) < 0) {
          r.note = [r.note, `Xcode ${xcode.version} ships Swift ${xcode.swift}`]
            .filter(Boolean)
            .join(' — ')
        }
        rows.push(r)
      }
    } catch (error) {
      rows.push(unavailable('swift Docker image', error, 'https://hub.docker.com/_/swift'))
    }

    const pods = POD_MANIFESTS.filter((file) => repo.exists(file))
    rows.push(
      row({
        name: 'CocoaPods / Carthage (Objective-C deps)',
        current: pods.length > 0 ? pods.join(', ') : 'none',
        status: pods.length > 0 ? STATUS.unavailable : STATUS.green,
        note:
          pods.length > 0
            ? 'found — not checked by this report yet; add a section'
            : 'no Podfile/Cartfile — SwiftPM only',
      })
    )
    return rows
  },
}
