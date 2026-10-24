// Parsers for the remote version sources. Pure — the body of a response in, data out.

/** Maven `maven-metadata.xml` → every `<version>` listed. */
export function parseMavenMetadata(xml) {
  return [...xml.matchAll(/<version>\s*([^<\s]+)\s*<\/version>/g)].map((m) => m[1])
}

/**
 * Android SDK `repository2-3.xml` → stable platforms and NDKs.
 * Platforms: `platforms;android-36`, `-36.1`, `-37.0` (minor SDK releases); `-ext`, `-beta`, code
 * names and canaries are skipped. NDKs: any `ndk;x.y.z` without a `<preview>` revision.
 */
export function parseAndroidRepository(xml) {
  const platforms = []
  const ndks = []
  for (const m of xml.matchAll(/<remotePackage path="([^"]+)"[^>]*>([\s\S]*?)<\/remotePackage>/g)) {
    const [, path, body] = m
    if (/<preview>/.test(body) || /obsolete="true"/.test(m[0])) continue
    const platform = /^platforms;android-(\d+)(?:\.(\d+))?$/.exec(path)
    if (platform) {
      platforms.push({ api: Number(platform[1]), minor: Number(platform[2] ?? 0), path })
      continue
    }
    const ndk = /^ndk;(\d+\.\d+\.\d+)$/.exec(path)
    if (ndk) ndks.push(ndk[1])
  }
  return { platforms, ndks }
}

/** services.gradle.org `/versions/current` JSON → `'9.8.2'`. */
export function parseGradleCurrent(json) {
  return json?.version
}

/**
 * xcodereleases.com `data.json` → the newest *final* Xcode `{ version, build, swift, date, iosSdk }`
 * (betas and release candidates skipped).
 */
export function latestXcodeRelease(entries) {
  const finals = entries.filter((e) => e?.name === 'Xcode' && e.version?.release?.release === true)
  const key = (e) => (e.date ? e.date.year * 10000 + e.date.month * 100 + e.date.day : 0)
  const latest = finals.sort((a, b) => key(b) - key(a))[0]
  if (!latest) return undefined
  const date = latest.date
  return {
    version: latest.version.number,
    build: latest.version.build,
    swift: latest.compilers?.swift?.[0]?.number,
    iosSdk: latest.sdks?.iOS?.[0]?.number,
    date: date
      ? `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
      : '',
  }
}

/** Docker Hub tags page → the `X.Y(.Z)-<distro>` tags (no `-slim`, no bare distro). */
export function swiftImageTags(page, distro = 'jammy') {
  const pattern = new RegExp(`^(\\d+\\.\\d+(?:\\.\\d+)?)-${distro}$`)
  return (page?.results ?? []).map((r) => pattern.exec(r.name)?.[1]).filter(Boolean)
}

/** GitHub `/releases` (or `/releases/latest`) → tag names of non-draft, non-prerelease releases. */
export function githubReleaseTags(releases) {
  const list = Array.isArray(releases) ? releases : [releases]
  return list.filter((r) => r && !r.draft && !r.prerelease).map((r) => r.tag_name)
}

/**
 * GitHub `/security-advisories` → published advisories
 * `{ id, severity, summary, url, published, vulnerabilities: [{ range, patched }] }`.
 */
export function githubAdvisories(advisories) {
  return (advisories ?? [])
    .filter((a) => a.state === undefined || a.state === 'published')
    .map((a) => ({
      id: a.ghsa_id,
      severity: a.severity ?? 'unknown',
      summary: a.summary ?? '',
      url: a.html_url ?? '',
      published: a.published_at ?? '',
      vulnerabilities: (a.vulnerabilities ?? []).map((v) => ({
        range: v.vulnerable_version_range ?? '',
        patched: v.patched_versions ?? '',
      })),
    }))
}
