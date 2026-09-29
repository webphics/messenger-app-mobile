import {
  assignmentModeChanged,
  assignmentRefusal,
  assignmentSwitchedOnNotice,
  followRefusedWrite,
  refusedWriteFollowUp,
} from '@/lib/conversation-failure'
import type { Conversation } from '@/lib/types'

describe('assignmentRefusal', () => {
  test('assignment switched off since this session read it says so, and no longer asks for a restart', () => {
    expect(
      assignmentRefusal({
        kind: 'refused',
        message: 'Assignment is switched off; any staff member can reply.',
        code: 'support_assignment_disabled',
      }),
    ).toBe('Assignment has been switched off, so anyone on the team can reply here.')
  })

  test('says nothing about an expired session, which is already leaving the screen', () => {
    expect(assignmentRefusal({ kind: 'unauthorised' })).toBeNull()
  })
})

function refusedWith(code?: string) {
  return { kind: 'refused' as const, message: 'Refused.', ...(code ? { code } : {}) }
}

describe('assignmentModeChanged', () => {
  test('believed on, only support_assignment_disabled says the switch moved', () => {
    expect(assignmentModeChanged(refusedWith('support_assignment_disabled'), true)).toBe(true)
    // An assignment code while assignment is on is a lost Engage race, not a mode change.
    expect(assignmentModeChanged(refusedWith('already_engaged'), true)).toBe(false)
    expect(assignmentModeChanged({ kind: 'refused' as const, message: 'must_engage' }, true)).toBe(false)
  })

  test('believed off, the assignment codes say it came back on', () => {
    for (const code of ['must_engage', 'must_take_over', 'already_engaged']) {
      expect(assignmentModeChanged(refusedWith(code), false)).toBe(true)
    }
    expect(assignmentModeChanged(refusedWith('support_assignment_disabled'), false)).toBe(false)
    expect(assignmentModeChanged(refusedWith(), false)).toBe(false)
  })
})

describe('assignmentSwitchedOnNotice', () => {
  test('names the next move only when assignment came back on under a refused write', () => {
    expect(assignmentSwitchedOnNotice(refusedWith('must_engage'), false)).toContain('engage')
    expect(assignmentSwitchedOnNotice(refusedWith('must_engage'), true)).toBeNull()
    expect(assignmentSwitchedOnNotice(refusedWith('conversation_not_found'), false)).toBeNull()
  })
})

describe('refusedWriteFollowUp', () => {
  test('a stale copy is fetched again and the session is left alone', () => {
    expect(refusedWriteFollowUp(refusedWith('conversation_closed'), true)).toEqual({
      refetch: true,
      reconfirmSession: false,
    })
  })

  test('support_assignment_disabled fetches the conversation and re-reads the session', () => {
    expect(refusedWriteFollowUp(refusedWith('support_assignment_disabled'), true)).toEqual({
      refetch: true,
      reconfirmSession: true,
    })
  })

  test('an assignment code while the switch is believed off re-reads the session too', () => {
    expect(refusedWriteFollowUp(refusedWith('must_engage'), false)).toEqual({
      refetch: true,
      reconfirmSession: true,
    })
  })
})

describe('followRefusedWrite', () => {
  const NOT_FOUND = {
    kind: 'refused' as const,
    message: 'Conversation not found.',
    code: 'conversation_not_found',
  }

  function deps(fetched: Awaited<ReturnType<typeof followRefusedWrite>>) {
    return {
      supportAssignmentEnabled: true,
      reconfirmSession: jest.fn(),
      getConversation: jest.fn(async () => fetched!),
      addConversation: jest.fn(),
    }
  }

  /*
   * A Close after somebody else closed the thread answers 404, and so does the
   * refetch when the thread is gone or no longer visible. The refetch's
   * failure goes back to the caller, which words it as any read refusal, and
   * is never run through the rule again.
   */
  test('a refetch that answers 404 is fetched once, adds nothing, and is handed back', async () => {
    const refetch = { ok: false as const, failure: NOT_FOUND }
    const held = deps(refetch)

    const answer = await followRefusedWrite('c1', NOT_FOUND, held)

    expect(held.getConversation).toHaveBeenCalledTimes(1)
    expect(held.getConversation).toHaveBeenCalledWith('c1')
    expect(held.addConversation).not.toHaveBeenCalled()
    expect(answer).toEqual(refetch)
  })

  test('a refetch that answers folds the fresh row into the list', async () => {
    const row = { id: 'c1' } as Conversation
    const held = deps({ ok: true, value: row })

    await followRefusedWrite('c1', { ...NOT_FOUND, code: 'forbidden' }, held)

    expect(held.addConversation).toHaveBeenCalledWith(row)
  })

  test('a refusal about the request fetches nothing and answers null', async () => {
    const held = deps(null)

    const answer = await followRefusedWrite('c1', { ...NOT_FOUND, code: 'validation_failed' }, held)

    expect(answer).toBeNull()
    expect(held.getConversation).not.toHaveBeenCalled()
    expect(held.reconfirmSession).not.toHaveBeenCalled()
  })

  test('support_assignment_disabled re-reads the session as well as the conversation', async () => {
    const held = deps({ ok: false, failure: NOT_FOUND })

    await followRefusedWrite('c1', { ...NOT_FOUND, code: 'support_assignment_disabled' }, held)

    expect(held.reconfirmSession).toHaveBeenCalledTimes(1)
    expect(held.getConversation).toHaveBeenCalledTimes(1)
  })
})
