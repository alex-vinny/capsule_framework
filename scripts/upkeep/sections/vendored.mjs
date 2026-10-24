// Vendored C (packages/native/*): each folder's VERSION pin against the upstream's latest GitHub
// release, plus the upstream's published security advisories.

import { readdirSync } from 'node:fs'
import { STATUS, row, unavailable, versionRow } from '../lib/report.mjs'
import { satisfiesRange } from '../lib/versions.mjs'
import { githubAdvisories, githubReleaseTags } from '../parsers/sources.mjs'
import { PATHS, parseVersionFile } from '../repo.mjs'

const API = 'https://api.github.com'
const SEVERE = new Set(['critical', 'high'])

/** `https://github.com/civetweb/civetweb` → `civetweb/civetweb`. */
export const repoSlug = (url) => /github\.com\/([^/]+\/[^/.]+)/.exec(url ?? '')?.[1]

/** The update script for a vendored folder, named after it (scripts/update-<folder>.mjs). */
const updateCommand = (folder, tag) => `node scripts/update-${folder}.mjs ${tag}`

/**
 * Whether the pinned version is affected: by the advisory's vulnerable range when it has one,
 * else "published after the pinned release" (unknown pin date → assume affected).
 */
export function affects(advisory, pinnedVersion, pinnedDate) {
  const verdicts = advisory.vulnerabilities
    .map((v) => satisfiesRange(pinnedVersion, v.range))
    .filter((x) => x !== undefined)
  if (verdicts.length > 0) return verdicts.some(Boolean)
  return !pinnedDate || !advisory.published || advisory.published > pinnedDate
}

/** Advisory rows for the ones that affect the pin: 🔴 high/critical, 🟡 otherwise. */
export function advisoryRows(folder, advisories, pinnedVersion, pinnedDate) {
  return advisories
    .filter((a) => affects(a, pinnedVersion, pinnedDate))
    .map((a) => {
      const fixed = a.vulnerabilities
        .map((v) => v.patched)
        .filter(Boolean)
        .join(', ')
      return row({
        name: `${folder}: ${a.id}`,
        current: pinnedVersion,
        latest: fixed ? `fixed in ${fixed}` : '',
        status: SEVERE.has(a.severity) ? STATUS.red : STATUS.yellow,
        note: `${a.severity} — ${a.summary}${fixed ? '' : ' (no fixed version listed — check the advisory)'}`,
        source: a.url,
      })
    })
}

export default {
  id: 'vendored',
  title: 'Vendored native code (packages/native)',
  async run({ repo, http }) {
    const rows = []
    const folders = readdirSync(repo.path(PATHS.native), { withFileTypes: true })
      .filter((d) => d.isDirectory() && repo.exists(`${PATHS.native}/${d.name}/VERSION`))
      .map((d) => d.name)
    for (const folder of folders) {
      const pin = parseVersionFile(repo.read(`${PATHS.native}/${folder}/VERSION`))
      const slug = repoSlug(pin.repo)
      if (!slug) {
        rows.push(
          row({
            name: folder,
            current: pin.ref,
            status: STATUS.unavailable,
            note: 'VERSION has no GitHub repo= line',
          })
        )
        continue
      }
      let pinnedDate
      try {
        const latest = githubReleaseTags(await http.json(`${API}/repos/${slug}/releases/latest`))[0]
        try {
          pinnedDate = (
            await http.json(`${API}/repos/${slug}/releases/tags/${encodeURIComponent(pin.ref)}`)
          ).published_at
        } catch {
          pinnedDate = undefined // a commit pin, or a tag without a release
        }
        const r = versionRow({
          name: `${folder} (${slug})`,
          current: pin.ref,
          latest,
          source: `https://github.com/${slug}/releases`,
          note: pin.commit ? '' : 'pinned commit not recorded — the next update records it',
        })
        if (r.status === STATUS.yellow)
          r.note = [r.note, `re-vendor: ${updateCommand(folder, latest)}`]
            .filter(Boolean)
            .join(' — ')
        if (r.status === STATUS.green && pinnedDate)
          r.note = [r.note, `latest release ${pinnedDate.slice(0, 10)}`].filter(Boolean).join(' — ')
        rows.push(r)
      } catch (error) {
        rows.push(
          unavailable(`${folder} (${slug})`, error, `https://github.com/${slug}/releases`, pin.ref)
        )
      }
      try {
        const advisories = githubAdvisories(
          await http.json(`${API}/repos/${slug}/security-advisories?per_page=100`)
        )
        const found = advisoryRows(folder, advisories, pin.version ?? pin.ref, pinnedDate)
        rows.push(
          ...(found.length > 0
            ? found
            : [
                row({
                  name: `${folder}: security advisories`,
                  status: STATUS.green,
                  note: `none affecting ${pin.ref}`,
                  source: `https://github.com/${slug}/security/advisories`,
                }),
              ])
        )
      } catch (error) {
        rows.push(
          unavailable(
            `${folder}: security advisories`,
            error,
            `https://github.com/${slug}/security/advisories`
          )
        )
      }
    }
    return rows
  },
}
