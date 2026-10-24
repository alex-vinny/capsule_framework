// @vitest-environment node
//
// Must run in the Node environment (not jsdom): esbuild asserts
// `new TextEncoder().encode("") instanceof Uint8Array`, which is false under
// jsdom's cross-realm TextEncoder. The real Node runtime is also the closest
// analogue to the embedded QuickJS host anyway.
/**
 * QuickJS fidelity — the layer that catches "works in the dev Node sidecar, but
 * breaks in the embedded runtime on device". Bundles your routes the same way
 * `capsule build` does, loads them into a real QuickJS WASM runtime, and drives
 * the dispatch contract Kotlin uses (`dispatch` / `handleHttpRequest`).
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { build } from 'esbuild'
import { getQuickJS } from 'quickjs-emscripten'
import { readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve, relative, basename } from 'node:path'

const ROOT = resolve(__dirname, '..', '..') // project root

function collect(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? collect(p) : p.endsWith('.ts') ? [p] : []
  })
}

// Mirrors the CLI's bundleRoutes(): register every route, bundle to an IIFE,
// then expose dispatch/handleHttpRequest as globals for QuickJS to call by name.
async function bundleRoutes(): Promise<string> {
  const rpcDir = join(ROOT, 'src', 'routes')
  const httpDir = join(ROOT, 'src', 'server', 'routes')
  const lines = [
    "import { dispatch, addRoute, handleHttpRequest, addHttpRoute } from '@capsule/core/routes';",
  ]
  collect(rpcDir).forEach((f, i) => {
    const method = basename(f, '.ts')
    const rel = './' + relative(ROOT, f).replace(/\\/g, '/')
    lines.push(`import rpc${i} from '${rel}';`, `addRoute(${JSON.stringify(method)}, rpc${i});`)
  })
  const VERBS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
  collect(httpDir).forEach((f, i) => {
    const apiPath = '/api/' + relative(httpDir, f).replace(/\\/g, '/').replace(/\.ts$/, '')
    const rel = './' + relative(ROOT, f).replace(/\\/g, '/')
    lines.push(`import * as http${i} from '${rel}';`)
    for (const v of VERBS) {
      lines.push(
        `if (typeof http${i}.${v} === 'function') addHttpRoute(${JSON.stringify(apiPath)}, '${v}', http${i}.${v});`
      )
    }
  })
  lines.push('export { dispatch, addRoute, handleHttpRequest, addHttpRoute };')

  const result = await build({
    stdin: { contents: lines.join('\n'), loader: 'ts', resolveDir: ROOT },
    bundle: true,
    format: 'iife',
    globalName: 'capsuleRouter',
    platform: 'neutral',
    write: false,
    logLevel: 'silent', // verb handlers a route doesn't export are expected
  })
  return (
    result.outputFiles[0].text +
    '\nvar dispatch = capsuleRouter.dispatch;' +
    '\nvar handleHttpRequest = capsuleRouter.handleHttpRequest;\n'
  )
}

describe('QuickJS fidelity (embedded runtime)', () => {
  let factory: Awaited<ReturnType<typeof getQuickJS>>
  let bundle = ''

  beforeAll(async () => {
    ;[factory, bundle] = await Promise.all([getQuickJS(), bundleRoutes()])
  })

  // Run `expr` in a fresh QuickJS context with the route bundle loaded, returning
  // the JSON.parsed result. Handles are always disposed (QuickJS is manual-GC).
  function evalJson(expr: string): unknown {
    const vm = factory.newContext()
    try {
      vm.unwrapResult(vm.evalCode(bundle)).dispose()
      const handle = vm.unwrapResult(vm.evalCode(expr))
      try {
        return JSON.parse(vm.getString(handle))
      } finally {
        handle.dispose()
      }
    } finally {
      vm.dispose()
    }
  }

  it('the route bundle evaluates cleanly under QuickJS', () => {
    const vm = factory.newContext()
    try {
      const r = vm.evalCode(bundle)
      if (r.error) {
        const err = vm.dump(r.error)
        r.error.dispose()
        throw new Error('bundle failed to evaluate in QuickJS: ' + JSON.stringify(err))
      }
      r.value.dispose()
    } finally {
      vm.dispose()
    }
  })

  it('dispatch("hello") returns the greeting', () => {
    const req = JSON.stringify({ id: '1', method: 'hello', params: { name: 'World' } })
    const out = evalJson(`JSON.stringify(dispatch(${JSON.stringify(req)}))`) as {
      result: { message: string }
    }
    expect(out.result.message).toContain('World')
  })

  it('handleHttpRequest GET /api/ping returns ok', () => {
    const out = evalJson(`JSON.stringify(handleHttpRequest('GET', '/api/ping', null, {}))`) as {
      status: number
      body: string
    }
    expect(out.status).toBe(200)
    expect(JSON.parse(out.body)).toMatchObject({ status: 'ok' })
  })

  it('fetch is NOT available in QuickJS — routes must not depend on it', () => {
    const vm = factory.newContext()
    try {
      const h = vm.unwrapResult(vm.evalCode('typeof fetch'))
      expect(vm.getString(h)).toBe('undefined')
      h.dispose()
    } finally {
      vm.dispose()
    }
  })
})
