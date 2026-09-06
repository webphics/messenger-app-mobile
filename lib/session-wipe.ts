import { wipeAttachmentFiles } from '@/lib/attachment-cache'
import { wipeStore } from '@/lib/conversation-store'
import { deregisterPushDevice } from '@/lib/push-registry'

/**
 * Destroy everything a session left behind: the database file, the documents
 * downloaded out of the threads in it, and the row that lets the API push to
 * this phone.
 *
 * One place rather than three call sites, because the list is the point. A
 * Session end has to leave nothing readable behind, and the way that stops being
 * true is a later slice adding a fourth thing and wiring it into only one of the
 * moments that end a session. There is one path, and the moments reach it
 * through `forgetCredential` in `lib/auth-service` — which is what makes signing
 * out, a Session expiry and a refused credential the same thing here. The push
 * registration arrived as exactly the third thing that list was built for.
 *
 * Hydration's Unreachable outcome deliberately does not come through here. It
 * keeps the Session cookie, so it keeps the Store — and, for the same reason,
 * the registration: a cold start that cannot reach the API is not a session
 * ending, and pushes go on arriving.
 *
 * ## The order is the contract
 *
 * The registration first and unawaited, then the database, then the documents.
 *
 * First because it is the only half that leaves this phone: it wants the network
 * running while the two local wipes happen rather than after them. Unawaited
 * because it is the only half that can take as long as a network does — a wipe
 * must not wait on a request, which is the same reason a sign-out discards the
 * credential before telling the server. (`signOut` waits for it later, in one
 * place and for one reason: its logout would refuse the request this fired. That
 * is an ordering, not a wait — the screens have already moved.) Its failure is
 * caught here rather than left to whatever it does inside: a rejection nobody is
 * waiting on is a crash in some runtimes, and the guarantee that a Session end
 * survives one belongs to this list rather than to one of the things on it.
 *
 * The database before the documents, so that a database that will not go cannot
 * take the documents down with it. That is the one guard here: a failure
 * discarding the documents is last and can skip nothing, and whether a Session
 * end may be *failed* by a wipe at all is `forgetCredential`'s question rather
 * than this file's.
 *
 * `cookie` is the credential this session is ending with, captured before it was
 * discarded. Only the registration needs it — see `deregisterPushDevice` — and a
 * null is a moment with nothing to authenticate with rather than a moment with
 * nothing to wipe.
 */
export async function endSessionOnDevice(cookie: string | null): Promise<void> {
  // Started, not awaited, and its failure caught here. See the note above.
  void deregisterPushDevice(cookie).catch(() => {})

  try {
    // Awaited, unlike the files: a write already past the Store's queue is on
    // its way to the file being removed, and `wipeStore` is what waits for it.
    await wipeStore()
  } catch {
    // Swallowed here and only here, so that the documents still go.
  }

  wipeAttachmentFiles()
}
