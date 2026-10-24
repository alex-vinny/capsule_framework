import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { svelteTesting } from '@testing-library/svelte/vite'

// Two projects on purpose: svelteTesting() forces `resolve.conditions: ['browser']`
// so Svelte components get their client build — but that condition would also make
// quickjs-emscripten resolve its browser WASM loader (which fetches over the network
// and fails under Node). So the component test runs in a browser-conditioned jsdom
// project, and the agnostic tiers run in a plain Node project with default resolution.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [svelte(), svelteTesting()],
        test: {
          name: 'component',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/test/app.test.ts'],
          testTimeout: 20000,
        },
      },
      {
        test: {
          name: 'node',
          environment: 'node',
          globals: true,
          include: [
            'src/test/route-contract.test.ts',
            'src/test/routes.test.ts',
            'src/test/quickjs.test.ts',
            'src/test/integration.test.ts',
          ],
          testTimeout: 20000,
        },
      },
    ],
  },
})
