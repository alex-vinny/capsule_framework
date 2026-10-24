// Docs: docs/contributing/codesync-internals.md, docs/guide/ota-updates.md
import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
// __dirname is provided by Node.js (CommonJS)
const storageDir = process.env.CODESYNC_STORAGE_DIR ?? join(__dirname, '..', 'storage')
const bundlesDir = join(storageDir, 'bundles')
const manifestPath = join(storageDir, 'manifest.json')

if (!existsSync(storageDir)) {
  mkdirSync(storageDir, { recursive: true })
}
if (!existsSync(bundlesDir)) {
  mkdirSync(bundlesDir, { recursive: true })
}

// Load or create manifest
let manifest = {
  channels: {} as Record<
    string,
    { version: string; buildNumber: number; publishedAt: string; paused?: boolean }
  >,
  releases: [] as Array<{
    version: string
    buildNumber: number
    channel: string
    publishedAt: string
    notes?: string
  }>,
}

if (existsSync(manifestPath)) {
  try {
    const data = readFileSync(manifestPath, 'utf8')
    manifest = JSON.parse(data)
  } catch (e) {
    console.error('Failed to load manifest, starting fresh:', e)
  }
}

const saveManifest = () => {
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
}

const hashBuffer = (buf: Buffer): string => {
  return createHash('sha256').update(buf).digest('hex')
}

const server = Fastify({ logger: true })

// Register multipart
server.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
})

server.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() }
})

server.get('/bundles/:version', async (request, reply) => {
  const { version } = request.params as { version: string }
  const { channel = 'production' } = request.query as { channel?: string }

  let targetVersion = version
  if (version === 'latest') {
    const chanInfo = manifest.channels[channel]
    if (!chanInfo) {
      return reply.code(404).send({ error: `Channel ${channel} not found` })
    }
    targetVersion = chanInfo.version
  }

  const filePath = join(bundlesDir, `${targetVersion}.js`)
  if (!existsSync(filePath)) {
    return reply.code(404).send({ error: `Bundle ${targetVersion} not found` })
  }

  const buf = readFileSync(filePath)
  const etag = hashBuffer(buf)

  reply.header('Content-Type', 'application/javascript').header('ETag', etag).send(buf)
})

server.get('/manifest', async (request, reply) => {
  const { channel } = request.query as { channel?: string }
  if (channel) {
    const chan = manifest.channels[channel]
    if (!chan) {
      return reply.code(404).send({ error: `Channel ${channel} not found` })
    }
    return { [channel]: chan }
  }
  return manifest
})

server.post('/publish', async (request, reply) => {
  // API key auth
  const apiKey = request.headers['x-api-key']
  const expected = process.env.CODESYNC_API_KEY
  if (!apiKey || apiKey !== expected) {
    return reply.code(401).send({ error: 'Unauthorized' })
  }

  try {
    const data = await request.file()
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' })
    }

    // @fastify/multipart v7 exposes field values as { type, fieldname, value, ... }
    // objects, not plain strings — unwrap .value from each.
    const field = (name: string): string | undefined => {
      const f = (data.fields as Record<string, { value?: string } | undefined>)[name]
      return typeof f === 'string' ? f : f?.value
    }
    const version = field('version')
    const buildNumber = field('buildNumber')
    const notes = field('notes')
    const channel = field('channel')

    if (!version || !buildNumber) {
      return reply.code(400).send({ error: 'Version and buildNumber required' })
    }

    const buildNum = parseInt(buildNumber, 10)
    if (isNaN(buildNum)) {
      return reply.code(400).send({ error: 'buildNumber must be integer' })
    }

    const chan = channel ?? 'production'
    const notesStr = notes ?? undefined

    // Read file content
    const buf = await data.toBuffer()

    // Save bundle
    const bundlePath = join(bundlesDir, `${version}.js`)
    if (existsSync(bundlePath)) {
      return reply.code(409).send({ error: `Version ${version} already exists` })
    }
    writeFileSync(bundlePath, buf)

    // Update manifest
    const now = new Date().toISOString()
    manifest.channels[chan] = {
      version,
      buildNumber: buildNum,
      publishedAt: now,
      paused: false,
    }

    manifest.releases.push({
      version,
      buildNumber: buildNum,
      channel: chan,
      publishedAt: now,
      notes: notesStr,
    })

    saveManifest()

    reply.code(201).send({
      version,
      buildNumber: buildNum,
      channel: chan,
      publishedAt: now,
    })
  } catch (err: any) {
    request.log.error(err)
    return reply.code(500).send({ error: 'Internal server error' })
  }
})

server.get('/releases', async (request, reply) => {
  const { channel } = request.query as { channel?: string }
  let rels = manifest.releases
  if (channel) {
    rels = rels.filter((r) => r.channel === channel)
  }
  // Sort descending by publishedAt
  rels = [...rels].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  )
  return rels
})

server.post('/rollback', async (request, reply) => {
  const apiKey = request.headers['x-api-key']
  const expected = process.env.CODESYNC_API_KEY
  if (!apiKey || apiKey !== expected) {
    return reply.code(401).send({ error: 'Unauthorized' })
  }

  const { channel = 'production' } = request.body as { channel?: string }
  const chanInfo = manifest.channels[channel]
  if (!chanInfo) {
    return reply.code(404).send({ error: `Channel ${channel} not found` })
  }

  // Find previous release for this channel
  const releasesForChan = manifest.releases
    .filter((r) => r.channel === channel)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())

  if (releasesForChan.length < 2) {
    return reply
      .code(404)
      .send({ error: `No previous version to roll back to for channel ${channel}` })
  }

  const previous = releasesForChan[1] // current is [0]
  // Update channel to previous
  manifest.channels[channel] = {
    version: previous.version,
    buildNumber: previous.buildNumber,
    publishedAt: new Date().toISOString(),
    paused: false,
  }
  saveManifest()

  reply.send({
    version: previous.version,
    buildNumber: previous.buildNumber,
    channel,
    rolledBackAt: new Date().toISOString(),
  })
})

server.post('/pause', async (request, reply) => {
  const apiKey = request.headers['x-api-key']
  const expected = process.env.CODESYNC_API_KEY
  if (!apiKey || apiKey !== expected) {
    return reply.code(401).send({ error: 'Unauthorized' })
  }

  const { channel = 'production' } = request.body as { channel?: string }
  if (!manifest.channels[channel]) {
    return reply.code(404).send({ error: `Channel ${channel} not found` })
  }
  manifest.channels[channel].paused = true
  saveManifest()
  reply.send({ channel, pausedAt: new Date().toISOString() })
})

server.post('/resume', async (request, reply) => {
  const apiKey = request.headers['x-api-key']
  const expected = process.env.CODESYNC_API_KEY
  if (!apiKey || apiKey !== expected) {
    return reply.code(401).send({ error: 'Unauthorized' })
  }

  const { channel = 'production' } = request.body as { channel?: string }
  if (!manifest.channels[channel]) {
    return reply.code(404).send({ error: `Channel ${channel} not found` })
  }
  manifest.channels[channel].paused = false
  saveManifest()
  reply.send({ channel, resumedAt: new Date().toISOString() })
})

server.get('/devices', async (request, reply) => {
  const apiKey = request.headers['x-api-key']
  const expected = process.env.CODESYNC_API_KEY
  if (!apiKey || apiKey !== expected) {
    return reply.code(401).send({ error: 'Unauthorized' })
  }
  // No-op, just return 204
  return reply.code(204).send()
})

const start = async () => {
  try {
    await server.listen({ port: 3000, host: '0.0.0.0' })
    const addresses = server.addresses()
    let port = 3000
    if (addresses.length > 0) {
      const first = addresses[0]
      if (typeof first === 'object' && 'port' in first) {
        port = first.port
      }
    }
    server.log.info(`Codesync API listening on port ${port}`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

// Auto-start unless running under vitest — tests use server.inject() instead.
if (!process.env.VITEST) {
  start()
}

export { server }
