// Docs: docs/reference/cli.md
import { Command } from 'commander'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const { version } = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'))

/**
 * Builds the `capsule` command tree without parsing argv. `index.ts` parses it; the reference
 * generator (`scripts/gen/cli-reference.mjs`) walks it to write docs/reference/generated/cli.md.
 */
export async function createProgram(): Promise<Command> {
  const program = new Command()
    .name('capsule')
    .description('Capsule CLI — app ships inside a managed native capsule')
    .version(version)

  program.addCommand((await import('./commands/init.js')).default)
  program.addCommand((await import('./commands/add.js')).default)
  program.addCommand((await import('./commands/add-ui.js')).default)
  program.addCommand((await import('./commands/sync.js')).default)
  program.addCommand((await import('./commands/codesync.js')).default)
  program.addCommand((await import('./commands/dev.js')).default)
  program.addCommand((await import('./commands/build.js')).default)
  program.addCommand((await import('./commands/run.js')).default)
  program.addCommand((await import('./commands/test.js')).default)
  program.addCommand((await import('./commands/doctor.js')).default)

  return program
}
