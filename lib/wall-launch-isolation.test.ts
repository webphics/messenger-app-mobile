import { existsSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'

/**
 * A launch knows nothing about the Wall.
 *
 * #74 added a fourth destination, and the risk a destination brings is that it
 * gets read before somebody asks for it: a provider hoisted into the root
 * layout, a prefetch on the inbox, a tab preloaded so the first tap feels
 * quicker. Every one of those is invisible on a desk and costs exactly the
 * people on a bad network the seconds the Launch deadline exists to bound — the
 * gate would then be waiting on the Launch screen, the first Conversation
 * fetch, and a Wall nobody has opened.
 *
 * The gate itself is a table and is tested as one (`lib/launch-route`); what
 * cannot be read off that table is what the launch *does* on the way. So this
 * is the other half, in the spirit of the tripwires beside the backup plugin and
 * `wall-persistence`: walk out from the launch entry points through this repo's
 * own modules, and fail if the walk reaches the Wall at all.
 *
 * A route file is deliberately not an entry point. `app/_layout` renders a
 * `Stack` and each role's layout a `Tabs`, and neither imports the screens
 * underneath it — expo-router resolves those from the file system, and a tab
 * mounts the first time it is focused. That is what makes the Wall's read
 * happen when it is opened rather than when the app is, and it is why the walk
 * stops at the navigator rather than running on into every screen in the app.
 */

const REPOSITORY = join(__dirname, '..')

/**
 * Everything a cold start evaluates before there is a Hub to hand over: the
 * root layout and the providers it mounts, the launch screen, the gate it
 * reads, and the inbox that arms the Launch deadline.
 */
const LAUNCH_ENTRY_POINTS = [
  'app/_layout.tsx',
  'app/index.tsx',
  'lib/launch-route.ts',
  'lib/conversation-inbox.tsx',
]

/** How a Wall module is named, in either of the two places they live. */
const WALL = /^(lib\/(use-)?wall[-.]|lib\/use-composable-wall-|components\/wall\/)/

const EXTENSIONS = ['.ts', '.tsx']

/**
 * Every module a file pulls in, however the import was spelled.
 *
 * The side-effect form is the one worth naming: `import '@/lib/wall-api'` has no
 * `from` and is exactly how a prefetch gets added without anybody reading a
 * symbol out of it, so a pattern that only knew about `from` would pass while
 * the launch loaded the Wall.
 */
function importsOf(source: string): string[] {
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  return patterns.flatMap(pattern => [...source.matchAll(pattern)].map(match => match[1]))
}

/**
 * The specifier as a path in this repository, or null for anything that is not
 * one of its own modules — a package, a stylesheet, an asset.
 */
function resolve(specifier: string, from: string): string | null {
  const relative = specifier.startsWith('@/')
    ? specifier.slice(2)
    : specifier.startsWith('.')
      ? posix.normalize(posix.join(posix.dirname(from), specifier))
      : null
  if (relative === null) return null

  for (const candidate of [
    relative,
    ...EXTENSIONS.map(extension => `${relative}${extension}`),
    ...EXTENSIONS.map(extension => `${relative}/index${extension}`),
  ]) {
    if (EXTENSIONS.some(extension => candidate.endsWith(extension))) {
      if (existsSync(join(REPOSITORY, candidate))) return candidate
    }
  }
  return null
}

/** Every module a launch reaches, entry points included. */
function reachedByLaunch(): Set<string> {
  const reached = new Set<string>()
  const pending = [...LAUNCH_ENTRY_POINTS]

  while (pending.length > 0) {
    const path = pending.pop()!
    if (reached.has(path)) continue
    reached.add(path)

    // Missing rather than unreadable: an entry point that was renamed is the
    // one failure this walk must not turn into an ENOENT thrown out of a
    // `describe` body, which takes the whole file down with a stack instead of
    // the assertion below that names the file.
    if (!existsSync(join(REPOSITORY, path))) continue

    const source = readFileSync(join(REPOSITORY, path), 'utf8')
    for (const specifier of importsOf(source)) {
      const next = resolve(specifier, path)
      if (next !== null && !reached.has(next)) pending.push(next)
    }
  }

  return reached
}

describe('a launch does not reach the Wall', () => {
  const reached = reachedByLaunch()

  it.each(LAUNCH_ENTRY_POINTS)('starts from %s, so a rename cannot empty this test', path => {
    expect(existsSync(join(REPOSITORY, path))).toBe(true)
  })

  it('follows the imports rather than only reading the four files', () => {
    // The gate's own neighbours, each reached through a different entry point.
    expect(reached).toContain('lib/auth-context.tsx')
    expect(reached).toContain('lib/push-intent.tsx')
    expect(reached).toContain('lib/launch-deadline.ts')
    expect(reached.size).toBeGreaterThan(LAUNCH_ENTRY_POINTS.length * 3)
  })

  it('reaches no Wall module', () => {
    const wall = [...reached].filter(path => WALL.test(path)).sort()

    expect(
      wall.join(', ') || 'nothing, which is what a launch may know about the Wall',
    ).toBe('nothing, which is what a launch may know about the Wall')
  })

  it('would say so if one were pulled in, so the walk is not vacuous', () => {
    // The same walk from the screen the tab mounts: proof that a Wall module is
    // reachable by this resolver when something actually imports one.
    const fromTheTab = readFileSync(join(REPOSITORY, 'app/(customer)/wall.tsx'), 'utf8')
    const imported = importsOf(fromTheTab)
      .map(specifier => resolve(specifier, 'app/(customer)/wall.tsx'))
      .filter((path): path is string => path !== null)

    expect(imported.filter(path => WALL.test(path))).not.toHaveLength(0)
  })
})

/**
 * The other way a tab gets read before somebody opens it, and the one an import
 * walk cannot see.
 *
 * A tab is mounted the first time it is focused — `lazy` defaults to true — so
 * the Wall's read happens on the tap. Two things undo that, and neither is an
 * import: turning the default off, and asking the navigator to preload the
 * screen so the first tap feels quicker. Both are defensible on a desk and both
 * put a Wall read inside a cold start.
 */
describe('a role’s tabs mount when they are opened', () => {
  const LAYOUTS = [
    'app/(customer)/_layout.tsx',
    'app/(agent)/_layout.tsx',
    'app/(admin)/_layout.tsx',
  ]

  it.each(LAYOUTS)('%s has a Wall tab to be wrong about', path => {
    expect(readFileSync(join(REPOSITORY, path), 'utf8')).toContain('name="wall"')
  })

  /**
   * The layouts, and the options they spread in.
   *
   * `lazy: false` in `tabChrome` would turn the default off for all three
   * without any of the three saying so, which is exactly the edit this is here
   * to catch.
   */
  const LAZY_OWNERS = [...LAYOUTS, 'lib/use-tab-chrome.ts', 'lib/tokens.ts']

  it.each(LAZY_OWNERS)('%s leaves the lazy default alone', path => {
    expect(readFileSync(join(REPOSITORY, path), 'utf8')).not.toMatch(/lazy\s*[:=]\s*{?\s*false/)
  })

  it.each(LAYOUTS)('%s preloads nothing', path => {
    expect(readFileSync(join(REPOSITORY, path), 'utf8')).not.toContain('preload')
  })
})
