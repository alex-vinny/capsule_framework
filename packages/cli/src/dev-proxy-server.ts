// Docs: docs/reference/cli.md
import { createServer, request as httpRequest } from 'node:http'
import { connect } from 'node:net'
import type { Server, IncomingMessage, ServerResponse } from 'node:http'

export function startDevProxy(bundlerPort: number, sidecarPort: number, proxyPort: number): Server {
  const server = createServer((req, res) => {
    const url = req.url ?? '/'
    if (url === '/__capsule.js' || url.startsWith('/api/') || url.startsWith('/_capsule/')) {
      forward(req, res, sidecarPort)
    } else {
      forwardInjectHtml(req, res, bundlerPort)
    }
  })

  server.on('upgrade', (req, socket, head) => {
    const dst = connect(bundlerPort, '127.0.0.1', () => {
      const raw =
        `${req.method} ${req.url} HTTP/1.1\r\n` +
        Object.entries(req.headers)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join('\r\n') +
        '\r\n\r\n'
      dst.write(raw)
      if (head.length) dst.write(head)
    })
    socket.pipe(dst)
    dst.pipe(socket)
    socket.on('error', () => dst.destroy())
    dst.on('error', () => socket.destroy())
  })

  server.listen(proxyPort)
  return server
}

function forward(req: IncomingMessage, res: ServerResponse, port: number): void {
  const p = httpRequest(
    { host: '127.0.0.1', port, method: req.method, path: req.url, headers: req.headers },
    (pr) => {
      res.writeHead(pr.statusCode ?? 200, pr.headers)
      pr.pipe(res)
    }
  )
  req.pipe(p)
  p.on('error', () => {
    res.writeHead(502)
    res.end()
  })
}

function forwardInjectHtml(req: IncomingMessage, res: ServerResponse, port: number): void {
  // Drop accept-encoding so the bundler returns uncompressed bytes we can read and
  // inject the <script src="/__capsule.js"> tag into. Without this, browsers (and the
  // on-device WebView) send `Accept-Encoding: gzip`, the bundler gzips the HTML, and we
  // would forward compressed bytes mislabeled as plain text/html — a garbled page with
  // no Capsule injection. curl hides the bug by not requesting compression by default.
  const headers = { ...req.headers }
  delete headers['accept-encoding']
  const p = httpRequest(
    { host: '127.0.0.1', port, method: req.method, path: req.url, headers },
    (pr) => {
      const ct = (pr.headers['content-type'] ?? '') as string
      if (ct.includes('text/html')) {
        const chunks: Buffer[] = []
        pr.on('data', (c: Buffer) => chunks.push(c))
        pr.on('end', () => {
          const html = Buffer.concat(chunks).toString('utf-8')
          const injected = html.replace(
            '</head>',
            '  <script src="/__capsule.js"></script>\n  </head>'
          )
          const buf = Buffer.from(injected, 'utf-8')
          const h = { ...pr.headers }
          delete h['content-encoding']
          h['content-length'] = String(buf.length)
          res.writeHead(pr.statusCode ?? 200, h)
          res.end(buf)
        })
      } else {
        res.writeHead(pr.statusCode ?? 200, pr.headers)
        pr.pipe(res)
      }
    }
  )
  req.pipe(p)
  p.on('error', () => {
    res.writeHead(502)
    res.end()
  })
}
