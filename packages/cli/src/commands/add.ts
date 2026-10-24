// Docs: docs/reference/cli.md, docs/reference/lockfile.md
import { Command } from 'commander'
import chalk from 'chalk'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'
import { syncProject } from '../sync/sync.js'

const SUPPORTED_PLATFORMS = ['android', 'ios'] as const
type Platform = (typeof SUPPORTED_PLATFORMS)[number]

const command = new Command('add')
  .argument(
    '<platform>',
    'android | ios (ios is recorded in capsule.lock, but sync only generates android so far)'
  )
  .description('Add a platform to this Capsule project')
  .action(async (platform: string) => {
    if (!SUPPORTED_PLATFORMS.includes(platform as Platform)) {
      console.error(chalk.red(`Unknown platform: ${platform}. Use: android | ios`))
      process.exit(1)
    }

    const projectRoot = process.cwd()
    const lockPath = join(projectRoot, 'capsule.lock')

    const lockRaw = readFileSync(lockPath, 'utf8')
    const lock = (yaml.load(lockRaw) as Record<string, unknown>) ?? {}

    lock[platform] = {
      version: 'local',
      resolvedAt: new Date().toISOString(),
      _note: 'Run capsule sync to resolve from registry (Phase 2+)',
    }

    writeFileSync(lockPath, yaml.dump(lock))

    console.log(chalk.green(`Added ${platform} to capsule.lock`))
    console.log('Running capsule sync...')

    await syncProject(projectRoot)

    console.log(chalk.green(`Done. .capsule/${platform}/ generated.`))
  })

export default command
