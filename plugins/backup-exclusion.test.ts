const {
  BACKUP_RULES_RESOURCE,
  DATA_EXTRACTION_RULES_RESOURCE,
  SECURE_STORE_BACKUP_RULES_RESOURCE,
  SECURE_STORE_DATA_EXTRACTION_RULES_RESOURCE,
  backupAttributes,
  dataExtractionRulesXml,
  excludeStoreInAppDelegate,
  fullBackupContentXml,
  // The module under test is CommonJS, because a config plugin is evaluated by
  // the Expo CLI outside Metro and cannot read this repo's TypeScript.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require('@/plugins/backup-exclusion')

const APP_DELEGATE = `internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`

/** `SecureStore` and the Store's own directory. */
const EXCLUSIONS_PER_SECTION = 2

describe('the Android rules', () => {
  const documents: [string, () => string][] = [
    ['full-backup-content', fullBackupContentXml],
    ['data-extraction-rules', dataExtractionRulesXml],
  ]

  it.each(documents)('%s keeps the database out of a backup', (_name, xml) => {
    expect(xml()).toContain('<exclude domain="file" path="SQLite"/>')
  })

  it.each(documents)('%s carries expo-secure-store’s own exclusion', (_name, xml) => {
    // Pointing the manifest at our files replaces the ones expo-secure-store
    // ships, so its rule has to be restated here or the Session cookie starts
    // being backed up the moment this plugin lands.
    expect(xml()).toContain('<exclude domain="sharedpref" path="SecureStore"/>')
  })

  it.each(documents)('%s excludes rather than includes, so the rest of the app is still backed up', (_name, xml) => {
    expect(xml()).not.toContain('<include')
  })

  it.each(documents)('%s puts each exclusion on its own line', (_name, xml) => {
    // Android's XML parser is not the point; a document whose rules ran together
    // into one line would still satisfy every `toContain` above, and is exactly
    // what a mangled newline escape produces.
    const rules = xml()
      .split('\n')
      .filter((line: string) => line.includes('<exclude'))
    expect(rules).toHaveLength(EXCLUSIONS_PER_SECTION * (xml() === dataExtractionRulesXml() ? 2 : 1))
  })

  it('names both halves of an Android 12 backup', () => {
    expect(dataExtractionRulesXml()).toContain('<cloud-backup>')
    expect(dataExtractionRulesXml()).toContain('<device-transfer>')
  })
})

describe('taking over the manifest attributes', () => {
  const ours = {
    'android:fullBackupContent': BACKUP_RULES_RESOURCE,
    'android:dataExtractionRules': DATA_EXTRACTION_RULES_RESOURCE,
  }

  it('claims attributes nobody has set', () => {
    expect(backupAttributes({})).toEqual(ours)
  })

  it('replaces the rules expo-secure-store set, whose exclusion ours carries', () => {
    expect(
      backupAttributes({
        'android:fullBackupContent': SECURE_STORE_BACKUP_RULES_RESOURCE,
        'android:dataExtractionRules': SECURE_STORE_DATA_EXTRACTION_RULES_RESOURCE,
      }),
    ).toEqual(ours)
  })

  it('is idempotent against a project it has already patched', () => {
    expect(backupAttributes({ ...ours })).toEqual(ours)
  })

  it('refuses to overwrite rules somebody else owns', () => {
    expect(() =>
      backupAttributes({ 'android:fullBackupContent': '@xml/somebody_elses_rules' }),
    ).toThrow(/somebody_elses_rules/)
  })
})

describe('the iOS flag', () => {
  it('marks the directory expo-sqlite opens databases in', () => {
    const patched = excludeStoreInAppDelegate(APP_DELEGATE)
    expect(patched).toContain('isExcludedFromBackup = true')
    expect(patched).toContain('.documentDirectory')
    expect(patched).toContain('"SQLite"')
  })

  it('runs the flag before the delegate hands back', () => {
    const patched = excludeStoreInAppDelegate(APP_DELEGATE)
    expect(patched.indexOf('enkiExcludeStoreFromBackup()')).toBeLessThan(
      patched.indexOf('return super.application(application, didFinishLaunchingWithOptions'),
    )
  })

  it('imports Foundation, which nothing in the template guarantees', () => {
    expect(excludeStoreInAppDelegate(APP_DELEGATE)).toContain('import Foundation')
  })

  it('applies once, however many prebuilds run against the same project', () => {
    const once = excludeStoreInAppDelegate(APP_DELEGATE)
    expect(excludeStoreInAppDelegate(once)).toBe(once)
  })

  it('fails loudly on a template it does not recognise', () => {
    expect(() => excludeStoreInAppDelegate('class AppDelegate {}')).toThrow(
      /didFinishLaunchingWithOptions/,
    )
  })
})
