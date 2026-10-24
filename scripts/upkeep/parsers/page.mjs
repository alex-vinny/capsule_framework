// Reduces a store-policy web page to its readable text so a hash of it changes only when the
// words change — not when a script nonce, a tracking pixel or the navigation menu does.

import { createHash } from 'node:crypto'

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

/** HTML → collapsed main-content text. Prefers `<main>`, then `<article>`, then `<body>`. */
export function mainText(html) {
  let text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(
      /<(script|style|noscript|svg|template|iframe|nav|header|footer|aside|form|button)\b[\s\S]*?<\/\1\s*>/gi,
      ' '
    )
  const region =
    /<main\b[^>]*>([\s\S]*?)<\/main\s*>/i.exec(text) ??
    /<article\b[^>]*>([\s\S]*?)<\/article\s*>/i.exec(text) ??
    /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(text)
  if (region) text = region[1]
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (all, name) => {
      if (name[0] === '#') {
        const code =
          name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
        return Number.isFinite(code) ? String.fromCodePoint(code) : all
      }
      return ENTITIES[name.toLowerCase()] ?? all
    })
    .replace(/\s+/g, ' ')
    .trim()
}

export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** The hash `--accept-watch` records and the report compares against. */
export const pageHash = (html) => sha256(mainText(html))
