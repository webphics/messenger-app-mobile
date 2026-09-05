/**
 * Keeps the Store out of a device backup, on both platforms.
 *
 * A config plugin rather than an edit to `android/`, because `android/` is
 * generated and gitignored — a hand-written `res/xml` file and a hand-edited
 * manifest attribute are both lost on the next `expo prebuild --clean`, and per
 * machine besides. What the two platforms are told, and why, is next door in
 * `backup-exclusion.js`, which is where the tests are.
 *
 * Why the rules rather than the `allowBackup: false` this replaces, and what
 * that changes about the rest of the app, is ADR-0011 and not repeated here.
 * The one thing worth saying at the call site: an `<application>` reads one
 * `fullBackupContent` and one `dataExtractionRules`, so there is no adding to
 * somebody else's — if a third plugin ever wants rules of its own, this throws
 * rather than quietly dropping whichever of them lost.
 *
 * ## Ordering
 *
 * This must sit BEFORE `expo-secure-store` in `app.json`'s plugin list, which
 * reads backwards and is not a typo: a mod wraps the mods registered before it,
 * so the last plugin listed runs its manifest mod first. Listed after
 * `expo-secure-store`, ours would write the attributes first and its plugin
 * would then find values it does not recognise and print a warning about backup
 * rules on every prebuild. Listed before, it writes its own and ours replaces
 * them, which is what `backupAttributes` expects to find.
 */

const fs = require("fs")
const path = require("path")
const { AndroidConfig, withAndroidManifest, withAppDelegate, withDangerousMod } = require("expo/config-plugins")

const {
  BACKUP_RULES_FILE,
  DATA_EXTRACTION_RULES_FILE,
  backupAttributes,
  dataExtractionRulesXml,
  excludeStoreInAppDelegate,
  fullBackupContentXml,
} = require("./backup-exclusion")

/**
 * The rules themselves. `res/xml` does not exist in a freshly prebuilt project —
 * the ones the manifest already referenced came from `expo-secure-store`'s
 * Android library resources rather than from the app — so it is created.
 */
function withBackupRuleFiles(config) {
  return withDangerousMod(config, [
    "android",
    async (mod) => {
      const xmlDir = path.join(
        mod.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "xml",
      )
      fs.mkdirSync(xmlDir, { recursive: true })
      fs.writeFileSync(path.join(xmlDir, BACKUP_RULES_FILE), fullBackupContentXml(), "utf-8")
      fs.writeFileSync(
        path.join(xmlDir, DATA_EXTRACTION_RULES_FILE),
        dataExtractionRulesXml(),
        "utf-8",
      )
      return mod
    },
  ])
}

function withBackupRulesInManifest(config) {
  return withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults)
    Object.assign(application.$, backupAttributes(application.$))
    return mod
  })
}

function withStoreExcludedFromIosBackup(config) {
  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== "swift") {
      throw new Error(
        `with-store-excluded-from-backup: expected a Swift AppDelegate, got ${mod.modResults.language}`,
      )
    }
    mod.modResults.contents = excludeStoreInAppDelegate(mod.modResults.contents)
    return mod
  })
}

module.exports = function withStoreExcludedFromBackup(config) {
  config = withBackupRuleFiles(config)
  config = withBackupRulesInManifest(config)
  return withStoreExcludedFromIosBackup(config)
}
