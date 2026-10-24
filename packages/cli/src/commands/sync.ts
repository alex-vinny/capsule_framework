// Docs: docs/reference/cli.md
import { Command } from 'commander'
import { syncProject } from '../sync/sync.js'

const command = new Command('sync')
  .option('--frozen-lockfile', 'fail if capsule.lock is out of date')
  .description('Regenerate .capsule/ wrappers from capsule.config.ts and capsule.lock')
  .action(async (opts) => {
    await syncProject(process.cwd(), { frozenLockfile: opts.frozenLockfile })
  })

export default command
