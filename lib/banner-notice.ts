import { primaryAttachmentView } from '@/lib/attachment-view'
import { messagePreviewText } from '@/lib/message-attachment'
import { isOutgoing, isSystemMessage, messageSenderName } from '@/lib/thread-state'
import type { Message } from '@/lib/types'

/**
 * Whether an arriving Message is worth a strip at the top of the screen, and
 * what the strip says.
 *
 * The In-app banner is what a Message gets *instead of* a Push notification
 * while the app is open — so this is the same audience question the operating
 * system's surface answers, asked from the other side and answered by this app
 * because this app is the one on screen.
 *
 * Pure and table-tested for the reason `push-rules` next door is: the cases that
 * must draw *nothing* are the ones nobody would notice were wrong, because being
 * wrong looks like silence. Why the socket feeds it rather than an arriving
 * dispatch is `lib/in-app-banner`'s note, not this module's — nothing here knows
 * where its input came from.
 */

export type BannerNotice = {
  conversationId: string
  /** Who wrote it, as the strip names them. */
  sender: string
  /**
   * One line of what they wrote, or null for a Message with nothing to quote —
   * which the strip draws as no second line rather than as a word invented for
   * it.
   */
  preview: string | null
}

export type BannerInput = {
  conversationId: string
  message: Message
  viewerId: string
  /** The thread on screen, or null when no thread is. */
  threadOnScreen: string | null
  /** Whether the app is in front of the person. */
  foreground: boolean
  /** What this conversation is called, for a Message that names nobody. */
  title: string | null
}

/**
 * The strip's title for a Message that names nobody, in a conversation this
 * device cannot name either.
 *
 * Both halves happen. A Customer's Support DM carries no sender by design, and
 * a conversation this phone has never held has no row to take a name from — the
 * case #59 had to answer for a tapped notification. Saying so is better than
 * saying nothing: the strip still says a Message arrived and still opens the
 * thread, which is the whole of what it is for.
 */
const UNNAMED_SENDER = 'New message'

/**
 * What the strip quotes, which is what a row and a quote strip already quote.
 *
 * `messagePreviewText` rather than a word list of this module's own: the labels
 * for the kinds are the product's — Photo, Video, Voice note, and a document by
 * its own file name — and a second copy here is a second place for them to
 * drift out of the glossary.
 *
 * It answers the empty string for a Message carrying neither words nor an
 * attachment, which becomes no second line at all.
 */
function previewOf(message: Message): string | null {
  const preview = messagePreviewText({
    body: message.body,
    attachment: primaryAttachmentView(message.attachments),
  })

  return preview === '' ? null : preview
}

/**
 * Three refusals and then a strip.
 *
 * The order is not load-bearing — no two of them overlap in what they mean — but
 * the set is: each one is a moment where a banner would be the app reporting
 * something the person can already see, or reporting it twice.
 */
export function bannerNotice({
  conversationId,
  message,
  viewerId,
  threadOnScreen,
  foreground,
  title,
}: BannerInput): BannerNotice | null {
  // The operating system has drawn this one. A strip on the way back in is a
  // report of the past, on top of a notification that already said it.
  if (!foreground) return null

  // The bubble is already on screen. Naming it would be the app telling
  // somebody what they are reading.
  if (conversationId === threadOnScreen) return null

  // Both are the app talking about itself: a System notice is the thread's own
  // record of an assignment, and a viewer's own message is one they just sent.
  if (isSystemMessage(message)) return null
  if (isOutgoing(message, viewerId)) return null

  return {
    conversationId,
    sender: messageSenderName(message) ?? title ?? UNNAMED_SENDER,
    preview: previewOf(message),
  }
}
