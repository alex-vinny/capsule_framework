import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // QuickJS-fidelity spins up a WASM runtime + esbuild bundle on a cold cache.
    testTimeout: 20000,
  },
})
