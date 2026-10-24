import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The CLI's own unit tests only. Files under assets/testing/** are template
    // test files copied into generated apps and exercised inside those projects
    // (against @capsule/core, a framework, etc.) — they must not run in the CLI's
    // own suite. Without this scope, vitest's default glob would pick them up.
    include: ['src/**/*.test.ts'],
    exclude: ['assets/**', 'node_modules/**', 'dist/**'],
  },
})
