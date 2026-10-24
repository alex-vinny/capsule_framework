import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // The QuickJS-fidelity test spins up a WASM runtime + an esbuild bundle,
    // which can take a moment on a cold cache.
    testTimeout: 20000,
  },
})
