// Docs: docs/reference/cli.md, docs/decisions/0002-capsule-ui.md
import { Command } from 'commander'
import chalk from 'chalk'
import { join } from 'node:path'
import { addUiComponents, uiKitSourceDir } from '../lib/ui-kit.js'

// `capsule add-ui button card` — copies Capsule UI class builders (@capsule/ui-kit) into the
// app, shadcn-style: the app owns the copy. See packages/ui-kit for what each component offers.
const command = new Command('add-ui')
  .description('Copy Capsule UI components (Tailwind class builders) into this project')
  .argument('<components...>', 'component names, e.g. button card')
  .option('--dir <dir>', 'target directory, relative to the project', 'src/ui')
  .option('--force', 'overwrite files that already exist', false)
  .action((components: string[], opts: { dir: string; force: boolean }) => {
    try {
      const { copied, skipped } = addUiComponents({
        sourceDir: uiKitSourceDir(),
        targetDir: join(process.cwd(), opts.dir),
        components,
        force: opts.force,
      })
      for (const file of copied) console.log(chalk.green(`  ✓ ${opts.dir}/${file}`))
      for (const file of skipped) {
        console.log(
          chalk.yellow(`  • ${opts.dir}/${file} already exists — kept (--force overwrites)`)
        )
      }
      console.log(
        `\nEach file exports Tailwind class builders — apply them to your own elements, e.g.\n` +
          `  import { button } from './ui/components/button'\n` +
          `  <button class={button({ variant: 'outline', preset: 'ios' })}>Save</button>\n` +
          `Make sure your Tailwind content globs include ${opts.dir}/.`
      )
    } catch (e) {
      console.error(chalk.red((e as Error).message))
      process.exit(1)
    }
  })

export default command
