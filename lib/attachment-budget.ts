/**
 * What the Attachment cache is allowed to hold, and what goes when it holds too
 * much.
 *
 * Pure, and deliberately on this side of the native boundary: nothing here
 * imports `expo-file-system`, so the arithmetic that decides which documents a
 * phone keeps is a table of cases rather than something only a device can
 * demonstrate. What is on the other side — listing the directory, reading a
 * size, deleting a tree — is `lib/attachment-cache.ts`, the same split
 * `store-rows` and `conversation-store` make for SQLite.
 *
 * Discarding is always safe. Everything the cache holds is re-fetchable, so a
 * file that is gone costs a download — exactly what the cache already promises
 * when the system reclaims its directory out from under it.
 */

/**
 * A quarter of a gigabyte, which a support phone reaches in months rather than
 * days: the API refuses an upload over fifteen megabytes, so the budget is a
 * few hundred of the largest document anybody can send and many thousands of an
 * ordinary one.
 */
export const ATTACHMENT_CACHE_BUDGET_BYTES = 250 * 1024 * 1024

/** One cached attachment, as the accounting sees it. */
export type CachedAttachment = {
  /** The directory the copy lives in — see `cacheKey`, which names it. */
  key: string
  /** Every byte that directory holds, the part file and the marker included. */
  bytes: number
  /**
   * When it was last *read*, in epoch milliseconds — not when it was
   * downloaded. A file opened every week outlives an older sibling nobody has
   * touched since, which is the whole reason this is not the modification time
   * the filesystem already keeps.
   */
  usedAt: number
  /**
   * True while something is happening to it now: a download still arriving, or
   * a file an Upload is still streaming from. Counted against the budget, never
   * discarded to meet it.
   */
  pinned: boolean
}

/** Every byte the cache holds, pinned entries included — they occupy disk too. */
export function cacheSize(entries: readonly CachedAttachment[]): number {
  return entries.reduce((total, one) => total + one.bytes, 0)
}

/**
 * Which entries go, in the order they go, so the cache fits inside `budget`.
 *
 * Least recently used first, and no further than it has to: the moment what is
 * left fits, the rest stay. An empty answer means the cache is already inside
 * its budget, which `budget` is a ceiling for rather than a line to stay under.
 *
 * When only pinned entries are left the answer is short rather than complete —
 * the cache stays over budget until those finish, which is the right way round.
 * A budget is not worth interrupting a download for, and the next one to land
 * will evict again anyway.
 */
export function keysToEvict(entries: readonly CachedAttachment[], budget: number): string[] {
  let total = cacheSize(entries)
  if (total <= budget) return []

  // Copied before sorting: the caller's list is the directory listing, and
  // reordering it under them would be a surprise for a function that answers
  // rather than acts. The key breaks a tie so one cache always evicts one way.
  const evictable = entries
    .filter((one) => !one.pinned)
    .slice()
    .sort((a, b) => a.usedAt - b.usedAt || a.key.localeCompare(b.key))

  const going: string[] = []
  for (const one of evictable) {
    if (total <= budget) break
    going.push(one.key)
    total -= one.bytes
  }
  return going
}
