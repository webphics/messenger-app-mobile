import { File } from 'expo-file-system'

import { isDeviceUri } from '@/lib/attachment-upload'
import type { MessageAttachment } from '@/lib/types'

/**
 * Whether the files a message is still carrying are where it left them.
 *
 * A staged Attachment is a device URI — what the picker or the recorder handed
 * over, before anything was uploaded. It survives a restart on paper: the
 * Outbox writes the message whole, URI and all, and the row comes back
 * complete. What does not necessarily survive is the *file*. Both pickers copy
 * what they were given into the app's cache directory, and the cache is the one
 * place the system reclaims when a phone runs out of room — so a message typed
 * on a train with a photo on it can come back on Thursday pointing at nothing.
 *
 * That is the case this exists for, and it is why the Outbox restores a message
 * rather than refusing to. Refusing would lose messages whose files are fine,
 * which is nearly all of them; restoring and then retrying blind would send a
 * request that fails on the file read, and the person would be told their
 * message did not go without ever being told why. So the retry asks first, and
 * a message whose file has gone says so.
 *
 * ## What is checkable, and what is assumed
 *
 * Only `file:` URIs are read. Everything else a picker can produce — `content:`
 * on Android, `ph:` and `assets-library:` on iOS — names a provider rather than
 * a path, and `File.exists` cannot answer for one. Those are assumed present:
 * the upload is the thing that finds out, and inventing a verdict about a URI
 * this cannot read would refuse messages whose files are there.
 *
 * Nothing here throws. A filesystem that will not answer for a path reads as
 * present, for the same reason — the upload is the authority, and this only
 * gets ahead of it where it is sure.
 */

/** The device URIs a message is carrying that no longer point at a file. */
export function missingStagedFiles(
  attachments: readonly MessageAttachment[],
): MessageAttachment[] {
  return attachments.filter((attachment) => isMissing(attachment.url))
}

function isMissing(url: string): boolean {
  if (!isDeviceUri(url)) return false
  if (!url.trim().toLowerCase().startsWith('file:')) return false

  try {
    return !new File(url).exists
  } catch {
    // A path this platform will not answer for. The upload is the authority.
    return false
  }
}
