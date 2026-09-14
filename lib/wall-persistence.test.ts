import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The Wall keeps nothing on this device, and this is what says so.
 *
 * #74's sixth acceptance criterion — *a Session end takes whatever the Wall
 * holds, through the existing single path* — is true today because there is
 * nothing to take: the Posts live in React state and go when the signed-in
 * screens do, and the only bytes a Post can leave behind are a document opened
 * out of one, which `attachment-cache` writes under `Paths.cache` and
 * `session-wipe` already clears.
 *
 * That is a property of the code rather than of anything asserted at runtime,
 * so the way it stops being true is a later ticket giving the Wall a table and
 * nobody remembering that `endSessionOnDevice` is the list a Session end
 * destroys. This is a failing test instead, in the spirit of ADR-0011's
 * tripwire beside the backup plugin: if the Wall ever does persist something,
 * the thing that notices is here rather than a person.
 */

const REPOSITORY = join(__dirname, '..')

/** Every Wall module, by the one naming convention they all follow. */
const WALL_SOURCES = ['lib', 'components/wall']

/**
 * What a module that persists something would have to reach for. Named rather
 * than pattern-matched, because each is a specific way of outliving the screen.
 */
const PERSISTENCE = [
  'expo-sqlite',
  '@/lib/conversation-store',
  'expo-file-system',
  '@react-native-async-storage',
  'expo-secure-store',
]

function wallSources(): { path: string; source: string }[] {
  return WALL_SOURCES.flatMap(directory =>
    readdirSync(join(REPOSITORY, directory), { withFileTypes: true })
      .filter(entry => entry.isFile() && /\.tsx?$/.test(entry.name))
      .filter(entry => directory !== 'lib' || /^(use-)?wall[-.]/.test(entry.name))
      .filter(entry => !entry.name.endsWith('.test.ts'))
      .map(entry => ({
        path: `${directory}/${entry.name}`,
        source: readFileSync(join(REPOSITORY, directory, entry.name), 'utf8'),
      })),
  )
}

describe('the Wall writes nothing that outlives the screen', () => {
  const sources = wallSources()

  it('finds the Wall modules to check, so a rename cannot empty this test', () => {
    // `wall-api`, `wall-card`, `wall-pages`, `wall-notice`, `wall-actions`,
    // `wall-parse`, `use-wall`, and the six components.
    expect(sources.length).toBeGreaterThanOrEqual(12)
  })

  it.each(PERSISTENCE)('reaches for no %s', module => {
    const offenders = sources.filter(file => file.source.includes(module))

    expect(
      offenders.map(file => file.path).join(', ') ||
        'nothing, which is what a Session end has to destroy: nothing',
    ).toBe('nothing, which is what a Session end has to destroy: nothing')
  })
})
