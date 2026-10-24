/**
 * Route contract — the cheapest, highest-value guard.
 *
 * Statically scans your own source for the routes the UI relies on
 * (`bridge.call('x', …)` and `fetch('/api/y')`) and fails if the matching
 * handler file is missing. This catches the classic "Server tab returns 404
 * because nobody added the route file" bug before the app is ever built.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SRC = resolve(__dirname, '..') // → src/

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'test' || name === 'node_modules') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    // any source file across the supported frameworks (React/Vue/Svelte/Angular/vanilla/jQuery)
    else if (/\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|html)$/.test(name)) out.push(p)
  }
  return out
}

const sources = walk(SRC).map((f) => readFileSync(f, 'utf8'))

const rpcMethods = new Set<string>()
const httpPaths = new Set<string>()
for (const text of sources) {
  // bridge.call('method', …)  /  bridge.call<T>('method', …)
  for (const m of text.matchAll(/bridge\.call(?:<[^>]*>)?\(\s*['"`]([^'"`]+)['"`]/g)) {
    rpcMethods.add(m[1])
  }
  // fetch('/api/x')  (ignore query string)
  for (const m of text.matchAll(/fetch\(\s*['"`](\/api\/[^'"`?]+)['"`]/g)) {
    httpPaths.add(m[1])
  }
}

describe('route contract', () => {
  it('every bridge.call(method) has a src/routes/<method>.ts handler', () => {
    const missing = [...rpcMethods].filter((m) => !existsSync(join(SRC, 'routes', `${m}.ts`)))
    expect(missing, `Missing JSON-RPC route file(s): ${missing.join(', ') || '(none)'}`).toEqual([])
  })

  it('every fetch("/api/x") has a matching src/server/routes handler', () => {
    const missing = [...httpPaths].filter((p) => {
      const rel = p.replace(/^\/api\//, '') // "ping" or "items/featured"
      return !existsSync(join(SRC, 'server', 'routes', `${rel}.ts`))
    })
    expect(missing, `Missing HTTP route file(s): ${missing.join(', ') || '(none)'}`).toEqual([])
  })
})
