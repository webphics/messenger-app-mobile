import { File, Paths } from 'expo-file-system'

import { DEFAULT_WALL_SORT, parseWallSort } from '@/lib/wall-sort'
import type { WallSort } from '@/lib/types'

/**
 * Which order a reader chose the Wall opened in last, kept the same way
 * `PUSH_PERMISSION_ASKED_FILE` is (`lib/push-device.ts`): a small record
 * under `Paths.cache`, read synchronously.
 *
 * Under `Paths.cache` rather than a Store column, and deliberately outside
 * `lib/wall-persistence.test.ts`'s sweep — see that file's own note on why
 * this one module is named apart from the Wall's naming convention. It is a
 * reading preference for this installation, not a Post and not anything a
 * Session end has ever had to destroy: `push-permission-asked` and
 * `push-registered-token` sit outside `session-wipe`'s reach for the same
 * reason, and a person signing out and back in reading the Wall in the order
 * they last left it is not a leak of anyone's Conversations. `Paths.cache` is
 * also what ADR-0011's backup exclusion already names, so nothing new is
 * owed there either.
 *
 * `#86`'s acceptance criterion is "persists across a foreground and a
 * relaunch": a foreground never unmounts the screen holding the sort in
 * memory, so only the relaunch half needs a disk write at all — but the two
 * are one file either way.
 */
const WALL_SORT_FILE = 'wall-sort'

function file(): File {
  return new File(Paths.cache, WALL_SORT_FILE)
}

/** The sort this device last chose, or the default if none was ever written. */
export function readWallSort(): WallSort {
  try {
    const record = file()
    if (!record.exists) return DEFAULT_WALL_SORT
    return parseWallSort(record.textSync().trim())
  } catch {
    return DEFAULT_WALL_SORT
  }
}

/** Remembers a choice for the next foreground and the next relaunch alike. */
export function writeWallSort(sort: WallSort): void {
  try {
    file().write(sort)
  } catch {
    // The choice stays whatever it was on disk. The cost is this one switch
    // not surviving a relaunch, not a wrong Wall or a stale one.
  }
}
