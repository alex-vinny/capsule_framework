// Docs: docs/reference/cli.md
import { existsSync } from 'node:fs'

export interface ResolvedShell {
  aarPath: string
  version: string
  sha256: string
}

export async function resolveShell(_lockfileVersion: string): Promise<ResolvedShell> {
  // Phase 1: local override only
  const override = process.env.CAPSULE_SHELL_OVERRIDE_PATH
  if (override) {
    if (!existsSync(override)) {
      throw new Error(`CAPSULE_SHELL_OVERRIDE_PATH does not exist: ${override}`)
    }
    console.warn('[capsule] Using local shell override:', override)
    return { aarPath: override, version: 'local', sha256: 'override' }
  }

  // Phase 2: resolve from GitHub Releases API
  // const release = await fetchRelease(lockfileVersion)
  // return downloadAndVerify(release)
  throw new Error(
    'No shell found. Set CAPSULE_SHELL_OVERRIDE_PATH to your local AAR, ' +
      'or run capsule sync after Phase 2 shell registry is available.'
  )
}
