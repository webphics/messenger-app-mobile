import { wipeAttachmentFiles } from '@/lib/attachment-cache'
import { wipeStore } from '@/lib/conversation-store'

/**
 * Destroy everything this device holds of somebody's Conversations: the
 * database file, and the documents downloaded out of the threads in it.
 *
 * One place rather than two call sites, because the list is the point. A Session
 * end has to leave nothing readable behind, and the way that stops being true is
 * a later slice adding a third thing kept on disk and wiring it into only one of
 * the moments that end a session. There is one path, and the moments reach it
 * through `forgetCredential` in `lib/auth-service` — which is what makes signing
 * out, a Session expiry and a refused credential the same thing here.
 *
 * Hydration's Unreachable outcome deliberately does not come through here. It
 * keeps the Session cookie, so it keeps the Store — that is precisely the case
 * where a Restored list is the only thing worth showing.
 *
 * ## The order is the contract
 *
 * The database first and the documents second, so that a database that will not
 * go cannot take the documents down with it. That is the one guard here: a
 * failure discarding the documents is last and can skip nothing, and whether a
 * Session end may be *failed* by a wipe at all is `forgetCredential`'s question
 * rather than this file's.
 */
export async function wipeStoreAndAttachments(): Promise<void> {
  try {
    // Awaited, unlike the files: a write already past the Store's queue is on
    // its way to the file being removed, and `wipeStore` is what waits for it.
    await wipeStore()
  } catch {
    // Swallowed here and only here, so that the documents still go.
  }

  wipeAttachmentFiles()
}
