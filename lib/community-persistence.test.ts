import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Where the Communities tab keeps what it holds, and this is what says so.
 *
 * Two of #72's acceptance criteria are properties of the code rather than
 * anything assertable at runtime, and both stop being true the same way: by
 * somebody later reaching for the nearest way to persist something.
 *
 * The first is the split. `community-rows` maps a Community and a feed row to
 * disk and back, and it must import nothing native — that is what makes the
 * mapping a table of cases rather than something only a device can demonstrate,
 * and it is the arrangement `store-rows` and `conversation-store` already have.
 * See ADR-0008.
 *
 * The second is the Session end. Everything these modules write goes through
 * `conversation-store`, which is the database file `session-wipe` destroys — so
 * a shared phone hands the next person nothing, and `endSessionOnDevice` needed
 * no fourth thing added to its list. A module here that wrote somewhere else
 * would quietly leave a person's rooms on the device after they signed out.
 *
 * Same shape as `wall-persistence.test.ts`, and the same reason: the thing that
 * notices should be a failing test rather than a person remembering an ADR at
 * the moment they add a file write.
 */

const REPOSITORY = join(__dirname, '..')

/** Every Community module, by the one naming convention they all follow. */
const COMMUNITY_SOURCES = ['lib', 'components/communities']

/** Ways of outliving the screen that are not the Store. Named, not pattern-matched. */
const OTHER_PERSISTENCE = [
  'expo-file-system',
  '@react-native-async-storage',
  'expo-secure-store',
]

/**
 * An import of a module, rather than a mention of one.
 *
 * These files talk about `expo-sqlite` in their comments — saying which side of
 * the boundary they are on is half of what the comments are for — and a test
 * that could not tell a sentence from an import would forbid explaining the
 * arrangement it exists to protect.
 */
function imports(source: string, module: string): boolean {
  const escaped = module.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`from ['"]${escaped}`).test(source)
}

function communitySources(): { path: string; source: string }[] {
  return COMMUNITY_SOURCES.flatMap(directory =>
    readdirSync(join(REPOSITORY, directory), { withFileTypes: true })
      .filter(entry => entry.isFile() && /\.tsx?$/.test(entry.name))
      .filter(entry => directory !== 'lib' || /^(use-)?communit/.test(entry.name))
      .filter(entry => !entry.name.endsWith('.test.ts'))
      .map(entry => ({
        path: `${directory}/${entry.name}`,
        source: readFileSync(join(REPOSITORY, directory, entry.name), 'utf8'),
      })),
  )
}

describe('the Communities tab keeps what it holds in the Store, and nowhere else', () => {
  const sources = communitySources()

  it('finds the Community modules to check, so a rename cannot empty this test', () => {
    // `community-api`, `community-list`, `community-notice`, `community-parse`,
    // `community-route`, `community-rows`, `use-communities`, and the four components.
    expect(sources.length).toBeGreaterThanOrEqual(11)
  })

  it.each(OTHER_PERSISTENCE)('reaches for no %s', module => {
    const offenders = sources.filter(file => imports(file.source, module))

    expect(
      offenders.map(file => file.path).join(', ') ||
        'nothing, so a Session end destroying the database destroys all of it',
    ).toBe('nothing, so a Session end destroying the database destroys all of it')
  })

  it('keeps the row mapping on this side of the native boundary', () => {
    const rows = sources.find(file => file.path === 'lib/community-rows.ts')

    expect(rows?.path).toBe('lib/community-rows.ts')
    expect(imports(rows?.source ?? '', 'expo-sqlite')).toBe(false)
  })

  it('leaves SQLite to the one module that already knows it exists', () => {
    const offenders = sources.filter(file => imports(file.source, 'expo-sqlite'))

    expect(offenders.map(file => file.path)).toEqual([])
  })
})
