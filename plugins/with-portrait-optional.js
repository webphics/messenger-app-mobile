/**
 * Tells Google Play that a portrait screen is preferred, not required.
 *
 * `"orientation": "portrait"` in `app.json` becomes
 * `android:screenOrientation="portrait"` on the main activity. Play reads that
 * attribute and infers a required `android.hardware.screen.portrait` feature,
 * then hides the listing from every device that does not report one: some
 * tablets, Chromebooks, desktop and Android XR. Play Console reports it as
 * "Required hardware feature declarations are restricting your app's
 * availability".
 *
 * An explicit `<uses-feature>` with `required="false"` overrides the inferred
 * one. The activity stays locked to portrait on a phone, and the other devices
 * may install it.
 *
 * A config plugin because `android/` is generated and gitignored, so a
 * hand-edited manifest is lost on the next `expo prebuild --clean`.
 */

const { withAndroidManifest } = require("expo/config-plugins")

const PORTRAIT_FEATURE = "android.hardware.screen.portrait"

module.exports = function withPortraitOptional(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest
    const others = (manifest["uses-feature"] ?? []).filter(
      (feature) => feature.$?.["android:name"] !== PORTRAIT_FEATURE,
    )
    manifest["uses-feature"] = [
      ...others,
      { $: { "android:name": PORTRAIT_FEATURE, "android:required": "false" } },
    ]
    return mod
  })
}
