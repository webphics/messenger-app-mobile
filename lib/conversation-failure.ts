import type { ApiFailure } from '@/lib/conversation-api'

export type FailureNotice = { title: string; hint: string }

/** The API's code for an Engage, Takeover or Transfer while assignment is off. */
const SUPPORT_ASSIGNMENT_DISABLED = 'support_assignment_disabled'
const ASSIGNMENT_SWITCHED_OFF =
  'Assignment has been switched off, so anyone on the team can reply here. Restart the app to start replying.'

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
export function failureNotice(
  failure: ApiFailure,
  refusedTitle = 'Could not load conversations',
): FailureNotice {
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
      return { title: refusedTitle, hint: failure.message }
    case 'malformed':
      return {
        title: 'Could not read the reply',
        hint: 'The server answered with something this app did not understand.',
      }
  }
}

/**
 * One sentence for a page of a thread that did not arrive, or nothing.
 *
 * Shorter than `failureNotice`'s pair because the thread is still on screen and
 * this has a strip above the composer rather than a screen: what is drawn is
 * still true, and the news is only that the last read did not land.
 *
 * An expired session says nothing here for the same reason it says nothing about
 * an Engage: the auth layer is already on its way to sign-in, and a line about a
 * page would arrive on a screen that is leaving. Over a thread with nothing to
 * draw it is `failureNotice` that speaks instead, because there a silence would
 * read as an empty conversation.
 */
export function readRefusal(failure: ApiFailure): string | null {
  switch (failure.kind) {
    case 'unreachable':
      return 'No connection. This is what this device already had.'
    case 'refused':
      return failure.message
    case 'malformed':
      return 'The server answered with something this app did not understand.'
    case 'unauthorised':
      return null
  }
}

/**
 * One sentence for an Engage or a Takeover that did not happen, or nothing.
 *
 * Shorter than `failureNotice`'s pair because it has less room and less to say:
 * it sits under the reason the composer is closed, beside the button that just
 * failed, and the person is still looking at the thread. A refusal is repeated
 * verbatim — the one that matters is `already_engaged`, "This chat is already
 * engaged.", which is exactly the news: somebody reached it first.
 *
 * An expired session is the one failure with nothing to say here. The auth layer
 * is already on its way to sign-in, and a sentence about engaging would arrive on
 * a screen that is leaving.
 *
 * The one refusal not repeated verbatim is `support_assignment_disabled`: the
 * switch went off after this session last read it, so the button was offered
 * by a client that did not know yet — and will go on offering it, since the
 * session is only read again at launch. So the sentence says what changed and
 * the one thing that brings the composer back.
 */
export function assignmentRefusal(failure: ApiFailure): string | null {
  switch (failure.kind) {
    case 'unreachable':
      return 'Could not reach the server. Check your connection and try again.'
    case 'refused':
      if (failure.code === SUPPORT_ASSIGNMENT_DISABLED) return ASSIGNMENT_SWITCHED_OFF
      return failure.message
    case 'malformed':
      return 'The server answered with something this app did not understand.'
    case 'unauthorised':
      return null
  }
}
