import { Directory, File, Paths } from 'expo-file-system'

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
 */

const CACHE_DIRECTORY = 'attachments'

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
    const directory = new Directory(Paths.cache, CACHE_DIRECTORY, cacheKey(url))
    if (!directory.exists) directory.create({ intermediates: true })

    const name = cachedFileName(url, fileName)
    const target = new File(directory, name)
    // A hit rather than a download: the directory is named for a stored object
    // whose bytes cannot change, so a file already at this name is the file
    // being asked for — and only a finished download is ever at this name.
    if (target.exists) return { ok: true, uri: target.uri }

    // `idempotent` so a partial file left by an earlier failure is overwritten
    // rather than refused; the whole point of this name is that it may hold one.
    const partial = new File(directory, `${name}${PARTIAL_SUFFIX}`)
    const downloaded = await File.downloadFileAsync(url, partial, { idempotent: true })
    await downloaded.move(target)

    return { ok: true, uri: target.uri }
  } catch {
    return { ok: false, reason: 'unreachable' }
  }
}
