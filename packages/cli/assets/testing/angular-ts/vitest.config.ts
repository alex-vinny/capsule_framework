import { defineConfig } from 'vitest/config'

// Agnostic tiers only (route-contract, route units, QuickJS-fidelity, integration).
// A component test for the Angular standalone component needs Angular's TestBed
// wired into Vitest (e.g. @analogjs/vite-plugin-angular + initTestEnvironment) —
// tracked as a follow-up in docs/contributing/testing.md.
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    // QuickJS-fidelity spins up a WASM runtime + esbuild bundle on a cold cache.
    testTimeout: 20000,
  },
})
