import type { WallSort } from '@/lib/types'

/**
 * The Wall's default order, and how a value read back off this device (or
 * arriving as anything else) resolves to a real `WallSort`.
 *
 * Pure, and the whole of what deciding a sort is: no request, no storage,
 * nothing about *when* to switch — just what the two options are and what an
 * unrecognised value falls back to. `lib/wall-sort-storage` is the native half
 * that reads and writes one under `Paths.cache`; this module knows nothing
 * about that file existing.
 */

export const DEFAULT_WALL_SORT: WallSort = 'recent'

/** Both options, in the order a control offers them. */
export const WALL_SORT_OPTIONS: readonly WallSort[] = ['recent', 'popular']

/**
 * A value read back from storage, or anything else reaching for a sort —
 * never trusted at face value. Nothing this device wrote can be anything but
 * `recent` or `popular`, but the file it comes from is free text on disk, and
 * a build older or newer than this one is exactly the case an unrecognised
 * value is for: it falls back to the default rather than failing the read
 * that asked for it.
 */
export function parseWallSort(raw: string | null): WallSort {
  return raw === 'popular' ? 'popular' : DEFAULT_WALL_SORT
}
