export default {
  appId: 'dev.capsule.examples.reactts',
  appName: 'Capsule React',

  version: {
    name: '1.0.0',
    buildNumber: 1,
  },

  android: {
    minSdk: 26,
    targetSdk: 36,
    compileSdk: 36,
  },

  // Demoed by the App Lifecycle screen. Links to capsulerts://… route into the
  // app: getLaunchUrl on cold start, onUrlOpen while running (see AppScreen).
  deepLinks: {
    schemes: ['capsulerts'],
  },

  codeSync: {
    enabled: true,
    url: 'http://localhost:3000',
    apiKey: 'dev-local',
    channel: 'production',
  }
}
