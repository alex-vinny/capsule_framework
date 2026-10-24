// Docs: docs/reference/cli.md, docs/contributing/testing.md
import { Command } from 'commander'
import chalk from 'chalk'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execa } from 'execa'
import { loadConfig } from '../config.js'

/**
 * Runs the project's Vitest harness (added at `capsule init` via --test vitest).
 * Hermetic by default; pass CAPSULE_API_BASE to also run the HML integration test.
 *
 *   capsule test                 # one-shot, all suites
 *   capsule test --watch         # watch mode
 *   capsule test routes          # pass args/filters through to vitest
 */
const command = new Command('test')
  .argument('[args...]', 'arguments passed through to vitest (file filters, flags)')
  .option('--watch', 'run vitest in watch mode')
  .allowUnknownOption()
  .description('Run the app test suite (Vitest)')
  .action(async (args: string[], opts) => {
    const projectRoot = process.cwd()

    // Guard: must be a Capsule project.
    await loadConfig(projectRoot)

    if (!existsSync(join(projectRoot, 'vitest.config.ts'))) {
      console.error(chalk.red('No vitest.config.ts found.'))
      console.error(
        chalk.dim('This project was scaffolded without a test harness. Re-run with:') +
          '\n  ' +
          chalk.cyan('capsule init <name> --test vitest')
      )
      process.exit(1)
    }

    const vitestArgs = [...(opts.watch ? [] : ['run']), ...(args ?? [])]
    try {
      await execa('pnpm', ['exec', 'vitest', ...vitestArgs], {
        cwd: projectRoot,
        stdout: 'inherit',
        stderr: 'inherit',
      })
    } catch {
      // vitest already printed the failing tests; exit non-zero for CI.
      process.exit(1)
    }
  })

export default command
