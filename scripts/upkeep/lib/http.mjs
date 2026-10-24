// The one place the upkeep report touches the network. Sections get `ctx.http` and never call
// `fetch` themselves, so tests inject a fake and stay offline.

const TIMEOUT_MS = 20_000

/**
 * `fetchImpl` defaults to the global fetch; `offline` makes every request fail fast (rows become ⚪).
 * `token` (GITHUB_TOKEN) is sent to api.github.com only.
 */
export function createHttp({ fetchImpl = globalThis.fetch, offline = false, token } = {}) {
  const cache = new Map()

  async function request(url, { accept } = {}) {
    if (offline) throw new Error('offline')
    if (cache.has(url)) return cache.get(url)
    // An explicit language: developer.android.com otherwise picks one per visitor (machine-translated
    // pages), and the watched pages' hashes would change from run to run.
    const headers = {
      'user-agent': 'capsule-upkeep (+https://github.com/alex-vinny/capsule_framework)',
      'accept-language': 'en-US,en;q=0.9',
    }
    if (accept) headers.accept = accept
    if (token && new URL(url).hostname === 'api.github.com')
      headers.authorization = `Bearer ${token}`
    const pending = (async () => {
      const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!response.ok) {
        const limited =
          response.status === 403 && response.headers?.get?.('x-ratelimit-remaining') === '0'
        throw new Error(
          limited ? 'GitHub API rate limit — set GITHUB_TOKEN' : `HTTP ${response.status} ${url}`
        )
      }
      return response.text()
    })()
    cache.set(url, pending)
    pending.catch(() => cache.delete(url))
    return pending
  }

  return {
    text: (url, options) => request(url, options),
    json: async (url, options) =>
      JSON.parse(await request(url, { accept: 'application/json', ...options })),
  }
}

/** A fetch stand-in for tests: `routes` maps a URL (or a RegExp source) to a body, an object, or an Error. */
export function fakeFetch(routes) {
  return async (url) => {
    const key = Object.keys(routes).find((k) => k === url || new RegExp(k).test(url))
    if (key === undefined)
      return { ok: false, status: 404, headers: new Map(), text: async () => '' }
    const value = routes[key]
    if (value instanceof Error) throw value
    const body = typeof value === 'string' ? value : JSON.stringify(value)
    return { ok: true, status: 200, headers: new Map(), text: async () => body }
  }
}
