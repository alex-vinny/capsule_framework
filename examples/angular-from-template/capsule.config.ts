export default {
  appId: 'dev.capsule.examples.angulartemplate',
  appName: 'Capsule Angular Template',
  devPort: 5177,

  version: {
    name: '0.1.0',
    buildNumber: 1,
  },

  android: {
    minSdk: 26,
    targetSdk: 36,
    compileSdk: 36,
  },

  web: {
    buildCommand: 'pnpm exec ng build',
    devCommand: 'pnpm exec ng serve --port=5177 --host=0.0.0.0',
  },
}
