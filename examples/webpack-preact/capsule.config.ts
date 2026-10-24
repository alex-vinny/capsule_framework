export default {
  appId: 'dev.capsule.examples.webpackpreact',
  appName: 'Capsule Webpack',
  devPort: 5184,

  version: { name: '1.0.0', buildNumber: 1 },

  android: { minSdk: 26, targetSdk: 36, compileSdk: 36 },

  web: {
    buildCommand: 'pnpm exec webpack --mode=production',
    devCommand: 'pnpm exec webpack serve --mode=development',
  },
}
