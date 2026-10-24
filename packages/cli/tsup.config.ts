import { defineConfig } from 'tsup'

export default defineConfig({
  // program.ts + config.ts are entries so scripts/gen/ can import the command tree and CONFIG_FIELDS;
  // platform/requirements.ts so scripts/upkeep/ can evaluate the store rules (dist/platform/).
  entry: [
    'src/index.ts',
    'src/tailwind.ts',
    'src/testing.ts',
    'src/program.ts',
    'src/config.ts',
    'src/platform/requirements.ts',
  ],
  format: ['esm'],
  dts: false,
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
  target: 'node22',
  platform: 'node',
  external: ['fs-extra', 'ora'],
})
