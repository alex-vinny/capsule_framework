// Store requirements (Google Play target API, App Store SDK/Xcode/deployment minimums): the rules
// in packages/cli/src/platform/requirements.json, evaluated against what Capsule actually pins, plus
// a change-watch on the store pages those rules were copied from.

import { pathToFileURL } from 'node:url'
import { pageHash } from '../parsers/page.mjs'
import { PATHS } from '../repo.mjs'
import { STATUS, row, unavailable } from '../lib/report.mjs'

const FINDING_STATUS = {
  ok: STATUS.green,
  violated: STATUS.red,
  'due-soon': STATUS.red, // a forced platform requirement inside the horizon — schedule now
  upcoming: STATUS.yellow,
  unknown: STATUS.unavailable,
}

/** The pin sets a rule can apply to. A rule only reports against the sets that declare its field. */
export function collectPins(repo) {
  const sets = []
  const errors = []
  try {
    const cli = repo.cliSdkDefaults()
    sets.push({
      label: `capsule init defaults (${cli.file.split('/').pop()})`,
      pins: { 'android.targetSdk': cli.targetSdk, 'android.compileSdk': cli.compileSdk },
    })
  } catch (error) {
    errors.push(unavailable('capsule init defaults', error))
  }
  try {
    const lib = repo.libraryBuild()
    let ios
    try {
      ios = repo.packageSwift().platforms.iOS
    } catch {
      ios = undefined
    }
    sets.push({
      label: 'library (capsule-android AAR + iOS package)',
      pins: {
        'android.compileSdk': lib.compileSdk,
        'android.targetSdk': lib.targetSdk,
        'ios.deploymentTarget': ios,
      },
    })
  } catch (error) {
    errors.push(unavailable('library pins', error))
  }
  // Strip fields a set doesn't declare, so e.g. a library without targetSdk isn't reported as unknown.
  for (const set of sets) {
    for (const key of Object.keys(set.pins)) if (set.pins[key] === undefined) delete set.pins[key]
  }
  return { sets, errors }
}

/** Findings → rows; a field no pin set declares becomes one ⚪ row (e.g. the Xcode version CI uses). */
export function findingRows(findingsBySet) {
  const rows = []
  const unpinned = new Map()
  for (const { label, pins, findings } of findingsBySet) {
    for (const f of findings) {
      if (!(f.field in pins)) {
        if (!unpinned.has(f.ruleId)) unpinned.set(f.ruleId, f)
        continue
      }
      rows.push(findingRow(f, label))
    }
  }
  const declared = new Set(findingsBySet.flatMap((s) => Object.keys(s.pins)))
  for (const f of unpinned.values()) {
    if (declared.has(f.field)) continue
    rows.push(
      row({
        name: `${f.ruleId} — not pinned in the repo`,
        current: '—',
        latest: required(f),
        status: STATUS.unavailable,
        note: `${f.message ?? ''} Check it on the build machine / CI runner.`.trim(),
        source: f.source,
      })
    )
  }
  return rows
}

/** How long ago someone checked requirements.json against the store pages. */
export function reviewedRow(requirements, today, staleDays) {
  const reviewed = requirements.reviewed
  const age = reviewed
    ? Math.floor((today - new Date(`${reviewed}T00:00:00Z`)) / 86_400_000)
    : undefined
  const stale = age === undefined || age > staleDays
  return row({
    name: 'requirements.json reviewed',
    current: reviewed || 'never',
    status: stale ? STATUS.yellow : STATUS.green,
    note: stale
      ? `older than ${staleDays} days — re-read the store pages and update the rules + "reviewed"`
      : `${age} day(s) ago`,
    source: PATHS.requirements,
  })
}

const required = (f) => `≥ ${f.required}${f.effective ? ` from ${f.effective}` : ''}`

function findingRow(f, label) {
  return row({
    name: `${f.ruleId} — ${label}`,
    current: f.current ?? '—',
    latest: required(f),
    status: FINDING_STATUS[f.status] ?? STATUS.unavailable,
    note: f.message ?? f.status, // the evaluator's message already names days left and any extension
    source: f.source,
  })
}

/**
 * The CLI's evaluator — the same code `capsule doctor` runs. The built module first; otherwise the
 * TypeScript source, which Node ≥ 22.18 loads by stripping types. `undefined` when neither loads.
 */
export async function loadEvaluator(repo) {
  for (const file of [PATHS.requirementsDist, PATHS.requirementsSrc]) {
    if (!repo.exists(file)) continue
    try {
      return await import(pathToFileURL(repo.path(file)).href)
    } catch {
      // an older Node without type stripping — try the next candidate
    }
  }
  return undefined
}

/** Watch rows; returns `{ rows, accepted }` where `accepted` maps watch id → new hash to record. */
export async function watchRows(watch, http, acceptWatch) {
  const rows = []
  const accepted = {}
  for (const w of watch ?? []) {
    try {
      const hash = pageHash(await http.text(w.url))
      const accept = acceptWatch === 'all' || acceptWatch?.has?.(w.id)
      if (accept) {
        accepted[w.id] = hash
        rows.push(
          row({
            name: `watch: ${w.id}`,
            current: hash.slice(0, 12),
            status: STATUS.green,
            note: 'accepted — recorded in requirements.json',
            source: w.url,
          })
        )
      } else if (!w.sha256) {
        rows.push(
          row({
            name: `watch: ${w.id}`,
            current: hash.slice(0, 12),
            status: STATUS.yellow,
            note: `never reviewed → read the page, check requirements.json, then --accept-watch ${w.id}`,
            source: w.url,
          })
        )
      } else if (w.sha256 !== hash) {
        rows.push(
          row({
            name: `watch: ${w.id}`,
            current: w.sha256.slice(0, 12),
            latest: hash.slice(0, 12),
            status: STATUS.yellow,
            note: `page changed since last review (${w.reviewed || '?'}) → read it, update requirements.json, then --accept-watch ${w.id}`,
            source: w.url,
          })
        )
      } else {
        rows.push(
          row({
            name: `watch: ${w.id}`,
            current: hash.slice(0, 12),
            status: STATUS.green,
            note: `unchanged since review ${w.reviewed || ''}`.trim(),
            source: w.url,
          })
        )
      }
    } catch (error) {
      rows.push(unavailable(`watch: ${w.id}`, error, w.url))
    }
  }
  return { rows, accepted }
}

export default {
  id: 'store',
  title: 'Store requirements (Google Play · App Store)',
  async run(ctx) {
    const { repo, http, today } = ctx
    if (!repo.exists(PATHS.requirements)) {
      return [unavailable('requirements.json', `${PATHS.requirements} not found`)]
    }
    const requirements = JSON.parse(repo.read(PATHS.requirements))
    const rows = []

    const evaluator = await loadEvaluator(repo)
    if (!evaluator?.evaluateRequirements) {
      rows.push(
        unavailable(
          'rule evaluation',
          `can't load ${PATHS.requirementsDist} — run pnpm build first`
        )
      )
    } else {
      const { sets, errors } = collectPins(repo)
      rows.push(...errors)
      const evaluated = sets.map((set) => ({
        ...set,
        findings: evaluator.evaluateRequirements(requirements.rules ?? [], set.pins, today),
      }))
      rows.push(...findingRows(evaluated))
      rows.push(reviewedRow(requirements, today, evaluator.REQUIREMENTS_STALE_DAYS ?? 120))
    }

    const { rows: watched, accepted } = await watchRows(
      requirements.watch,
      http,
      ctx.options.acceptWatch
    )
    rows.push(...watched)
    if (Object.keys(accepted).length > 0) {
      const day = today.toISOString().slice(0, 10)
      for (const w of requirements.watch) {
        if (accepted[w.id]) Object.assign(w, { sha256: accepted[w.id], reviewed: day })
      }
      ctx.writeFile(PATHS.requirements, JSON.stringify(requirements, null, 2) + '\n')
    }
    return rows
  },
}
