import type { ApiResult } from '@/lib/api-result'
import type { ApiFailure } from '@/lib/conversation-api'
import { refusalMeansStale } from '@/lib/conversation-access'
import type { Conversation } from '@/lib/types'

export type FailureNotice = { title: string; hint: string }

/** The API's code for an Engage, Takeover or Transfer while assignment is off. */
const SUPPORT_ASSIGNMENT_DISABLED = 'support_assignment_disabled'
const ASSIGNMENT_SWITCHED_OFF =
  'Assignment has been switched off, so anyone on the team can reply here.'

/**
 * The API's codes for a staff write — a send, an upload, a reaction, an edit —
 * in a Support DM the writer does not hold while assignment is on
 * (`ConversationsPolicy.assertCanSend`): nobody holds it, an Admin must take it
 * over, or another Agent holds it. `already_engaged` is also a lost Engage race,
 * which is why the set is only read while this device thinks assignment is off.
 */
const ASSIGNMENT_REQUIRED = new Set(['must_engage', 'must_take_over', 'already_engaged'])
/** The next move each code leaves the writer, once assignment is back on. */
const ASSIGNMENT_SWITCHED_ON: Record<string, string> = {
  must_engage: 'Assignment was switched back on — engage this conversation to reply.',
  must_take_over: 'Assignment was switched back on — take over this conversation to reply.',
  already_engaged: 'Assignment was switched back on — someone else is handling this conversation.',
}

/**
 * Whether a refusal says the assignment switch moved after this session read it.
 *
 * The refusals that are about this device rather than the request. With the
 * switch believed on, `support_assignment_disabled` says it went off. With it
 * believed off, the assignment codes say it came back on — none of them can
 * arrive in a Shared queue. Anything else, including those same codes while the
 * switch is believed on, is an ordinary refusal of the request.
 *
 * The switch is read off the session, and the session is otherwise read again
 * only at launch or while Stale. So on true the write path re-reads the session
 * (`reconfirmSession` in `lib/auth-context`, through `refusedWriteFollowUp`
 * below), which is what moves the screens between the two modes without a
 * restart.
 */
export function assignmentModeChanged(
  failure: ApiFailure,
  supportAssignmentEnabled: boolean,
): boolean {
  if (failure.kind !== 'refused' || failure.code === undefined) return false
  return supportAssignmentEnabled
    ? failure.code === SUPPORT_ASSIGNMENT_DISABLED
    : ASSIGNMENT_REQUIRED.has(failure.code)
}

/** What a conversation write path does after the API refused the write. */
export type RefusedWriteFollowUp = {
  /** Fetch the conversation again, because the copy on screen is stale. */
  refetch: boolean
  /** Read the session again, because the Shared queue switch moved. */
  reconfirmSession: boolean
}

/**
 * What to do after a refused conversation write: send, react, edit, upload,
 * engage, take over, transfer, close, reopen, a label change or a note.
 *
 * `refetch` is the adapter's answer (`refusalMeansStale` in
 * `lib/conversation-access`): the conversation changed under this device, and
 * the fresh copy carries the `access` that moves the composer and the actions.
 *
 * `reconfirmSession` is the Shared queue switch, which lives on the session
 * and sends no conversation event. `support_assignment_disabled` says it is
 * off whatever this device believed, and `assignmentModeChanged` keeps the
 * other direction: an assignment code while the switch is believed off says it
 * came back on.
 */
export function refusedWriteFollowUp(
  failure: ApiFailure,
  supportAssignmentEnabled: boolean,
): RefusedWriteFollowUp {
  const switchedOff = failure.kind === 'refused' && failure.code === SUPPORT_ASSIGNMENT_DISABLED
  return {
    refetch: refusalMeansStale(failure),
    reconfirmSession: switchedOff || assignmentModeChanged(failure, supportAssignmentEnabled),
  }
}

/** What `followRefusedWrite` reads and calls, passed in so it stays testable. */
export type RefusedWriteDeps = {
  supportAssignmentEnabled: boolean
  reconfirmSession: () => void
  getConversation: (id: string) => Promise<ApiResult<Conversation>>
  addConversation: (conversation: Conversation) => void
}

/**
 * Carries out `refusedWriteFollowUp`: re-reads the session when the switch
 * moved, and fetches the conversation again when the copy is stale, folding a
 * fresh row into the list. Answers the refetch's result, or null when there
 * was none.
 *
 * A refetch that fails, a 404 for a thread that was deleted or is no longer
 * visible included, is handed back as it is and adds nothing. It is never run
 * through the rule again, so a 404 answered by a 404 is one request, not a
 * loop. The caller words it as any other refusal.
 */
export async function followRefusedWrite(
  conversationId: string,
  failure: ApiFailure,
  deps: RefusedWriteDeps,
): Promise<ApiResult<Conversation> | null> {
  const followUp = refusedWriteFollowUp(failure, deps.supportAssignmentEnabled)
  if (followUp.reconfirmSession) deps.reconfirmSession()
  if (!followUp.refetch) return null

  const fresh = await deps.getConversation(conversationId)
  if (fresh.ok) deps.addConversation(fresh.value)
  return fresh
}

/**
 * The sentence a refused write shows when assignment came back on under it, or
 * null for every other refusal — which keeps whatever its caller already says.
 *
 * Only the off-to-on direction has one here: a write refused because the
 * switch went *off* cannot happen, since a Shared queue refuses no staff member
 * a write that assignment would have allowed. The API's own sentence ("Engage
 * this conversation before sending a message.") is not wrong, but it reads as
 * a rule this person broke rather than a rule that changed under them.
 */
export function assignmentSwitchedOnNotice(
  failure: ApiFailure,
  supportAssignmentEnabled: boolean,
): string | null {
  if (supportAssignmentEnabled || failure.kind !== 'refused') return null
  if (!assignmentModeChanged(failure, false)) return null
  return ASSIGNMENT_SWITCHED_ON[failure.code ?? ''] ?? null
}

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
 * by a client that did not know yet. The write path re-reads the session on it
 * (`refusedWriteFollowUp`), and the composer opens once that lands, so the
 * sentence says what changed and nothing about what to do.
 */
export function assignmentRefusal(failure: ApiFailure): string | null {
  switch (failure.kind) {
    case 'unreachable':
      return 'Could not reach the server. Check your connection and try again.'
    case 'refused':
      if (assignmentModeChanged(failure, true)) return ASSIGNMENT_SWITCHED_OFF
      return failure.message
    case 'malformed':
      return 'The server answered with something this app did not understand.'
    case 'unauthorised':
      return null
  }
}
