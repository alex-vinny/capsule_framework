// Docs: docs/reference/cli.md
import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { execa } from 'execa'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

const command = new Command('run')
  .argument('<platform>', 'android (the only platform supported so far)')
  .option('--device <id>', 'target device ID (from: adb devices)')
  .option('--release', 'install the release APK instead of debug')
  .description('Install the built APK on a device or emulator (does not launch it)')
  .action(async (platform: string, opts) => {
    if (platform !== 'android') {
      console.error(chalk.red('Only android is supported in Phase 1'))
      process.exit(1)
    }

    const projectRoot = process.cwd()
    const outDir = join(projectRoot, '.capsule', 'android')

    let apkPath: string
    if (opts.release) {
      const signed = join(outDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
      const unsigned = join(
        outDir,
        'app',
        'build',
        'outputs',
        'apk',
        'release',
        'app-release-unsigned.apk'
      )
      apkPath = existsSync(signed) ? signed : unsigned
    } else {
      apkPath = join(outDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
    }

    const adbArgs = ['install', '-r', apkPath]
    if (opts.device) adbArgs.unshift('-s', opts.device)

    const spinner = ora('Installing APK...').start()

    try {
      await execa('adb', adbArgs, { stdout: 'inherit' })
      spinner.succeed(chalk.green('APK installed'))
    } catch (err) {
      spinner.fail(chalk.red('adb install failed'))
      console.error(err)
      process.exit(1)
    }
  })

export default command
