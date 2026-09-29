import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

type SourceFile = { path: string; source: string }
type Reference = { path: string; line: number; text: string }

const {
  documentDirectoryFailure,
  documentDirectoryReferences,
  GUARDED_DIRECTORIES,
  // CommonJS for the reason `backup-exclusion` is: this sits beside a config
  // plugin, which the Expo CLI evaluates outside Metro.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require('@/plugins/document-directory-guard') as {
  documentDirectoryFailure: (references: Reference[]) => string
  documentDirectoryReferences: (files: SourceFile[]) => Reference[]
  GUARDED_DIRECTORIES: string[]
}

const REPOSITORY = join(__dirname, '..')

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']

/**
 * The impure half, and the only one: there is no runtime consumer to put it in.
 * Paths are posix so a failure reads the same on either operating system.
 */
function sourcesUnder(directory: string): SourceFile[] {
  const walk = (relative: string): SourceFile[] =>
    readdirSync(join(REPOSITORY, relative), { withFileTypes: true }).flatMap((entry) => {
      const path = `${relative}/${entry.name}`
      if (entry.isDirectory()) return walk(path)
      if (!SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) return []
      return [{ path, source: readFileSync(join(REPOSITORY, path), 'utf8') }]
    })

  return walk(directory)
}

describe('what counts as a reference to the document directory', () => {
  const references = (source: string) => documentDirectoryReferences([{ path: 'lib/x.ts', source }])

  const writes: [string, string][] = [
    ['the current expo-file-system API', 'const d = new Directory(Paths.document, "notes")'],
    ['the legacy one', 'const d = FileSystem.documentDirectory + "notes"'],
    ['a renamed destructure', 'const { document: documents } = Paths'],
  ]

  it.each(writes)('%s is one', (_name, source) => {
    expect(references(source)).toHaveLength(1)
  })

  // Neither platform backs the cache up, so `attachment-cache` is entitled to
  // it and this must never be the thing that stops it.
  it('a download under the cache is not one', () => {
    expect(references('return new Directory(Paths.cache, CACHE_DIRECTORY)')).toEqual([])
  })
})

describe('the failure message', () => {
  it('names the decision and where it is written down', () => {
    const message = documentDirectoryFailure(
      documentDirectoryReferences([{ path: 'lib/notes.ts', source: 'const d = Paths.document\n' }]),
    )
    expect(message).toContain('ADR-0011')
    expect(message).toContain('EXCLUSIONS')
    expect(message).toContain('plugins/backup-exclusion.js')
  })
})

describe('the tripwire', () => {
  it.each(GUARDED_DIRECTORIES)('nothing under %s/ writes to the document directory', (directory) => {
    const found = documentDirectoryReferences(sourcesUnder(directory))
    // The message is the assertion: a failure has to read as the decision it
    // broke rather than as a length that was not zero.
    expect(found.length > 0 ? documentDirectoryFailure(found) : '').toBe('')
  })

  it('points at a constant that is still there', () => {
    // The message tells whoever trips this where the deny-list is. If the
    // constant is renamed, the message sends them somewhere that does not exist.
    const plugin = readFileSync(join(REPOSITORY, 'plugins/backup-exclusion.js'), 'utf8')
    expect(plugin).toContain('const EXCLUSIONS')
  })

  it('is recorded in the ADR it names', () => {
    const adr = readFileSync(
      join(REPOSITORY, 'docs/adr/ADR-0011-the-store-does-not-leave-the-phone-in-a-backup.md'),
      'utf8',
    )
    expect(adr).toContain('document-directory-guard')
  })
})
