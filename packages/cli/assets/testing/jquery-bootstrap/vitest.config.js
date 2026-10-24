import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    // QuickJS-fidelity spins up a WASM runtime + esbuild bundle on a cold cache.
    testTimeout: 20000,
  },
})
