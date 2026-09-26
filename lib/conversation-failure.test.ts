import {
  assignmentModeChanged,
  assignmentRefusal,
  assignmentSwitchedOnNotice,
  failureNotice,
  followRefusedWrite,
  readRefusal,
  refusedWriteFollowUp,
} from '@/lib/conversation-failure'
import type { Conversation } from '@/lib/types'

describe('failureNotice', () => {
  test('offers a retry for a request that never arrived', () => {
    expect(failureNotice({ kind: 'unreachable' })).toEqual({
      title: 'Cannot reach the server',
      hint: 'Check your connection and try again.',
    })
  })

  test('repeats what the server said when it refused', () => {
    expect(failureNotice({ kind: 'refused', message: 'Email not verified.' }).hint).toBe(
      'Email not verified.',
    )
  })

  test('titles a refusal for conversations by default', () => {
    expect(failureNotice({ kind: 'refused', message: 'x' }).title).toBe(
      'Could not load conversations',
    )
  })

  test('takes a caller-supplied title for a refusal in a different context', () => {
    expect(
      failureNotice({ kind: 'refused', message: 'x' }, 'Could not load the staff directory')
        .title,
    ).toBe('Could not load the staff directory')
  })

  test('says a session ended rather than showing an empty inbox', () => {
    expect(failureNotice({ kind: 'unauthorised' }).title).toBe('Your session ended')
  })

  test('does not blame the person for a body it could not read', () => {
    expect(failureNotice({ kind: 'malformed' }).title).toBe('Could not read the reply')
  })
})

describe('assignmentRefusal', () => {
  test('repeats the one refusal that matters: somebody reached the thread first', () => {
    expect(
      assignmentRefusal({ kind: 'refused', message: 'This chat is already engaged.' }),
    ).toBe('This chat is already engaged.')
  })

  test('and the one an Agent would get for a Takeover, if anything offered them one', () => {
    expect(
      assignmentRefusal({ kind: 'refused', message: "You don't have permission to do that." }),
    ).toBe("You don't have permission to do that.")
  })

  test("a code it does not single out is still repeated in the API's words", () => {
    expect(
      assignmentRefusal({
        kind: 'refused',
        message: 'This chat is already engaged.',
        code: 'already_engaged',
      }),
    ).toBe('This chat is already engaged.')
  })

  test('assignment switched off since this session read it says so, and no longer asks for a restart', () => {
    expect(
      assignmentRefusal({
        kind: 'refused',
        message: 'Assignment is switched off; any staff member can reply.',
        code: 'support_assignment_disabled',
      }),
    ).toBe('Assignment has been switched off, so anyone on the team can reply here.')
  })

  test('offers the retry a request that never arrived deserves', () => {
    expect(assignmentRefusal({ kind: 'unreachable' })).toBe(
      'Could not reach the server. Check your connection and try again.',
    )
  })

  test('does not blame the person for a body it could not read', () => {
    expect(assignmentRefusal({ kind: 'malformed' })).toBe(
      'The server answered with something this app did not understand.',
    )
  })

  test('says nothing about an expired session, which is already leaving the screen', () => {
    expect(assignmentRefusal({ kind: 'unauthorised' })).toBeNull()
  })
})

describe('readRefusal', () => {
  test('says what is drawn is what this device had, rather than that it is all there is', () => {
    expect(readRefusal({ kind: 'unreachable' })).toBe(
      'No connection. This is what this device already had.',
    )
  })

  test('repeats a refusal in the server’s own words', () => {
    expect(readRefusal({ kind: 'refused', message: 'Too many requests.' })).toBe(
      'Too many requests.',
    )
  })

  test('does not blame the person for a body it could not read', () => {
    expect(readRefusal({ kind: 'malformed' })).toBe(
      'The server answered with something this app did not understand.',
    )
  })

  test('says nothing about an expired session over a thread that is already leaving', () => {
    expect(readRefusal({ kind: 'unauthorised' })).toBeNull()
  })
})

/** Every refusal the two switch rules have to sort, once each. */
const refused = (code?: string) =>
  ({ kind: 'refused', message: 'The API says no.', ...(code ? { code } : {}) }) as const

const SWITCH_ROWS = [
  // [label, failure, believed on, believed off]
  ['support_assignment_disabled', refused('support_assignment_disabled'), true, false],
  ['must_engage', refused('must_engage'), false, true],
  ['must_take_over', refused('must_take_over'), false, true],
  ['already_engaged, a lost Engage race while on', refused('already_engaged'), false, true],
  ['an unrelated code', refused('conversation_not_found'), false, false],
  ['a refusal with no code', refused(), false, false],
  ['the code in the words and not the code', { kind: 'refused', message: 'must_engage' }, false, false],
  ['a request that never arrived', { kind: 'unreachable' }, false, false],
  ['a body it could not read', { kind: 'malformed' }, false, false],
  ['an expired session, which the auth layer already handles', { kind: 'unauthorised' }, false, false],
] as const

describe('assignmentModeChanged', () => {
  test.each(SWITCH_ROWS)('%s, with assignment believed on', (_label, failure, on) => {
    expect(assignmentModeChanged(failure, true)).toBe(on)
  })

  test.each(SWITCH_ROWS)('%s, with assignment believed off', (_label, failure, _on, off) => {
    expect(assignmentModeChanged(failure, false)).toBe(off)
  })
})

describe('assignmentSwitchedOnNotice', () => {
  // Each code names a different next move: an Agent engages, an Admin takes
  // over, and a thread somebody else holds offers the writer nothing.
  const SWITCHED_ON: Record<string, string> = {
    must_engage: 'Assignment was switched back on — engage this conversation to reply.',
    must_take_over: 'Assignment was switched back on — take over this conversation to reply.',
    already_engaged: 'Assignment was switched back on — someone else is handling this conversation.',
  }

  test.each(SWITCH_ROWS)('%s, with assignment believed off', (_label, failure, _on, off) => {
    const code = failure.kind === 'refused' && 'code' in failure ? failure.code : undefined
    expect(assignmentSwitchedOnNotice(failure, false)).toBe(off ? SWITCHED_ON[code ?? ''] : null)
  })

  // Believed on, nothing here speaks: the off-to-on sentence would be false,
  // and an Engage's own refusals are `assignmentRefusal`'s.
  test.each(SWITCH_ROWS)('%s, with assignment believed on', (_label, failure) => {
    expect(assignmentSwitchedOnNotice(failure, true)).toBeNull()
  })
})

describe('refusedWriteFollowUp', () => {
  function refusedWith(code?: string) {
    return { kind: 'refused' as const, message: 'Refused.', ...(code ? { code } : {}) }
  }

  test('a stale copy is fetched again and the session is left alone', () => {
    expect(refusedWriteFollowUp(refusedWith('conversation_closed'), true)).toEqual({
      refetch: true,
      reconfirmSession: false,
    })
  })

  test.each([true, false])(
    'support_assignment_disabled fetches the conversation and re-reads the session (switch believed on: %s)',
    (enabled) => {
      expect(refusedWriteFollowUp(refusedWith('support_assignment_disabled'), enabled)).toEqual({
        refetch: true,
        reconfirmSession: true,
      })
    },
  )

  test.each(['must_engage', 'must_take_over', 'already_engaged'])(
    '%s while the switch is believed off says it came back on: both reads',
    (code) => {
      expect(refusedWriteFollowUp(refusedWith(code), false)).toEqual({
        refetch: true,
        reconfirmSession: true,
      })
    },
  )

  test.each(['must_engage', 'must_take_over', 'already_engaged'])(
    '%s while the switch is believed on is an ordinary stale copy',
    (code) => {
      expect(refusedWriteFollowUp(refusedWith(code), true)).toEqual({
        refetch: true,
        reconfirmSession: false,
      })
    },
  )

  test.each([
    ['a validation error', refusedWith('validation_failed')],
    ['a refusal with no code', refusedWith()],
    ['a request that never arrived', { kind: 'unreachable' as const }],
    ['an expired session', { kind: 'unauthorised' as const }],
    ['an unreadable body', { kind: 'malformed' as const }],
  ])('%s does neither', (_label, failure) => {
    expect(refusedWriteFollowUp(failure, true)).toEqual({ refetch: false, reconfirmSession: false })
    expect(refusedWriteFollowUp(failure, false)).toEqual({ refetch: false, reconfirmSession: false })
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
    expect(readRefusal(refetch.failure)).toBe('Conversation not found.')
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
