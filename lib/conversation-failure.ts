import type { ApiFailure } from '@/lib/conversation-api'

export type FailureNotice = { title: string; hint: string }

/**
 * What to put on screen when a conversation request failed.
 *
 * Four failures, four sentences, because the useful next move differs: a request
 * that never arrived is worth retrying, a refusal is worth reading, and a body
 * this client could not parse is worth saying is not the person's fault. An
 * expired session gets a sentence too even though it is usually invisible — the
 * auth layer is already moving to sign-in around it — so a screen that lingers
 * for a frame does not read as an empty inbox.
 */
export function failureNotice(failure: ApiFailure): FailureNotice {
  switch (failure.kind) {
    case 'unreachable':
      return {
        title: 'Cannot reach the server',
        hint: 'Check your connection and try again.',
      }
    case 'unauthorised':
      return {
        title: 'Your session ended',
        hint: 'Sign in again to pick up where you left off.',
      }
    case 'refused':
      return { title: 'Could not load conversations', hint: failure.message }
    case 'malformed':
      return {
        title: 'Could not read the reply',
        hint: 'The server answered with something this app did not understand.',
      }
  }
}

/**
 * One sentence for an Engage or a Takeover that did not happen.
 *
 * Shorter than `failureNotice`'s pair because it has less room and less to say:
 * it sits under the reason the composer is closed, beside the button that just
 * failed, and the person is still looking at the thread. A refusal is repeated
 * verbatim — the one that matters is `already_engaged`, "This chat is already
 * engaged.", which is exactly the news: somebody reached it first.
 */
export function assignmentRefusal(
  action: 'engage' | 'takeover',
  failure: ApiFailure,
): string {
  switch (failure.kind) {
    case 'unreachable':
      return 'Could not reach the server. Check your connection and try again.'
    case 'refused':
      return failure.message
    case 'malformed':
      return 'The server answered with something this app did not understand.'
    case 'unauthorised':
      // Not shown — `useConversationAssignment` drops this one, because the auth
      // layer is already sending the person to sign in. Answered anyway so the
      // switch stays total and a fifth failure would fail to compile here.
      return action === 'engage'
        ? 'Could not engage this conversation.'
        : 'Could not take over this conversation.'
  }
}
