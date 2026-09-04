import { Directory, File, Paths } from 'expo-file-system'

import {
  ATTACHMENT_CACHE_BUDGET_BYTES,
  keysToEvict,
  type CachedAttachment,
} from '@/lib/attachment-budget'
import { isDeviceUri } from '@/lib/attachment-upload'

/**
 * A copy of a received attachment, on this device.
 *
 * Images, video and audio need nothing from this: each of those renders from a
 * URL, and the platform's own media cache — plus the API's
 * `Cache-Control: immutable`, which it can afford because a stored object is
 * never rewritten under an existing name — means the bytes are fetched once and
 * then kept. A *document* is different. Opening one hands it to another app,
 * through `Sharing.shareAsync` or an intent, and neither takes an `https` URL:
 * both want a file this device holds. So a document is downloaded before it can
 * be opened, and once downloaded it stays.
 *
 * Under `Paths.cache`, deliberately: the system may reclaim it when storage runs
 * low, and everything here is re-fetchable. `ensureCachedFile` finds a file that
 * survived and downloads one that did not, so a reclaimed cache costs a download
 * rather than an error.
 *
 * The same property is what lets this reclaim the directory itself. Nothing here
 * ever removed a downloaded document before, so a phone used for support for a
 * few months held every document anybody had sent it. Now a download that would
 * take the cache past its budget discards the least recently used copies first —
 * see `evictAttachmentFiles`, and `lib/attachment-budget` for the arithmetic that
 * decides which. A discarded file is downloaded again the next time it is
 * opened, which is the reclaimed-cache path above rather than a second one.
 */

const CACHE_DIRECTORY = 'attachments'

/**
 * When this attachment was last read, written beside it.
 *
 * The filesystem records when a file was *modified*, which for a downloaded copy
 * is when it arrived — so ordering by that would discard the document opened
 * every week before the one downloaded yesterday and never touched since. There
 * is no API for stamping a file as read, so being read writes a file saying so.
 *
 * The leading dot keeps it out of the way of the document beside it: `safeName`
 * strips leading dots, so no attachment can ever be cached under this name
 * however the person who sent it had called theirs.
 */
const USED_MARKER = '.used'

/**
 * A directory name unique to one stored object.
 *
 * The API names its objects with a UUID and never rewrites one, so the last path
 * segment is already unique and already stable — no hash is needed to make it
 * either. Everything outside the characters a file name may hold is replaced,
 * which is what keeps a signed URL from an object store (query string and all)
 * from producing a path no platform will accept.
 */
export function cacheKey(url: string): string {
  const path = url.split(/[?#]/)[0] ?? ''
  return safeName(decodeURIComponent(path.substring(path.lastIndexOf('/') + 1))) ?? 'attachment'
}

/**
 * A string as a file name, or null when it cannot be one.
 *
 * Three things are taken out. Anything outside the characters every platform
 * accepts, which is what stops a signed URL or a name someone typed from
 * producing a path no filesystem will take — the separator included, so `../..`
 * cannot climb anywhere. Leading dots, which would make the file hidden. And
 * anything longer than a name needs to be.
 *
 * What is left has to still read as a name: a result with no letter or digit in
 * it is answered null, so the caller falls back to something a person can
 * recognise rather than writing a file called `_..`.
 */
function safeName(value: string): string | null {
  const safe = value
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/^\.+/, '')
    .slice(-120)
  return /[A-Za-z0-9]/.test(safe) ? safe : null
}

/**
 * What the cached copy is called — which is what the next app to receive it
 * shows the person.
 *
 * The attachment's own name, because that is the one somebody chose. The
 * object's name is a UUID: unique, and meaningless to read in a share sheet or a
 * Files listing. Uniqueness is the directory's job — see `cacheKey` — which is
 * what lets the file inside it be named for a human instead.
 */
export function cachedFileName(url: string, fileName?: string | null): string {
  return safeName(fileName ?? '') ?? cacheKey(url)
}

export type CachedFile =
  | { ok: true; uri: string }
  /** Named so a caller can say *why* rather than only *that*: see `message-media`. */
  | { ok: false; reason: 'unreachable' }

/**
 * The name a download is written under before it is a cached file.
 *
 * On Android the response streams straight into the destination, so a download
 * that dies halfway leaves a partial file behind. Written under this name and
 * moved into place only once the download has finished, a partial one is never
 * at the name the hit below looks for — so the alternative to a slow download is
 * another download, and never a truncated file served forever as a cache hit.
 */
const PARTIAL_SUFFIX = '.part'

/**
 * The objects this runtime is downloading right now.
 *
 * An eviction runs while other downloads are still in flight, and the directory
 * one of those is streaming into holds a partial file and a size that is still
 * climbing. Discarding it would delete the thing being fetched to make room for
 * the thing that was fetched before it, so an object in here is pinned for as
 * long as it is: counted against the budget, never chosen to meet it.
 *
 * A device URI needs no entry. Those name the file a picker produced — what an
 * outgoing Upload streams from — and they live wherever the picker put them,
 * never under `attachments`, which is the only directory an eviction reads.
 *
 * A count rather than a set, because one attachment can be opened twice at once:
 * the same document is drawn in the thread and in Shared in chat, and
 * `useOpenDocument` refuses a second tap on one bubble rather than a second
 * bubble. With a set, whichever download finished first would unpin the other
 * mid-flight, and the next eviction could delete what it was still writing.
 */
const downloading = new Map<string, number>()

/** Hold this object against eviction for as long as something is fetching it. */
function pin(key: string): void {
  downloading.set(key, (downloading.get(key) ?? 0) + 1)
}

/** Release one hold. The object is evictable again once the last one is gone. */
function unpin(key: string): void {
  const held = (downloading.get(key) ?? 0) - 1
  if (held > 0) downloading.set(key, held)
  else downloading.delete(key)
}

/**
 * This attachment as a file on disk, downloading it if it is not already one.
 *
 * A device URI is answered with itself. That is not a special case so much as
 * the whole point of the check: the attachment on an outgoing bubble is the file
 * the picker produced, and it is already local for as long as the upload is in
 * flight — downloading it from the server would be fetching back a copy of
 * something already in hand.
 *
 * Nothing throws. A download that failed reads as `unreachable`, which is the
 * one thing a caller can do anything about.
 */
export async function ensureCachedFile(
  url: string,
  fileName?: string | null,
): Promise<CachedFile> {
  if (isDeviceUri(url)) return { ok: true, uri: url }

  try {
    const key = cacheKey(url)
    const directory = new Directory(Paths.cache, CACHE_DIRECTORY, key)
    if (!directory.exists) directory.create({ intermediates: true })

    const name = cachedFileName(url, fileName)
    const target = new File(directory, name)
    // A hit rather than a download: the directory is named for a stored object
    // whose bytes cannot change, so a file already at this name is the file
    // being asked for — and only a finished download is ever at this name.
    if (target.exists) {
      markUsed(directory)
      return { ok: true, uri: target.uri }
    }

    pin(key)
    try {
      // `idempotent` so a partial file left by an earlier failure is overwritten
      // rather than refused; the whole point of this name is that it may hold one.
      const partial = new File(directory, `${name}${PARTIAL_SUFFIX}`)
      const downloaded = await File.downloadFileAsync(url, partial, { idempotent: true })
      await downloaded.move(target)

      markUsed(directory)
      // After the file has landed rather than before, because until then nobody
      // knows what it weighs. The overshoot is one document — the API refuses an
      // upload past fifteen megabytes — and it lasts until this line. Still
      // pinned while it runs, so the eviction a download pays for can never be
      // the one that discards it: what was just fetched is about to be opened.
      evictAttachmentFiles()
    } finally {
      unpin(key)
    }

    return { ok: true, uri: target.uri }
  } catch {
    return { ok: false, reason: 'unreachable' }
  }
}

/**
 * Record that this attachment was read just now.
 *
 * One small write per open, which is the price of ordering by last read at all —
 * the filesystem has no other way to be told. Failing to write it is not worth
 * an error: the cost is an eviction that orders this file by when it arrived.
 */
function markUsed(directory: Directory): void {
  try {
    new File(directory, USED_MARKER).write(String(Date.now()))
  } catch {
    // A cache that cannot be marked is one that evicts by a poorer order.
  }
}

/**
 * When this attachment was last read.
 *
 * The marker, when there is one. When there is not — a copy cached by a build
 * before this one, or a marker that would not write — the newest thing in the
 * directory, which is when the download landed. That is the wrong answer by
 * however long the file has been in use since, and it is the honest one: it is
 * what the filesystem itself knows. A directory that answers nothing at all is
 * `0`, which sends it to the front of the queue, which is where something
 * unreadable belongs.
 */
function lastUsedAt(directory: Directory, files: readonly File[]): number {
  try {
    const marker = new File(directory, USED_MARKER)
    if (marker.exists) {
      // `> 0` rather than merely finite: `Number('')` is `0`, and an
      // interrupted `markUsed` leaves a marker with nothing in it. Read as a
      // stamp, that would send the file just opened to the front of the queue.
      const stamp = Number(marker.textSync())
      if (Number.isFinite(stamp) && stamp > 0) return stamp
    }
  } catch {
    // Fall through to what the filesystem recorded.
  }
  return files.reduce((newest, one) => Math.max(newest, one.lastModified ?? 0), 0)
}

/**
 * Bring the cache back inside its budget, discarding the least recently used
 * documents until it fits.
 *
 * Reads `attachments` and nothing else, so the only copies it can ever choose
 * are ones this module downloaded: never a device URI an Upload is still
 * streaming from, and never anything else that shares the system cache.
 *
 * Called after a download and nowhere else, because a download is the only thing
 * that makes the cache bigger. A phone whose cache is already over budget — one
 * carried over from a build before this — is brought back the next time it
 * fetches anything, rather than by a sweep at launch nobody is waiting on.
 *
 * Nothing here throws. A directory that will not list, a size that will not
 * read, a delete the OS refuses — each is swallowed, and the cost is a cache
 * that stays larger than it meant to. That is the right way round: a cache that
 * cannot be evicted from must not become a document that cannot be opened.
 */
export function evictAttachmentFiles(): void {
  try {
    const root = new Directory(Paths.cache, CACHE_DIRECTORY)
    if (!root.exists) return

    const entries: CachedAttachment[] = []
    for (const child of root.list()) {
      if (!(child instanceof Directory)) continue
      try {
        const files = child.list().filter((one): one is File => one instanceof File)
        entries.push({
          key: child.name,
          bytes: files.reduce((total, one) => total + one.size, 0),
          usedAt: lastUsedAt(child, files),
          pinned: downloading.has(child.name),
        })
      } catch {
        // A directory that will not list is one this cannot account for, so it
        // is left out rather than guessed at.
      }
    }

    for (const key of keysToEvict(entries, ATTACHMENT_CACHE_BUDGET_BYTES)) {
      try {
        new Directory(root, key).delete()
      } catch {
        // One directory that will not go does not stop the next.
      }
    }
  } catch {
    // The cache stays over budget until the next download tries again.
  }
}
