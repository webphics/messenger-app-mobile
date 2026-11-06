import type { ApiFailure } from '@/lib/api-result'
import { mergeMessages, type ThreadState } from '@/lib/thread-state'
import type { Message, MessageReplyTo } from '@/lib/types'

/**
 * What a message delete needs around it: what to put back if the API refuses,
 * how to put it back, and the sentence for the refusal.
 *
 * Whether Delete is offered is not decided here. The API sends each message's
 * `deletable` and the conversation's `deleteMessages`, and `messageActions` in
 * `lib/conversation-access` reads both. The removal itself is `withoutMessages`
 * in `lib/thread-state`, the reducer `message.deleted` already uses, so a
 * delete from this phone and one from anywhere else leave the thread alike.
 */

/** The message a delete took out of the thread, and the quotes of it it cleared. */
export type DeletedMessage = {
  message: Message
  /** Each reply that quoted it, by id, with the quote it held. */
  quotes: ReadonlyMap<string, MessageReplyTo>
}

/**
 * What `withoutMessages` is about to take for this message, read before it
 * does, or null when the thread does not hold the message.
 */
export function deletionSnapshot(state: ThreadState, messageId: string): DeletedMessage | null {
  const message = state.messages.find((item) => item.id === messageId)
  if (!message) return null

  const quotes = new Map<string, MessageReplyTo>()
  for (const item of state.messages) {
    if (item.replyTo?.id === messageId) quotes.set(item.id, item.replyTo)
  }
  return { message, quotes }
}

/**
 * A refused delete, undone: the message back in its place and its quotes back
 * in the replies that held them.
 *
 * Onto the thread as it is now rather than the one the delete read, for the
 * reason a refused edit is: a receipt or a reaction can have landed on a reply
 * while the request was out, so only the quote is put back on it. A reply whose
 * quote is set again (a page already brought the server's copy) is left alone,
 * and so is the message itself when a page put it back first.
 */
export function withRestoredMessage(state: ThreadState, deleted: DeletedMessage): ThreadState {
  const present = state.messages.some((item) => item.id === deleted.message.id)
  const needsQuote = state.messages.some(
    (item) => item.replyTo === null && deleted.quotes.has(item.id),
  )
  if (present && !needsQuote) return state

  const quoted = state.messages.map((item) => {
    const quote = item.replyTo === null ? deleted.quotes.get(item.id) : undefined
    return quote ? { ...item, replyTo: quote } : item
  })
  return {
    ...state,
    messages: present ? quoted : mergeMessages(quoted, [deleted.message]),
  }
}

/**
 * Whether a refused delete means the message is already gone: somebody else
 * deleted it first, and this device had not heard `message.deleted` yet. The
 * person asked for it to be gone and it is, so this settles like a delete that
 * landed rather than putting back a message the API no longer has.
 */
export function deleteRefusalMeansGone(failure: ApiFailure): boolean {
  return failure.kind === 'refused' && failure.code === 'message_not_found'
}

/**
 * One sentence for a delete that did not land.
 *
 * `refused` carries the API's own message, already written for a person, and
 * `message_not_deletable` has this client's wording in `lib/api-result`. The
 * other three are transport and say so in this app's words, the way
 * `messageEditRefusal` does.
 */
export function messageDeleteRefusal(failure: ApiFailure): string {
  switch (failure.kind) {
    case 'refused':
      return failure.message
    case 'unauthorised':
      return 'Sign in again to delete this message.'
    case 'unreachable':
      return 'No connection. The message was not deleted.'
    case 'malformed':
      return 'Something went wrong. The message may not have been deleted.'
  }
}

/** What the confirmation says, which depends on whether there are attachments to lose. */
export function deleteConfirmationText(message: Pick<Message, 'attachments'>): string {
  return message.attachments.length > 0
    ? 'This message and its attachments will be deleted for everyone in this conversation. This can’t be undone.'
    : 'This message will be deleted for everyone in this conversation. This can’t be undone.'
}
