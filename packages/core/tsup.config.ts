import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/router.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  treeshake: true,
  target: 'es2020',
  platform: 'browser',
})
