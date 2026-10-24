// Findings collector shared by all checks. A finding is { level, file, line, msg }.
// `file` is a docs-relative path; `line` is 1-based (0 = whole file / N/A).

export function createReport() {
  const findings = []
  return {
    fail: (file, line, msg) => findings.push({ level: 'FAIL', file, line, msg }),
    warn: (file, line, msg) => findings.push({ level: 'WARN', file, line, msg }),
    findings,
    get fails() {
      return findings.filter((f) => f.level === 'FAIL')
    },
    get warns() {
      return findings.filter((f) => f.level === 'WARN')
    },
  }
}

export function printReport(report, { strict, fileCount, phaseCount }) {
  const fails = report.fails
  const warns = report.warns
  const promoted = strict ? [...fails, ...warns] : fails
  const shownWarns = strict ? [] : warns

  console.log(`docs-lint · ${fileCount} markdown files · phases 1..${phaseCount}\n`)
  const line = ({ level, file, line: ln, msg }) =>
    console.log(`[${level}] ${file}${ln ? ':' + ln : ''}  ${msg}`)
  promoted.forEach((f) => line({ ...f, level: 'FAIL' }))
  shownWarns.forEach(line)

  const ok = promoted.length === 0
  console.log(
    `\n${ok ? '✓' : '✗'} ${promoted.length} failure(s)` +
      (shownWarns.length ? `, ${shownWarns.length} warning(s)` : '') +
      (strict ? '  (--strict)' : '')
  )
  return ok ? 0 : 1
}
