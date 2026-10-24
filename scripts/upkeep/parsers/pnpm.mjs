// Parsers for `pnpm outdated -r --format json` and `pnpm audit --json`.

/**
 * `pnpm outdated --format json` → `{ name, current, wanted, latest, dependencyType, dependents }[]`.
 * pnpm prints an object keyed by package name; with `-r` each value also lists `dependentPackages`.
 * An array form (some pnpm versions) is accepted too.
 */
export function parseOutdated(json) {
  if (!json) return []
  const entries = Array.isArray(json)
    ? json.map((e) => [e.packageName ?? e.name, e])
    : Object.entries(json)
  return entries.map(([name, e]) => ({
    name,
    current: e.current ?? '',
    wanted: e.wanted ?? '',
    latest: e.latest ?? '',
    dependencyType: e.dependencyType ?? '',
    deprecated: Boolean(e.isDeprecated),
    dependents: (e.dependentPackages ?? []).map((d) => d.name).filter(Boolean),
  }))
}

/**
 * `pnpm audit --json` (npm v6-style report) → `{ id, module, severity, title, url, vulnerable, patched, paths }[]`,
 * worst first.
 */
export function parseAudit(json) {
  const order = { critical: 4, high: 3, moderate: 2, low: 1, info: 0 }
  const advisories = Object.values(json?.advisories ?? {}).map((a) => ({
    id: a.github_advisory_id ?? String(a.id ?? ''),
    module: a.module_name,
    severity: a.severity ?? 'unknown',
    title: a.title ?? '',
    url: a.url ?? '',
    vulnerable: a.vulnerable_versions ?? '',
    patched: a.patched_versions ?? '',
    paths: [...new Set((a.findings ?? []).flatMap((f) => f.paths ?? []))],
  }))
  return advisories.sort((a, b) => (order[b.severity] ?? -1) - (order[a.severity] ?? -1))
}
