#!/usr/bin/env node
/**
 * docs-check — keeps the documentation vault honest.
 *
 * Checks:
 *  1. Every entry in mkdocs.yml `nav:` resolves to a REAL file under `docs/`,
 *     matched case-exactly (Linux CI is case-sensitive; NTFS existsSync is not).
 *  2. Relative markdown links in the map/index level (CONTEXT.md, index.md,
 *     project/state.md, README.md) resolve to files.
 *  3. Reverse check: *.md files under docs/ not referenced by nav are listed
 *     as warnings (orphans — some are intentionally out of nav).
 *  4. Docs ↔ code metadata (docs/_core/conventions.md#doc-metadata):
 *     R1 every page has valid front matter · R2 every code:/tests: glob matches a file ·
 *     R3 every source-file Docs header points at a real doc/heading · R4 (warning) a file a
 *     page's code: covers has a header that doesn't list that page.
 *
 * Usage: `pnpm docs:check` from the repo root. Exit 1 on any failure.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  headingAnchors,
  isHeaderScanned,
  listRepoFiles,
  matchGlob,
  readCodeHeader,
  readDocsMeta,
} from './docs-lint/lib/meta.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const docsDir = join(root, 'docs')
const failures = []
const warnings = []

/** Case-exact existence: walk each component against the real dir listing. */
function pathExistsCaseExact(absPath) {
  if (!existsSync(absPath)) return false
  const parts = absPath.split(/[\\/]/).filter(Boolean)
  // Start the walk at the root: the drive on Windows (`D:\`), `/` on POSIX.
  let cur = /^[A-Za-z]:$/.test(parts[0]) ? parts.shift() + sep : sep
  for (const part of parts) {
    let entries
    try {
      entries = readdirSync(cur)
    } catch {
      return false
    }
    if (!entries.includes(part)) return false
    cur = join(cur, part)
  }
  return true
}

function fail(msg) {
  failures.push(msg)
}
function warn(msg) {
  warnings.push(msg)
}

// ── 1. mkdocs.yml nav entries resolve (case-exact) ─────────────────────────
const mkdocsPath = join(root, 'mkdocs.yml')
const mkdocs = readFileSync(mkdocsPath, 'utf8')
const navMatch = mkdocs.match(/^nav:\n([\s\S]*?)(?=^\S|$(?![\s\S]))/m)
if (!navMatch) {
  fail('mkdocs.yml: could not locate the `nav:` block')
} else {
  const navLines = navMatch[1].split('\n')
  let navCount = 0
  for (const line of navLines) {
    const m = line.match(/^\s*-\s*.+?:\s+(\S+\.md)\s*$/)
    if (!m) continue
    navCount++
    const rel = m[1]
    const abs = join(docsDir, rel)
    if (!pathExistsCaseExact(abs)) {
      // reference/generated/** is produced by `pnpm gen` — absent until it runs.
      if (rel.startsWith('reference/generated/') && !existsSync(abs)) {
        warn(`nav → "${rel}" not generated yet (run pnpm gen)`)
      } else {
        fail(`nav → "${rel}" does not resolve case-exactly under docs/`)
      }
    }
  }
  console.log(`nav: ${navCount} pages parsed`)
}

// ── 2. Links in map/index level resolve ────────────────────────────────────
const mapLevelFiles = [
  join(root, 'README.md'),
  join(root, 'AGENTS.md'),
  join(docsDir, 'CONTEXT.md'),
  join(docsDir, 'index.md'),
  join(docsDir, 'project/state.md'),
]
for (const file of mapLevelFiles) {
  if (!existsSync(file)) {
    fail(`missing vault file: ${file}`)
    continue
  }
  const text = readFileSync(file, 'utf8')
  const linkRe = /\]\(([^)\s#]+)\.md(#[^)]*)?\)/g
  let m
  while ((m = linkRe.exec(text)) !== null) {
    const target = m[1] + '.md'
    if (/^[a-z]+:/i.test(target)) continue // external URL
    const abs = resolve(dirname(file), target)
    if (!pathExistsCaseExact(abs)) {
      fail(`${file.slice(root.length + 1)} → dead link "${target}"`)
    }
  }
}

// ── 3. Orphans: docs/**/*.md not referenced by nav (warning only) ──────────
const navPaths = new Set()
{
  const re = /^\s*-\s*.+?:\s+(\S+\.md)\s*$/gm
  let mm
  while ((mm = re.exec(navMatch ? navMatch[1] : '')) !== null) {
    navPaths.add(mm[1].replace(/\//g, sep))
  }
}
function walk(dir) {
  const out = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (e.endsWith('.md')) out.push(p)
  }
  return out
}
// Files intentionally out of nav (internal vault mechanics, not public docs). POSIX paths.
const knownInternal = new Set(['CONTEXT.md', '_core/conventions.md'])
for (const abs of walk(docsDir)) {
  const rel = abs.slice(docsDir.length + 1)
  const posix = rel.replace(/\\/g, '/')
  // TypeDoc's per-module pages are reached from generated/core/README.md (in nav); their names
  // follow the @module tags, so nav doesn't list them one by one.
  const typedocPage =
    posix.startsWith('reference/generated/core/') && posix !== 'reference/generated/core/README.md'
  if (!navPaths.has(rel) && !knownInternal.has(posix) && !typedocPage) {
    warn(`orphan (not in nav): ${rel}`)
  }
}

// ── 4. Docs ↔ code metadata (docs/_core/conventions.md#doc-metadata) ────────
{
  const files = listRepoFiles(root)
  const docs = readDocsMeta(root, files)

  // R1: front matter schema.
  for (const { rel, problems } of docs) {
    for (const problem of problems) fail(`${rel}: front matter — ${problem}`)
  }

  // R2: every code:/tests: glob still matches something.
  let globCount = 0
  for (const { rel, data } of docs) {
    for (const key of ['code', 'tests']) {
      for (const glob of Array.isArray(data?.[key]) ? data[key] : []) {
        globCount++
        if (matchGlob(files, glob).length === 0)
          fail(`${rel}: ${key} glob matches no file: ${glob}`)
      }
    }
  }

  // R3: every code header points at a real doc (and heading).
  const headers = new Map() // repo-relative source path → [{ ref, path, anchor }]
  for (const rel of files.filter(isHeaderScanned)) {
    const refs = readCodeHeader(readFileSync(join(root, rel), 'utf8'))
    if (refs) headers.set(rel, refs)
  }
  const anchorsOf = new Map()
  for (const [rel, refs] of headers) {
    for (const { ref, path, anchor } of refs) {
      const abs = join(root, path)
      if (!pathExistsCaseExact(abs) || !statSync(abs).isFile()) {
        fail(`${rel}: Docs header → "${ref}" does not exist`)
        continue
      }
      if (anchor && path.endsWith('.md')) {
        if (!anchorsOf.has(path)) anchorsOf.set(path, headingAnchors(readFileSync(abs, 'utf8')))
        if (!anchorsOf.get(path).has(anchor.toLowerCase()))
          fail(`${rel}: Docs header → "${ref}": no such heading`)
      }
    }
  }

  // R4: a covered file whose header doesn't name the page that covers it (warning).
  let backLinkGaps = 0
  for (const { rel, data } of docs) {
    const covered = new Set(
      (Array.isArray(data?.code) ? data.code : []).flatMap((g) => matchGlob(files, g))
    )
    for (const file of covered) {
      const refs = headers.get(file)
      if (refs && !refs.some((r) => r.path === rel)) {
        backLinkGaps++
        warn(`${file}: Docs header doesn't list ${rel}, whose code: covers it`)
      }
    }
  }

  const withCode = docs.filter((d) => Array.isArray(d.data?.code) && d.data.code.length).length
  console.log(
    `metadata: ${docs.length} pages (${withCode} with code globs, ${globCount} globs) · ` +
      `${headers.size} code headers · ${backLinkGaps} back-link gap(s)`
  )
}

// ── Report ──────────────────────────────────────────────────────────────────
for (const w of warnings) console.log('  ⚠ ' + w)
if (failures.length) {
  for (const f of failures) console.error('  ✗ ' + f)
  console.error(`docs-check: ${failures.length} failure(s), ${warnings.length} warning(s)`)
  process.exit(1)
}
console.log(`docs-check: all green (${warnings.length} warning(s))`)
