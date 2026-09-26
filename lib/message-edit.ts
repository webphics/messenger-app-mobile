import type { ApiFailure } from '@/lib/api-result'
import type { Message } from '@/lib/types'

/**
 * What the edit sheet needs around an edit: the body ceiling, the refusal
 * wording, and the quote refresh after one lands.
 *
 * Whether Edit is offered at all is not decided here. The API sends each
 * message's `editableUntil` and each conversation's `editMessages`, and
 * `messageActions` in `lib/conversation-access` reads both. The fifteen-minute
 * window is defined only in the API.
 */

/** The API's ceiling on a message body, mirrored so the sheet can say so first. */
export const MESSAGE_BODY_MAX = 4000

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
