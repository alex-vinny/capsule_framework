export default {
  appId: 'dev.capsule.examples.rollupsolid',
  appName: 'Capsule Rollup',
  devPort: 5185,

  version: { name: '1.0.0', buildNumber: 1 },

  android: { minSdk: 26, targetSdk: 36, compileSdk: 36 },

  web: {
    buildCommand: 'pnpm exec rollup -c',
    devCommand: 'pnpm exec rollup -c --watch',
  },
}
