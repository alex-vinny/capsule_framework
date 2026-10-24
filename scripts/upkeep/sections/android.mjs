// Android: the SDK platform + NDK, the Gradle/AGP/Kotlin toolchain, and every library in the
// version catalog.

import {
  HOLDS,
  AGP_COMPAT_SOURCE,
  API_MIN_AGP,
  KOTLIN_R8_SOURCE,
  maxKotlinFor,
  minAgpForApi,
  minGradleFor,
} from '../knowledge.mjs'
import { STATUS, row, unavailable, versionRow } from '../lib/report.mjs'
import { compareVersions, isPrerelease, pickLatest, versionFlavour } from '../lib/versions.mjs'
import {
  parseAndroidRepository,
  parseGradleCurrent,
  parseMavenMetadata,
} from '../parsers/sources.mjs'
import { PATHS } from '../repo.mjs'

export const ANDROID_REPOSITORY = 'https://dl.google.com/android/repository/repository2-3.xml'
export const GRADLE_CURRENT = 'https://services.gradle.org/versions/current'
const GOOGLE_MAVEN = 'https://dl.google.com/dl/android/maven2'
const MAVEN_CENTRAL = 'https://repo1.maven.org/maven2'
const PLUGIN_PORTAL = 'https://plugins.gradle.org/m2'

const metadataUrl = (base, group, name) =>
  `${base}/${group.replace(/\./g, '/')}/${name}/maven-metadata.xml`

/** Versions of `group:name`, from Google Maven, then Maven Central (then the plugin portal). */
export async function mavenVersions(
  http,
  group,
  name,
  { repositories = [GOOGLE_MAVEN, MAVEN_CENTRAL] } = {}
) {
  let lastError
  for (const base of repositories) {
    const url = metadataUrl(base, group, name)
    try {
      return { versions: parseMavenMetadata(await http.text(url)), url }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError ?? new Error(`${group}:${name} not found`)
}

/** The newest version comparable to `current`: betas only for a beta pin, same `-android`/`-jre` flavour. */
export const latestFor = (versions, current) =>
  pickLatest(versions, {
    allowPrerelease: isPrerelease(current),
    flavourOf: versionFlavour(current) ? current : undefined,
  })

/** The highest API level `agp` can compile against, per the AGP compatibility table. */
export function maxApiFor(agp) {
  return Object.entries(API_MIN_AGP)
    .filter(([, minAgp]) => compareVersions(agp, minAgp) >= 0)
    .map(([api]) => api)
    .sort(compareVersions)
    .at(-1)
}

export const platform = {
  id: 'android-platform',
  title: 'Android SDK platform & NDK',
  async run({ repo, http }) {
    const lib = repo.libraryBuild()
    let cli = {}
    try {
      cli = repo.cliSdkDefaults()
    } catch {
      // reported by the store section
    }
    let parsed
    try {
      parsed = parseAndroidRepository(await http.text(ANDROID_REPOSITORY))
    } catch (error) {
      return [unavailable('Android SDK repository', error, ANDROID_REPOSITORY, lib.compileSdk)]
    }
    const rows = []
    const majors = parsed.platforms.map((p) => p.api)
    const latestApi = Math.max(...majors)
    const latestMinor = parsed.platforms
      .filter((p) => p.api === latestApi)
      .sort((a, b) => b.minor - a.minor)[0]
    const minorNote = latestMinor?.minor
      ? `; minor SDK ${latestApi}.${latestMinor.minor} also out`
      : ''
    const agpNote = minAgpForApi(latestApi)
      ? `; compiling against ${latestApi} needs AGP ≥ ${minAgpForApi(latestApi)}`
      : ''
    for (const [name, value] of [
      ['compileSdk — library', lib.compileSdk],
      [`compileSdk — capsule init default`, cli.compileSdk],
    ]) {
      if (value === undefined) continue
      rows.push(
        row({
          name,
          current: value,
          latest: latestApi,
          status: value < latestApi ? STATUS.yellow : STATUS.green,
          note: `${value < latestApi ? `${latestApi - value} API level(s) behind` : 'current'}${minorNote}${agpNote}. Play's targetSdk floor: see the store section.`,
          source: 'https://developer.android.com/tools/releases/platforms',
        })
      )
    }

    const latestNdk = pickLatest(parsed.ndks)
    const current = lib.ndkVersion
    const sameMajor = current
      ? pickLatest(parsed.ndks.filter((v) => v.split('.')[0] === current.split('.')[0]))
      : undefined
    const ndkRow = versionRow({
      name: 'NDK (ndkVersion)',
      current,
      latest: latestNdk,
      source: 'https://developer.android.com/ndk/downloads',
      note:
        sameMajor && compareVersions(sameMajor, current) > 0
          ? `newest r${current.split('.')[0]}: ${sameMajor}; keep ci.yml NDK_VERSION in step`
          : 'keep ci.yml NDK_VERSION in step',
    })
    rows.push(ndkRow)
    return rows
  },
}

export const toolchain = {
  id: 'android-toolchain',
  title: 'Android toolchain (Gradle · AGP · Kotlin)',
  async run({ repo, http }) {
    const catalog = repo.catalog()
    const wrapper = repo.gradleWrapper()
    const agp = catalog.versions.agp
    const kotlin = catalog.versions.kotlin
    const rows = []

    let latestAgp
    try {
      const { versions } = await mavenVersions(http, 'com.android.tools.build', 'gradle', {
        repositories: [GOOGLE_MAVEN],
      })
      latestAgp = latestFor(versions, agp)
      const needs = minGradleFor(latestAgp)
      const maxApi = maxApiFor(agp)
      rows.push(
        versionRow({
          name: 'AGP (plugins android-library, android-application)',
          current: agp,
          latest: latestAgp,
          source: AGP_COMPAT_SOURCE,
          note: [
            maxApi ? `AGP ${agp} compiles up to API ${maxApi}` : '',
            needs ? `AGP ${latestAgp} needs Gradle ≥ ${needs}` : '',
          ]
            .filter(Boolean)
            .join('; '),
        })
      )
    } catch (error) {
      rows.push(unavailable('AGP', error, AGP_COMPAT_SOURCE, agp))
    }

    try {
      const latest = parseGradleCurrent(await http.json(GRADLE_CURRENT))
      const floor = minGradleFor(agp)
      const tooOld = floor && compareVersions(wrapper, floor) < 0
      const r = versionRow({
        name: 'Gradle wrapper',
        current: wrapper,
        latest,
        source: 'https://gradle.org/releases/',
        note: [
          floor ? `AGP ${agp} needs ≥ ${floor}` : '',
          "mirror in the CLI's generated-app wrapper",
        ]
          .filter(Boolean)
          .join('; '),
      })
      if (tooOld)
        Object.assign(r, { status: STATUS.red, note: `below AGP ${agp}'s minimum Gradle ${floor}` })
      rows.push(r)
    } catch (error) {
      rows.push(unavailable('Gradle wrapper', error, GRADLE_CURRENT, wrapper))
    }

    try {
      const { versions } = await mavenVersions(
        http,
        'org.jetbrains.kotlin',
        'kotlin-gradle-plugin',
        { repositories: [MAVEN_CENTRAL] }
      )
      const mlkitHeld =
        catalog.libraries.some((l) => l.alias === 'mlkit-genai-prompt') &&
        compareVersions(kotlin, '2.3') < 0
      const latest = latestFor(versions, kotlin)
      const maxKotlin = maxKotlinFor(agp)
      const beyondR8 = (v) =>
        maxKotlin && compareVersions(v.split('.').slice(0, 2).join('.'), maxKotlin) > 0
      const r = versionRow({
        name: 'Kotlin (plugins kotlin-android, kotlin-serialization)',
        current: kotlin,
        latest,
        source: 'https://kotlinlang.org/docs/releases.html',
        note: [
          mlkitHeld ? 'Kotlin ≥ 2.3 unblocks mlkit-genai-prompt beta3+' : '',
          maxKotlin && beyondR8(latest)
            ? `AGP ${agp}'s R8 reads Kotlin ≤ ${maxKotlin} — newer needs a newer AGP`
            : '',
        ]
          .filter(Boolean)
          .join('; '),
      })
      if (beyondR8(kotlin)) {
        Object.assign(r, {
          status: STATUS.red,
          note: `AGP ${agp}'s R8 reads Kotlin metadata only up to ${maxKotlin} — release builds warn and may shrink wrongly (${KOTLIN_R8_SOURCE})`,
        })
      }
      rows.push(r)
    } catch (error) {
      rows.push(unavailable('Kotlin', error, 'https://kotlinlang.org/docs/releases.html', kotlin))
    }

    // Any other plugin: its marker artifact `<id>:<id>.gradle.plugin`.
    for (const plugin of catalog.plugins.filter((p) => !['agp', 'kotlin'].includes(p.versionRef))) {
      try {
        const { versions, url } = await mavenVersions(
          http,
          plugin.id,
          `${plugin.id}.gradle.plugin`,
          {
            repositories: [GOOGLE_MAVEN, PLUGIN_PORTAL, MAVEN_CENTRAL],
          }
        )
        rows.push(
          versionRow({
            name: `plugin ${plugin.alias} (${plugin.id})`,
            current: plugin.version,
            latest: latestFor(versions, plugin.version),
            source: url,
          })
        )
      } catch (error) {
        rows.push(unavailable(`plugin ${plugin.alias}`, error, '', plugin.version))
      }
    }
    return rows
  },
}

export const libraries = {
  id: 'android-libraries',
  title: `Android libraries (${PATHS.catalog.split('/').slice(-2).join('/')})`,
  async run({ repo, http }) {
    const catalog = repo.catalog()
    return Promise.all(
      catalog.libraries.map(async (lib) => {
        const name = `${lib.group}:${lib.name}`
        if (!lib.version)
          return row({
            name,
            status: STATUS.unavailable,
            note: 'no version in the catalog (BOM-managed?)',
          })
        try {
          const { versions, url } = await mavenVersions(http, lib.group, lib.name)
          const hold = HOLDS.find((h) => h.match(lib))
          const r = versionRow({
            name,
            current: lib.version,
            latest: latestFor(versions, lib.version),
            source: url.replace(/maven-metadata\.xml$/, ''),
          })
          if (hold && r.status === STATUS.yellow) r.note = `${r.note} — ${hold.note}`
          return r
        } catch (error) {
          return unavailable(name, error, '', lib.version)
        }
      })
    )
  },
}
