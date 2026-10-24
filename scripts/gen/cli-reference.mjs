// Renders docs/reference/generated/cli.md from the CLI's commander definitions.
// Imports the BUILT CLI (packages/cli/dist/program.js) — run `pnpm build` first (`pnpm gen` does).

import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cell, notice, root, table } from './lib.mjs'

const programModule = join(root, 'packages', 'cli', 'dist', 'program.js')

const code = (value) => `\`${String(value).replace(/`/g, '\\`')}\``
const formatDefault = (value) =>
  value === undefined ? '—' : code(typeof value === 'string' ? value : JSON.stringify(value))

function argumentRows(cmd) {
  // registeredArguments is public since commander 11; Help.visibleArguments() hides arguments
  // that have no description, which is most of them.
  return (cmd.registeredArguments ?? []).map((arg) => {
    const name = `${arg.variadic ? `${arg.name()}...` : arg.name()}`
    const choices = arg.argChoices ? ` One of: ${arg.argChoices.map(code).join(', ')}.` : ''
    return [
      code(arg.required ? `<${name}>` : `[${name}]`),
      arg.required ? 'yes' : 'no',
      cell(`${arg.description ?? ''}${choices}`.trim()),
      formatDefault(arg.defaultValue),
    ]
  })
}

function optionRows(cmd) {
  return cmd
    .createHelp()
    .visibleOptions(cmd)
    .filter((option) => option.long !== '--help')
    .map((option) => {
      const choices = option.argChoices ? ` One of: ${option.argChoices.map(code).join(', ')}.` : ''
      const env = option.envVar ? ` Env: ${code(option.envVar)}.` : ''
      return [
        code(option.flags),
        cell(`${option.description ?? ''}${choices}${env}`.trim()),
        formatDefault(option.defaultValue),
      ]
    })
}

function renderCommand(cmd, parents, depth, out) {
  const path = [...parents, cmd.name()].join(' ')
  out.push(`${'#'.repeat(Math.min(depth, 6))} \`${path}\``, '')
  if (cmd.description()) out.push(cmd.description(), '')
  out.push('```', `${path} ${cmd.usage()}`.trim(), '```', '')

  const args = argumentRows(cmd)
  if (args.length > 0) out.push(table(['Argument', 'Required', 'Description', 'Default'], args), '')
  const options = optionRows(cmd)
  if (options.length > 0) out.push(table(['Option', 'Description', 'Default'], options), '')

  const subcommands = cmd
    .createHelp()
    .visibleCommands(cmd)
    .filter((sub) => sub.name() !== 'help')
  for (const sub of subcommands) renderCommand(sub, [...parents, cmd.name()], depth + 1, out)
}

/** Writes `<outDir>/cli.md`. */
export async function generateCliReference(outDir) {
  if (!existsSync(programModule)) {
    throw new Error(
      `${programModule} not found — build the CLI first (pnpm --filter @capsule/cli build).`
    )
  }
  const { createProgram } = await import(pathToFileURL(programModule).href)
  const program = await createProgram()

  const out = [
    '# CLI reference',
    '',
    notice('the commander definitions in `packages/cli/src/commands/`'),
    `${program.description()} Version: run \`${program.name()} --version\`.`,
    '',
  ]
  for (const cmd of program.commands) renderCommand(cmd, [program.name()], 2, out)
  writeFileSync(join(outDir, 'cli.md'), `${out.join('\n').trimEnd()}\n`)
}
