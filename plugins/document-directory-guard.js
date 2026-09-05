/**
 * A tripwire on the first private file written to the document directory.
 *
 * #51 made this app's backup rules a deny-list — see `EXCLUSIONS` in
 * `backup-exclusion.js` next door for why, and ADR-0011 for what it bought. The
 * cost of it is a flipped default: nothing writes to the document directory
 * today, and the day something does it is backed up unless whoever added it
 * remembered an ADR, which is not a thing anybody reads at the moment they add
 * a file write. So the reminder is a failing test instead, and its message is
 * the whole of it — it has to name the decision and where the decision is
 * written down, or it is just an obstacle.
 *
 * Pure, and beside the plugin rather than under `lib/` for a plain reason: a
 * module that names the patterns it looks for would be the first thing to trip
 * itself, and the exception that fixed that would be the hole. `plugins/` is
 * not scanned — the iOS half of `backup-exclusion` names `.documentDirectory`
 * in Swift, and must.
 */

/**
 * Every way of naming the directory that a reader would recognise as one:
 * `Paths.document` in the current `expo-file-system` API, however it is
 * spelled, and `documentDirectory` in the legacy one. Matched against the whole
 * source rather than line by line, so a property access a formatter split
 * across two lines still counts.
 *
 * What they cannot see is a name computed at runtime — `Paths[key]`. That is
 * the limit of a tripwire and not a reason for a heavier one: this exists to
 * stop an ordinary file write going unnoticed, not to stop somebody determined.
 */
const DOCUMENT_DIRECTORY_PATTERNS = [
  /\bPaths\s*\.\s*document\b/g,
  /\bPaths\s*\[\s*(['"])document\1\s*\]/g,
  /\{[^}]*\bdocument\b[^}]*\}\s*=\s*Paths\b/g,
  /\bdocumentDirectory\b/g,
]

/** Everything of ours that runs on the device. */
const GUARDED_DIRECTORIES = ["lib", "app", "components"]

/**
 * Deliberately not `Paths.cache`: neither platform backs the cache up — Android
 * never takes `cache/`, iOS never takes `Library/Caches` — so the downloaded
 * documents and the picker's staged copies were never in a backup and need no
 * rule. A guard that fired on them would be telling the truth about nothing.
 * That is also why the destructuring pattern names the property rather than the
 * object: `const { cache } = Paths` is somebody entitled to it.
 *
 * A line is reported once however many patterns it answers, and comments count
 * — the directory is the thing being guarded, and every way of naming it is a
 * place somebody could start.
 *
 * @param {{ path: string, source: string }[]} files
 * @returns {{ path: string, line: number, text: string }[]}
 */
function documentDirectoryReferences(files) {
  return files.flatMap(({ path, source }) => {
    const lines = source.split("\n")
    const found = new Set()

    for (const pattern of DOCUMENT_DIRECTORY_PATTERNS) {
      for (const match of source.matchAll(pattern)) {
        found.add(source.slice(0, match.index).split("\n").length)
      }
    }

    return [...found]
      .sort((a, b) => a - b)
      .map((line) => ({ path, line, text: lines[line - 1].trim() }))
  })
}

/**
 * What somebody who has just tripped this needs, in the order they need it:
 * where they are, why naming that directory is a backup question at all, and
 * the two ways out — the cache, which is almost always the answer, or the
 * deny-list, which is the deliberate one.
 *
 * @param {ReturnType<typeof documentDirectoryReferences>} references
 */
function documentDirectoryFailure(references) {
  const places = references.map(({ path, line, text }) => `  ${path}:${line}  ${text}`).join("\n")

  return [
    `The document directory is named in ${references.length} place${
      references.length === 1 ? "" : "s"
    }:`,
    "",
    places,
    "",
    "This app's backup rules are excludes and nothing else, so everything they do not name is",
    "backed up: Android copies the app's files directory to the person's cloud account, and iOS",
    "takes `Documents/` the same way. A file written there leaves the phone unless `EXCLUSIONS` in",
    "`plugins/backup-exclusion.js` names it — and the iOS flag beside it marks the directory too.",
    "See ADR-0011.",
    "",
    "So either write it under `Paths.cache`, which neither platform backs up and where the",
    "downloaded documents and the picker's staged copies already live, or add it to `EXCLUSIONS`",
    "and widen this guard on purpose.",
  ].join("\n")
}

module.exports = {
  GUARDED_DIRECTORIES,
  documentDirectoryFailure,
  documentDirectoryReferences,
}
