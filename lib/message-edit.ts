import type { ApiFailure } from '@/lib/api-result'
import { isLocalId } from '@/lib/thread-state'
import type { ConversationType, Message } from '@/lib/types'

/**
 * Everything the long-press menu needs to know about editing, in one pure place.
 *
 * The same shape as `lib/wall-actions`: a table over the facts the API's own
 * `ConversationsPolicy.assertCanEditMessage` checks, so nothing the menu offers
 * opens onto a refusal. Kept out of the screen because a window predicate is the
 * kind of thing that is wrong in ways only a table test finds — off by an equals
 * sign, or judged against the wrong clock.
 */

/**
 * How long an author has to rewrite what they just sent.
 *
 * Mirrors `MESSAGE_EDIT_WINDOW_MS` in the API's `conversations.limits.ts`. The
 * copy is only ever used to decide whether to *offer* the control; the API
 * refuses on its own clock regardless, so drift here shows up as a menu item
 * that answers with a refusal, never as an edit that should not have happened.
 */
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000

/** The API's ceiling on a message body, mirrored so the sheet can say so first. */
export const MESSAGE_BODY_MAX = 4000

/**
 * Whether this person may rewrite this message, at this moment.
 *
 * `now` is a parameter rather than a `Date.now()` read inside, for the same
 * reason the API's policy takes one: a predicate that reads the clock cannot be
 * tabled, and every row judged in one pass should be judged against one instant.
 *
 * The five refusals, in the order they are cheapest to answer:
 *
 * 1. **Not yours.** `isOutgoing`'s rule, spelled out here rather than imported,
 *    because a Customer's own message and a Staff member's are recognised
 *    differently and the caller already knows which shape it holds.
 * 2. **Not sent yet.** A `local-` id is a message this device is still carrying;
 *    the API has never seen it and has nothing to edit. Retry or delete is the
 *    remedy for one of those, not edit.
 * 3. **Not text.** A voice note has no body to rewrite and will not grow one, and
 *    a `system` notice is the product's own wording.
 * 4. **Announcements.** Read-only for everyone, including the Admin who sent
 *    them — the copy in each Community's thread carries that Admin's id, so
 *    authorship alone would let them through.
 * 5. **Too late.** Last, so an author who is refused learns the one reason that
 *    would have been different a minute ago.
 *
 * A closed support DM is deliberately **not** tested here: the thread is
 * read-only in that state and the menu carries no actions at all, which is the
 * same gate the composer uses. The API refuses it anyway.
 */
export function canEditMessage(input: {
  message: Message
  outgoing: boolean
  conversationType?: ConversationType
  now: number
}): boolean {
  const { message, outgoing, conversationType, now } = input

  if (!outgoing) return false
  if (isLocalId(message.id)) return false
  if (message.messageType !== 'text') return false
  if (conversationType === 'broadcast_inbox') return false

  const sentAt = Date.parse(message.createdAt)
  if (Number.isNaN(sentAt)) return false

  return now - sentAt <= MESSAGE_EDIT_WINDOW_MS
}

/**
 * One sentence for a refusal the menu did not anticipate — a window that closed
 * while the sheet was open, a Group whose Write policy tightened underneath it.
 *
 * `refused` carries the API's own message, which is already written for a person,
 * so it is passed through rather than replaced. The other three failures are
 * transport and say so in this app's own words, the way `wallActionRefusal` does.
 */
export function messageEditRefusal(failure: ApiFailure): string {
  switch (failure.kind) {
    case 'refused':
      return failure.message
    case 'unauthorised':
      return 'Sign in again to edit this message.'
    case 'unreachable':
      return 'No connection. The message was not changed.'
    case 'malformed':
      return 'Something went wrong. The message was not changed.'
  }
}

/**
 * How much of a quoted message a reply freezes. Mirrors `REFERENCE_PREVIEW_MAX`
 * in the API, so a quote this app refreshes matches one the server wrote.
 */
const REPLY_PREVIEW_MAX = 140

/**
 * Re-freezes the quote on every reply pointing at a message that has just been
 * rewritten.
 *
 * `replyTo.preview` is a copy of the quoted message's first 140 characters, taken
 * when the reply was sent and refreshed by nothing. The API rewrites the stored
 * copies, but only the edited message is re-broadcast — re-sending every reply to
 * it would be unbounded fan-out for a cosmetic field — so a thread already on
 * screen would keep showing the old wording inside every quote of it.
 *
 * Returns the array unchanged when nothing quoted the message, and leaves every
 * untouched reply's identity alone, because `MessageBubble` is memoised on the
 * props it was handed.
 */
export function withRefreshedQuotes(messages: Message[], edited: Message): Message[] {
  const preview = edited.body.slice(0, REPLY_PREVIEW_MAX)
  let changed = false

  const next = messages.map((message) => {
    const quoted = message.replyTo
    if (!quoted || quoted.id !== edited.id || quoted.preview === preview) return message

    changed = true
    return { ...message, replyTo: { ...quoted, preview } }
  })

  return changed ? next : messages
}
