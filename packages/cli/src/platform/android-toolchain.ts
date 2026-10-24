// Generated from packages/capsule-android (gradle/libs.versions.toml, gradle-wrapper.properties,
// capsule/build.gradle.kts) by `node scripts/gen/index.mjs --only android-toolchain` — do not edit.
// Bump versions in the library's build; `capsule sync` and `capsule init` read them from here.

export interface CatalogLibrary {
  group: string
  name: string
  version: string
  /** The [versions] key the library catalog references, when it uses `version.ref`. */
  versionRef?: string
}

export interface CatalogPlugin {
  id: string
  version: string
  versionRef?: string
}

export interface AndroidToolchain {
  gradle: string
  compileSdk: number
  /** The library's own targetSdk, when its build declares one; null means "use compileSdk". */
  targetSdk: number | null
  minSdk: number
  ndk: string
  versions: Record<string, string>
  libraries: Record<string, CatalogLibrary>
  plugins: Record<string, CatalogPlugin>
}

export const ANDROID_TOOLCHAIN: AndroidToolchain = {
  gradle: '8.14.6',
  compileSdk: 36,
  targetSdk: null,
  minSdk: 26,
  ndk: '27.3.13750724',
  versions: {
    agp: '8.13.2',
    kotlin: '2.3.21',
    'core-ktx': '1.18.0',
    appcompat: '1.8.0',
    lifecycle: '2.11.0',
    coroutines: '1.11.0',
    serialization: '1.12.0',
    'play-services-location': '21.4.0',
    junit: '4.13.2',
    exifinterface: '1.4.2',
    'androidx-test-runner': '1.7.0',
    'androidx-test-ext-junit': '1.3.0',
    espresso: '3.7.0',
    okhttp: '4.12.0',
    guava: '33.7.2-android',
    'mlkit-genai-prompt': '1.0.0-beta4',
  },
  libraries: {
    'androidx-core-ktx': {
      group: 'androidx.core',
      name: 'core-ktx',
      version: '1.18.0',
      versionRef: 'core-ktx',
    },
    'androidx-appcompat': {
      group: 'androidx.appcompat',
      name: 'appcompat',
      version: '1.8.0',
      versionRef: 'appcompat',
    },
    'androidx-lifecycle-process': {
      group: 'androidx.lifecycle',
      name: 'lifecycle-process',
      version: '2.11.0',
      versionRef: 'lifecycle',
    },
    'kotlinx-coroutines-android': {
      group: 'org.jetbrains.kotlinx',
      name: 'kotlinx-coroutines-android',
      version: '1.11.0',
      versionRef: 'coroutines',
    },
    'kotlinx-serialization-json': {
      group: 'org.jetbrains.kotlinx',
      name: 'kotlinx-serialization-json',
      version: '1.12.0',
      versionRef: 'serialization',
    },
    'play-services-location': {
      group: 'com.google.android.gms',
      name: 'play-services-location',
      version: '21.4.0',
      versionRef: 'play-services-location',
    },
    junit: {
      group: 'junit',
      name: 'junit',
      version: '4.13.2',
      versionRef: 'junit',
    },
    'kotlinx-coroutines-test': {
      group: 'org.jetbrains.kotlinx',
      name: 'kotlinx-coroutines-test',
      version: '1.11.0',
      versionRef: 'coroutines',
    },
    'androidx-exifinterface': {
      group: 'androidx.exifinterface',
      name: 'exifinterface',
      version: '1.4.2',
      versionRef: 'exifinterface',
    },
    'androidx-test-runner': {
      group: 'androidx.test',
      name: 'runner',
      version: '1.7.0',
      versionRef: 'androidx-test-runner',
    },
    'androidx-test-ext-junit': {
      group: 'androidx.test.ext',
      name: 'junit',
      version: '1.3.0',
      versionRef: 'androidx-test-ext-junit',
    },
    'espresso-web': {
      group: 'androidx.test.espresso',
      name: 'espresso-web',
      version: '3.7.0',
      versionRef: 'espresso',
    },
    okhttp: {
      group: 'com.squareup.okhttp3',
      name: 'okhttp',
      version: '4.12.0',
      versionRef: 'okhttp',
    },
    guava: {
      group: 'com.google.guava',
      name: 'guava',
      version: '33.7.2-android',
      versionRef: 'guava',
    },
    'mlkit-genai-prompt': {
      group: 'com.google.mlkit',
      name: 'genai-prompt',
      version: '1.0.0-beta4',
      versionRef: 'mlkit-genai-prompt',
    },
  },
  plugins: {
    'android-library': {
      id: 'com.android.library',
      version: '8.13.2',
      versionRef: 'agp',
    },
    'android-application': {
      id: 'com.android.application',
      version: '8.13.2',
      versionRef: 'agp',
    },
    'kotlin-android': {
      id: 'org.jetbrains.kotlin.android',
      version: '2.3.21',
      versionRef: 'kotlin',
    },
    'kotlin-serialization': {
      id: 'org.jetbrains.kotlin.plugin.serialization',
      version: '2.3.21',
      versionRef: 'kotlin',
    },
  },
}
