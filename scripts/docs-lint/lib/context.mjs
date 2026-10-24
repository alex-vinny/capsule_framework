// Shared context for all checks: the doc file list, readers, the canonical phase
// map parsed from the roadmap, and the loose title-matching helpers. Built once,
// passed to every check. Zero dependencies (Node built-ins only).

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

const SKIP_DIRS = new Set(['.git', 'node_modules'])

// Words ignored when loosely comparing a phase title to a canonical title.
// "native"/"look" are stopped so "native-look layer" (Capsule UI) does NOT
// collide with "Native APIs Expansion". "capsule" is the product name (it appears
// in the canonical title "Capsule UI" and in "@capsule/cli" everywhere) so it is
// noise, not a distinguishing token.
const STOP = new Set(['and', 'the', 'on', 'of', 'a', 'to', 'with', 'native', 'look', 'capsule'])

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(p, acc)
    } else if (extname(name).toLowerCase() === '.md') {
      acc.push(p)
    }
  }
  return acc
}

// GitHub-style heading anchor. Each whitespace char maps to one hyphen with no
// collapsing, so "Part 1 — Getting Started" → "part-1--getting-started".
export const slug = (s) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s/g, '-')

const tokenize = (s) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t && !STOP.has(t))
  )

export function buildContext(docsDir) {
  const read = (p) => readFileSync(p, 'utf8')
  const rel = (p) => relative(docsDir, p).replace(/\\/g, '/')
  const mdFiles = walk(docsDir)

  // anchors[file] = Set of heading slugs defined in that file
  const anchors = new Map()
  for (const f of mdFiles) {
    const set = new Set()
    for (const line of read(f).split('\n')) {
      const m = /^#{1,6}\s+(.*?)\s*$/.exec(line)
      if (m) set.add(slug(m[1]))
    }
    anchors.set(f, set)
  }

  // Canonical phase map { "1": "Foundation", ... } from the roadmap phase table.
  const roadmapPath = join(docsDir, 'project', 'roadmap.md')
  const canonical = new Map()
  const ROW = /^\|\s*\*\*Phase (\d+(?:\.\d+)?)\s+[—-]\s+([^*]+?)\*\*/
  if (existsSync(roadmapPath)) {
    for (const line of read(roadmapPath).split('\n')) {
      const m = ROW.exec(line)
      if (m) canonical.set(m[1], m[2].trim())
    }
  }

  // Loose title match: any shared significant *token*. (No substring fallback —
  // it spuriously matched "ui" inside "qUIckjs". Whole-token overlap is enough.)
  const compatible = (a, b) => {
    const y = tokenize(b)
    for (const t of tokenize(a)) if (y.has(t)) return true
    return false
  }

  // Which canonical (integer) phase, if any, a free title names.
  const findCanonMatch = (title) => {
    for (const [n, t] of canonical) if (!n.includes('.') && compatible(title, t)) return n
    return null
  }

  return {
    docsDir,
    read,
    rel,
    mdFiles,
    anchors,
    canonical,
    compatible,
    findCanonMatch,
    roadmapPath,
    principlesPath: join(docsDir, 'concepts', 'principles.md'),
    indexPath: join(docsDir, 'index.md'),
    historyPath: join(docsDir, 'project', 'history.md'),
  }
}
