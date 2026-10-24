// The docs↔code link, shared by docs-check (rules R1–R4) and scripts/gen/docs-map.mjs.
// Zero dependencies (Node built-ins only). The format is documented in
// docs/_core/conventions.md#doc-metadata:
//
//  - front matter on every doc page: title, audience, status, and optional code/tests globs;
//  - a header comment near the top of a source file that names the doc(s) describing it.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const AUDIENCES = ['app-developer', 'contributor', 'maintainer', 'everyone']
export const STATUSES = ['current', 'planned', 'draft', 'record']
export const FRONT_MATTER_KEYS = ['title', 'audience', 'status', 'code', 'tests']
const LIST_KEYS = new Set(['code', 'tests'])

// ── Front matter ────────────────────────────────────────────────────────────

const unquote = (s) => {
  const v = s.trim()
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"'))
    return v.slice(1, -1).replace(/\\(["\\])/g, '$1')
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'"))
    return v.slice(1, -1).replace(/''/g, "'")
  return v
}

/**
 * Parses the YAML subset our front matter uses: `key: scalar`, `key: [a, b]` and `key:` followed
 * by `  - item` lines. Returns `{ data, body, lines }` — `lines` is how many lines the block
 * spans (0 when there is none) — or `{ error }` for a block that opens but never closes.
 */
export function parseFrontMatter(text) {
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!src.startsWith('---\n')) return { data: null, body: src, lines: 0 }
  const end = src.indexOf('\n---\n', 3)
  const endAtEof = end === -1 && src.endsWith('\n---') ? src.length - 4 : -1
  const close = end !== -1 ? end : endAtEof
  if (close === -1) return { error: 'front matter opens with --- but never closes' }

  const block = src.slice(4, close).split('\n')
  const data = {}
  const errors = []
  let listKey = null
  for (const raw of block) {
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) continue
    const item = /^\s+-\s+(.*)$/.exec(raw)
    if (item) {
      if (listKey) data[listKey].push(unquote(item[1]))
      else errors.push(`list item outside a list: "${raw.trim()}"`)
      continue
    }
    const kv = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/.exec(raw)
    if (!kv) {
      errors.push(`unreadable line: "${raw.trim()}"`)
      continue
    }
    const [, key, value = ''] = kv
    listKey = null
    if (value === '') {
      data[key] = []
      listKey = key
    } else if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim()
      data[key] = inner === '' ? [] : inner.split(',').map(unquote)
    } else {
      data[key] = unquote(value)
    }
  }
  const lines = src.slice(0, close + 4).split('\n').length
  const body = src.slice(close + 5)
  return { data, body, lines, errors }
}

/** R1: the schema problems in parsed front matter (empty array = valid). */
export function validateFrontMatter(data) {
  if (!data) return ['no front matter (title, audience, status)']
  const problems = []
  for (const key of Object.keys(data)) {
    if (!FRONT_MATTER_KEYS.includes(key)) problems.push(`unknown key "${key}"`)
  }
  if (typeof data.title !== 'string' || data.title.trim() === '') problems.push('missing title')
  if (!AUDIENCES.includes(data.audience))
    problems.push(`audience must be one of ${AUDIENCES.join(' | ')} (got "${data.audience ?? ''}")`)
  if (!STATUSES.includes(data.status))
    problems.push(`status must be one of ${STATUSES.join(' | ')} (got "${data.status ?? ''}")`)
  for (const key of LIST_KEYS) {
    if (data[key] === undefined) continue
    if (!Array.isArray(data[key])) problems.push(`${key} must be a list of globs`)
    else
      for (const glob of data[key]) {
        // A YAML scalar may not start with these — mkdocs would fail to read the page.
        if (/^[*&!{[|>'"%@`]/.test(glob))
          problems.push(`${key} glob "${glob}" must start with a path segment`)
        if (glob.startsWith('/') || glob.includes('..') || glob.includes('\\'))
          problems.push(`${key} glob "${glob}" must be repo-relative with forward slashes`)
      }
  }
  return problems
}

/** Serialises front matter the way `parseFrontMatter` reads it (block lists, quoted title). */
export function formatFrontMatter({ title, audience, status, code, tests }) {
  const out = [
    '---',
    `title: "${title.replace(/(["\\])/g, '\\$1')}"`,
    `audience: ${audience}`,
    `status: ${status}`,
  ]
  for (const [key, list] of [
    ['code', code],
    ['tests', tests],
  ]) {
    if (list && list.length) out.push(`${key}:`, ...list.map((g) => `  - ${g}`))
  }
  out.push('---', '')
  return out.join('\n')
}

// ── Globs ───────────────────────────────────────────────────────────────────

/** `**` = any number of path segments, `*` = within one segment, `?` = one character. */
export function globToRegExp(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      const slash = glob[i + 2] === '/'
      re += slash ? '(?:.*/)?' : '.*'
      i += slash ? 2 : 1
    } else if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

export const matchGlob = (files, glob) => {
  const re = globToRegExp(glob)
  return files.filter((f) => re.test(f))
}

// Never part of the documented source: dependencies, build output, caches.
export const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'build',
  'dist',
  '.gradle',
  '.capsule',
  '.turbo',
  '.tmp',
  '.cxx',
  '.externalNativeBuild',
  '.idea',
  '.swiftpm',
  '.build',
  'coverage',
  'site',
])

/**
 * Maps a repo-relative path to its spelling on disk, or null when it is gone. On a
 * case-insensitive file system git can list a file under the case it was first added with
 * (CONVENTIONS.md after a rename to conventions.md); the disk spelling is the one that counts.
 */
function diskCase(root) {
  const listings = new Map()
  const list = (dir) => {
    if (!listings.has(dir)) {
      try {
        listings.set(dir, readdirSync(join(root, dir)))
      } catch {
        listings.set(dir, [])
      }
    }
    return listings.get(dir)
  }
  return (rel) => {
    let dir = ''
    for (const part of rel.split('/')) {
      const entries = list(dir)
      const actual = entries.includes(part)
        ? part
        : entries.find((e) => e.toLowerCase() === part.toLowerCase())
      if (actual === undefined) return null
      dir = dir ? `${dir}/${actual}` : actual
    }
    return existsSync(join(root, dir)) ? dir : null
  }
}

/**
 * Every file under `root`, as sorted repo-relative POSIX paths. Inside a git checkout this is the
 * tracked plus untracked-but-not-ignored files that exist on disk, so generated output is the
 * same on every machine; otherwise a directory walk that skips SKIP_DIRS.
 */
export function listRepoFiles(root) {
  try {
    const out = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 64 * 1024 * 1024,
      }
    )
    const onDisk = diskCase(root)
    const files = out
      .split('\0')
      .filter((f) => f && !f.split('/').some((part) => SKIP_DIRS.has(part)))
      .map(onDisk)
      .filter(Boolean)
    if (files.length > 0) return [...new Set(files)].sort()
  } catch {
    // not a git checkout, or git missing — walk the tree instead
  }
  const out = []
  const visit = (dir, rel) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) visit(join(dir, entry.name), childRel)
      } else if (entry.isFile()) out.push(childRel)
    }
  }
  visit(root, '')
  return out.sort()
}

// ── Code headers ────────────────────────────────────────────────────────────

export const HEADER_LINES = 15
const HEADER = /^\s*(?:\/\/|#|--|\*)\s*Docs:\s*(.+)$/

const SOURCE_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|kt|kts|java|swift|c|h|cc|cpp|m|mm|py|sh|ps1|yml|yaml|css|scss|gradle|cmake)$|(^|\/)CMakeLists\.txt$/

/** R3 scope: where code headers are looked for. Vendored upstream sources are never scanned. */
export function isHeaderScanned(rel) {
  if (!SOURCE_EXT.test(rel)) return false
  if (/^packages\/native\/(civetweb|quickjs)\//.test(rel)) return false
  if (rel.startsWith('packages/') || rel.startsWith('scripts/')) return true
  return /^examples\/[^/]+\/src\//.test(rel)
}

/** The doc references in a source file's header, or null when it has none. */
export function readCodeHeader(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/, HEADER_LINES)
  for (const line of lines) {
    const m = HEADER.exec(line)
    if (!m) continue
    return m[1]
      .replace(/\s*(\*\/|-->)\s*$/, '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((ref) => {
        const [path, anchor] = ref.split('#')
        return { ref, path, anchor: anchor || undefined }
      })
  }
  return null
}

// ── Anchors ─────────────────────────────────────────────────────────────────

/**
 * The anchors a page defines. Both slug rules are accepted: GitHub's (one hyphen per space) and
 * Python-Markdown's, which mkdocs uses (runs of spaces and hyphens collapse to one hyphen).
 * Headings inside fenced code blocks are ignored.
 */
export function headingAnchors(text) {
  const anchors = new Set()
  let fence = null
  for (const line of text.split(/\r?\n/)) {
    const f = /^\s*(`{3,}|~{3,})/.exec(line)
    if (f) {
      if (!fence) fence = f[1][0]
      else if (f[1][0] === fence) fence = null
      continue
    }
    if (fence) continue
    const m = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line)
    if (!m) continue
    const explicit = /\{#([\w-]+)\}\s*$/.exec(m[1])
    if (explicit) anchors.add(explicit[1])
    const plain = m[1]
      .replace(/\{#[\w-]+\}\s*$/, '')
      .trim()
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
    anchors.add(plain.replace(/\s/g, '-'))
    anchors.add(plain.trim().replace(/[-\s]+/g, '-'))
  }
  return anchors
}

/** Parsed metadata for every doc page: `[{ rel, data, errors, problems }]` (rel = repo-relative). */
export function readDocsMeta(root, files) {
  return files
    .filter(
      (f) =>
        f.startsWith('docs/') && f.endsWith('.md') && !f.startsWith('docs/reference/generated/')
    )
    .map((rel) => {
      const parsed = parseFrontMatter(readFileSync(join(root, rel), 'utf8'))
      if (parsed.error) return { rel, data: null, problems: [parsed.error] }
      return {
        rel,
        data: parsed.data,
        problems: [...(parsed.errors ?? []), ...validateFrontMatter(parsed.data)],
      }
    })
}
