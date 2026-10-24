export default {
  appId: 'dev.capsule.examples.rspacklit',
  appName: 'Capsule Rspack',
  devPort: 5186,

  version: { name: '1.0.0', buildNumber: 1 },

  android: { minSdk: 26, targetSdk: 36, compileSdk: 36 },

  web: {
    buildCommand: 'pnpm exec rspack build',
    devCommand: 'pnpm exec rspack serve',
  },
}
