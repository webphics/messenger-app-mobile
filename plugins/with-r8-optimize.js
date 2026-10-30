/**
 * Lets R8 optimise the release build, not only shrink and rename it.
 *
 * `expo-build-properties` in `app.json` turns R8 on for release builds, but the
 * React Native template still hands it `proguard-android.txt`, whose first rule
 * is `-dontoptimize`. With that file R8 removes unused code and obfuscates the
 * rest, and Play Console's App bundle explorer still grades "DEX code
 * optimisation" as Low with an empty "Optimisation percentage". The
 * `-optimize` variant is the same rules without that line, and it is the only
 * one AGP 9 accepts.
 *
 * A config plugin because `android/` is generated and gitignored, so a hand
 * edit to `app/build.gradle` is gone on the next `expo prebuild --clean`.
 *
 * Throws when the template line is missing rather than skipping, so a template
 * change shows up as a failed prebuild instead of a release that quietly lost
 * its optimiser.
 */

const { withAppBuildGradle } = require("expo/config-plugins")

const FROM = 'getDefaultProguardFile("proguard-android.txt")'
const TO = 'getDefaultProguardFile("proguard-android-optimize.txt")'

module.exports = function withR8Optimize(config) {
  return withAppBuildGradle(config, (mod) => {
    const contents = mod.modResults.contents
    if (contents.includes(TO)) return mod
    if (!contents.includes(FROM)) {
      throw new Error(
        `with-r8-optimize: expected ${FROM} in android/app/build.gradle; the React Native template has changed.`,
      )
    }
    mod.modResults.contents = contents.replace(FROM, TO)
    return mod
  })
}
