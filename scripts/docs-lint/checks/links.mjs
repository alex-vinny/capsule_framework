// Link integrity: every relative Markdown link resolves to a real file, and
// every #anchor resolves to a real heading. External (http/mailto/…) links are
// skipped. Broken file targets FAIL; missing anchors WARN (slug rules vary).

import { existsSync } from 'node:fs'
import { resolve, dirname, extname, join, relative } from 'node:path'

// reference/generated/** is produced by `pnpm gen` (TypeDoc + CLI/config generators) and may
// be absent in a fresh checkout; links into it are not reported as broken.
const isGenerated = (docsDir, p) =>
  relative(join(docsDir, 'reference', 'generated'), p).split(/[\\/]/)[0] !== '..'

const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

export default {
  name: 'links',
  run(ctx, report) {
    for (const f of ctx.mdFiles) {
      // Generated pages are owned by their generator (TypeDoc names duplicate anchors its own way).
      if (isGenerated(ctx.docsDir, f)) continue
      ctx
        .read(f)
        .split('\n')
        .forEach((text, i) => {
          const ln = i + 1
          let m
          LINK.lastIndex = 0
          while ((m = LINK.exec(text))) {
            const target = m[1]
            if (/^(https?:|mailto:|tel:|data:|#?\{)/i.test(target)) continue
            const [pathPart, anchor] = target.split('#')

            if (pathPart === '') {
              // pure in-page #anchor
              if (anchor && !ctx.anchors.get(f).has(anchor.toLowerCase())) {
                report.warn(ctx.rel(f), ln, `in-page anchor not found: #${anchor}`)
              }
              continue
            }

            const resolved = resolve(dirname(f), pathPart)
            if (!existsSync(resolved)) {
              if (isGenerated(ctx.docsDir, resolved)) continue
              report.fail(ctx.rel(f), ln, `broken link → ${target}`)
              continue
            }
            if (anchor && extname(resolved).toLowerCase() === '.md') {
              const set = ctx.anchors.get(resolved)
              if (set && !set.has(anchor.toLowerCase())) {
                report.warn(ctx.rel(f), ln, `anchor not found in ${pathPart}: #${anchor}`)
              }
            }
          }
        })
    }
  },
}
