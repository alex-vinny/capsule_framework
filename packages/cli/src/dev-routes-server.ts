// Docs: docs/reference/cli.md
import { createServer } from 'node:http'
import { existsSync, watch } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import type { Server, IncomingMessage } from 'node:http'

interface CachedModule {
  exports: Record<string, unknown>
  watcher: ReturnType<typeof watch>
}

const moduleCache = new Map<string, CachedModule>()

async function loadModule(filePath: string): Promise<Record<string, unknown>> {
  const cached = moduleCache.get(filePath)
  if (cached) return cached.exports

  const { transform } = await import('esbuild')
  const src = await readFile(filePath, 'utf-8')
  const { code } = await transform(src, {
    loader: 'ts',
    format: 'cjs',
    target: 'node18',
    logLevel: 'silent',
  })

  const moduleExports: Record<string, unknown> = {}
  const mod = { exports: moduleExports }
  const req = createRequire(filePath)

  runInNewContext(code, {
    module: mod,
    exports: moduleExports,
    require: req,
    __filename: filePath,
    __dirname: dirname(filePath),
    console,
    process,
  })

  const watcher = watch(filePath, () => {
    const entry = moduleCache.get(filePath)
    if (entry) {
      entry.watcher.close()
      moduleCache.delete(filePath)
    }
  })

  moduleCache.set(filePath, { exports: mod.exports as Record<string, unknown>, watcher })
  return mod.exports as Record<string, unknown>
}

async function dispatchRpc(
  projectRoot: string,
  method: string,
  params: unknown
): Promise<{ found: boolean; result?: unknown; error?: string }> {
  const filePath = join(projectRoot, 'src', 'routes', `${method}.ts`)
  if (!existsSync(filePath)) return { found: false }
  try {
    const mod = await loadModule(filePath)
    if (typeof mod.default !== 'function') return { found: false }
    const result = await (mod.default as (p: unknown) => unknown)(params)
    return { found: true, result }
  } catch (e) {
    return { found: true, error: String(e) }
  }
}

async function dispatchHttp(
  projectRoot: string,
  method: string,
  urlPath: string,
  body: string | null,
  headers: Record<string, string>
): Promise<{ found: boolean; status?: number; responseBody?: string; mimeType?: string }> {
  const rel = urlPath.replace(/^\/api\/?/, '')
  const filePath = join(projectRoot, 'src', 'server', 'routes', ...rel.split('/')) + '.ts'
  if (!existsSync(filePath)) return { found: false }

  try {
    const mod = await loadModule(filePath)
    const verb = method.toUpperCase()
    const handler = mod[verb]
    if (typeof handler !== 'function') {
      return {
        found: true,
        status: 405,
        responseBody: JSON.stringify({ error: 'Method not allowed' }),
        mimeType: 'application/json',
      }
    }
    const res = (await (handler as (r: unknown) => unknown)({
      method: verb,
      path: urlPath,
      body,
      headers,
    })) as {
      status?: number
      body?: string | null
      mimeType?: string
    }
    return {
      found: true,
      status: res.status ?? 200,
      responseBody: res.body ?? '',
      mimeType: res.mimeType ?? 'application/json',
    }
  } catch (e) {
    return {
      found: true,
      status: 500,
      responseBody: JSON.stringify({ error: String(e) }),
      mimeType: 'application/json',
    }
  }
}

export function getInjectScript(sidecarPort: number): string {
  return [
    ';(function(){',
    `  window.__CAPSULE_ROUTES_URL__='http://localhost:${sidecarPort}';`,
    `  var _f=window.fetch.bind(window);`,
    `  window.fetch=function(input,init){`,
    `    var url=typeof input==='string'?input:(input&&input.url)||'';`,
    `    if(url.startsWith('/api/')){return _f('http://localhost:${sidecarPort}'+url,init);}`,
    `    return _f(input,init);`,
    `  };`,
    `})();`,
  ].join('\n')
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
  })
}

export function startRouteServer(projectRoot: string, sidecarPort: number): Server {
  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = req.url ?? '/'

    // ── Inject script ────────────────────────────────────────────────────────
    if (url === '/__capsule.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' })
      res.end(getInjectScript(sidecarPort))
      return
    }

    // ── JSON-RPC ─────────────────────────────────────────────────────────────
    if (url === '/_capsule/rpc' && req.method === 'POST') {
      let payload: { method: string; params: unknown }
      try {
        const raw = await readBody(req)
        payload = JSON.parse(raw) as { method: string; params: unknown }
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON body' }))
        return
      }
      const { found, result, error } = await dispatchRpc(
        projectRoot,
        payload.method,
        payload.params
      )
      if (!found) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: `RPC route not found: ${payload.method}` }))
        return
      }
      if (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error }))
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
      return
    }

    // ── HTTP routes ──────────────────────────────────────────────────────────
    if (url.startsWith('/api/')) {
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method ?? '') ? await readBody(req) : null
      const headers: Record<string, string> = {}
      for (const [k, v] of Object.entries(req.headers)) {
        headers[k] = Array.isArray(v) ? v.join(', ') : (v ?? '')
      }
      const { found, status, responseBody, mimeType } = await dispatchHttp(
        projectRoot,
        req.method ?? 'GET',
        url,
        body,
        headers
      )
      if (!found) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: `HTTP route not found: ${url}` }))
        return
      }
      res.writeHead(status ?? 200, { 'Content-Type': mimeType ?? 'application/json' })
      res.end(responseBody ?? '')
      return
    }

    res.writeHead(404)
    res.end()
  })

  server.listen(sidecarPort)
  return server
}
