import {
  composerView,
  messageActions,
  parseAccess,
  threadActionsView,
  UNKNOWN_ACCESS,
} from '@/lib/conversation-access'
import type { Message } from '@/lib/types'

/** Every action the API sends, all off, with the ones a case turns on. */
function actions(on: Record<string, unknown> = {}) {
  return {
    editMessages: false,
    engage: false,
    takeOver: false,
    transfer: false,
    close: false,
    reopen: false,
    setPriority: false,
    ...on,
  }
}

/** `access` as the API sends it on a conversation this viewer may write in. */
function openPayload() {
  return { write: { state: 'open' }, actions: actions({ editMessages: true }) }
}

/** `access` as the API sends it on a conversation this viewer may only read. */
function readOnlyPayload(write: Record<string, unknown>) {
  return {
    write: { state: 'read_only', holder: null, wayOut: null, ...write },
    actions: actions(),
  }
}

/**
 * One action missing, null, a string or a number. Each is a rule this build
 * cannot read, so each makes the whole answer unknown.
 */
function malformedActions(action: string): [string, unknown][] {
  const payload = (value: unknown) => {
    const sent: Record<string, unknown> = actions({ [action]: value })
    if (value === undefined) delete sent[action]
    return { write: { state: 'open' }, actions: sent }
  }
  return [
    [`actions with no ${action}`, payload(undefined)],
    [`a ${action} that is null`, payload(null)],
    [`a ${action} that is a string`, payload('true')],
    [`a ${action} that is a number`, payload(1)],
  ]
}

const PRIYA = { id: 'agent-2', name: 'Priya Raman' }

/** What the composer shows for a payload, read the way a screen reads it. */
function composerFor(payload: unknown, writePolicy?: 'everyone' | 'admins' | 'named' | null) {
  return composerView(parseAccess(payload), { writePolicy })
}

describe('parseAccess', () => {
  test('reads an open composer', () => {
    expect(parseAccess(openPayload())).toEqual({
      write: { state: 'open' },
      actions: actions({ editMessages: true }),
    })
  })

  test('reads a read-only composer with its reason, holder and way out', () => {
    const payload = readOnlyPayload({ reason: 'must_take_over', holder: PRIYA, wayOut: 'take_over' })

    expect(parseAccess(payload)).toEqual({
      write: { state: 'read_only', reason: 'must_take_over', holder: PRIYA, wayOut: 'take_over' },
      actions: actions(),
    })
  })

  test('reads an absent holder and way out as none', () => {
    expect(
      parseAccess({
        write: { state: 'read_only', reason: 'conversation_closed' },
        actions: actions(),
      }),
    ).toEqual({
      write: { state: 'read_only', reason: 'conversation_closed', holder: null, wayOut: null },
      actions: actions(),
    })
  })

  /*
   * A Customer may still send in a closed Support DM, and may not edit there.
   * The API says so with an open write and Edit off, and the two read apart.
   */
  test('reads the thread actions the API offers', () => {
    const actions = {
      editMessages: true,
      engage: false,
      takeOver: false,
      transfer: true,
      close: true,
      reopen: false,
      setPriority: true,
    }

    expect(parseAccess({ write: { state: 'open' }, actions })).toEqual({
      write: { state: 'open' },
      actions,
    })
  })

  test('reads an open write with editing off', () => {
    expect(
      parseAccess({ write: { state: 'open' }, actions: actions() }),
    ).toEqual({ write: { state: 'open' }, actions: actions() })
  })

  test('keeps only the actions it knows', () => {
    const payload = { write: { state: 'open' }, actions: actions({ editMessages: true, pinMessages: true }) }

    expect(parseAccess(payload)).toEqual({ write: { state: 'open' }, actions: actions({ editMessages: true }) })
  })

  test('keeps only the holder fields it knows', () => {
    const payload = readOnlyPayload({
      reason: 'already_engaged',
      holder: { ...PRIYA, isOnline: true },
    })

    expect(parseAccess(payload)).toMatchObject({ write: { holder: PRIYA } })
  })

  test('reads the same thing twice, so a row the Store wrote reads back as it was written', () => {
    const once = parseAccess(readOnlyPayload({ reason: 'must_engage', wayOut: 'engage' }))

    expect(parseAccess(JSON.parse(JSON.stringify(once)))).toEqual(once)
  })

  /*
   * Unknown is what a row restored from a Store written before `access` existed
   * reads as, and what an API that has not deployed it yet sends. Anything this
   * build cannot read is the same answer: guessing at a reason would offer
   * somebody a composer or a button the API may refuse.
   */
  test.each([
    ['a missing field', undefined],
    ['null', null],
    ['a string', 'open'],
    ['an array', []],
    ['no write', { actions: actions({ editMessages: true }) }],
    ['a write that is not an object', { write: 'open', actions: actions({ editMessages: true }) }],
    ['a write state it does not know', { write: { state: 'maybe' }, actions: actions({ editMessages: true }) }],
    ['a read-only write with no reason', { write: { state: 'read_only' }, actions: actions() }],
    ['a reason it does not know', readOnlyPayload({ reason: 'must_wait' })],
    ['a way out it does not know', readOnlyPayload({ reason: 'must_engage', wayOut: 'claim' })],
    ['a way out that is not a string', readOnlyPayload({ reason: 'must_engage', wayOut: true })],
    ['a holder with no name', readOnlyPayload({ reason: 'already_engaged', holder: { id: 'agent-2' } })],
    ['a holder that is not an object', readOnlyPayload({ reason: 'already_engaged', holder: 'Priya' })],
    ['no actions', { write: { state: 'open' } }],
    ['actions that are not an object', { write: { state: 'open' }, actions: [] }],
    ['empty actions', { write: { state: 'open' }, actions: {} }],
    ...malformedActions('editMessages'),
    ...malformedActions('engage'),
    ...malformedActions('takeOver'),
    ...malformedActions('transfer'),
    ...malformedActions('close'),
    ...malformedActions('reopen'),
    ...malformedActions('setPriority'),
    ['the unknown marker itself', UNKNOWN_ACCESS],
  ])('reads %s as unknown', (_case, payload) => {
    expect(parseAccess(payload)).toEqual({ kind: 'unknown' })
  })
})

describe('composerView', () => {
  test('an open write opens the composer', () => {
    expect(composerFor(openPayload())).toEqual({ kind: 'open' })
  })

  test('an Agent on an Unassigned Support DM is told to engage, and offered Engage', () => {
    expect(composerFor(readOnlyPayload({ reason: 'must_engage', wayOut: 'engage' }))).toEqual({
      kind: 'read-only',
      reason: 'Engage this conversation to reply.',
      wayOut: { wayOut: 'engage', label: 'Engage chat' },
    })
  })

  test('an Agent on a Support DM another agent holds is told who holds it, and offered nothing', () => {
    expect(composerFor(readOnlyPayload({ reason: 'already_engaged', holder: PRIYA }))).toEqual({
      kind: 'read-only',
      reason: 'Priya Raman is handling this conversation.',
      wayOut: null,
    })
  })

  test('a Support DM held by nobody the API named still says why it is read-only', () => {
    expect(composerFor(readOnlyPayload({ reason: 'already_engaged', holder: null }))).toEqual({
      kind: 'read-only',
      reason: 'Another agent is handling this conversation.',
      wayOut: null,
    })
  })

  test('an Admin on a Support DM another agent holds is offered Take over', () => {
    expect(
      composerFor(readOnlyPayload({ reason: 'must_take_over', holder: PRIYA, wayOut: 'take_over' })),
    ).toEqual({
      kind: 'read-only',
      reason: 'Take over this conversation to reply.',
      wayOut: { wayOut: 'take_over', label: 'Take over' },
    })
  })

  test('a closed Support DM offers Reopen to somebody the API lets reopen it', () => {
    expect(composerFor(readOnlyPayload({ reason: 'conversation_closed', wayOut: 'reopen' }))).toEqual({
      kind: 'read-only',
      reason: 'This conversation is closed.',
      wayOut: { wayOut: 'reopen', label: 'Reopen conversation' },
    })
  })

  test('a closed Support DM offers nothing to somebody the API does not let reopen it', () => {
    expect(composerFor(readOnlyPayload({ reason: 'conversation_closed' }))).toEqual({
      kind: 'read-only',
      reason: 'This conversation is closed.',
      wayOut: null,
    })
  })

  test('an Announcements Thread is read-only, with no way out', () => {
    expect(composerFor(readOnlyPayload({ reason: 'broadcast_inbox_read_only' }))).toEqual({
      kind: 'read-only',
      reason: 'Announcements are posted by the team.',
      wayOut: null,
    })
  })

  test("a Group whose Write policy names its writers says so, in the Group's own words", () => {
    expect(composerFor(readOnlyPayload({ reason: 'group_write_restricted' }), 'named')).toEqual({
      kind: 'read-only',
      reason: 'Only the members chosen for this group can send messages here.',
      wayOut: null,
    })
  })

  test.each(['admins', 'everyone', null, undefined] as const)(
    'a restricted Group under the %s policy gets the admins wording',
    (writePolicy) => {
      expect(composerFor(readOnlyPayload({ reason: 'group_write_restricted' }), writePolicy)).toEqual({
        kind: 'read-only',
        reason: "Only this group's admins can send messages here.",
        wayOut: null,
      })
    },
  )

  test('the way out follows the API, whatever the reason', () => {
    expect(composerFor(readOnlyPayload({ reason: 'group_write_restricted', wayOut: 'engage' }))).toMatchObject({
      wayOut: { wayOut: 'engage', label: 'Engage chat' },
    })
  })

  test('unknown access is read-only and updating, with no way out', () => {
    expect(composerView(UNKNOWN_ACCESS)).toEqual({
      kind: 'read-only',
      reason: 'Updating this conversation…',
      wayOut: null,
    })
  })

  test('a missing access field renders the same as unknown', () => {
    expect(composerFor(undefined)).toEqual(composerView(UNKNOWN_ACCESS))
  })
})

describe('messageActions', () => {
  const NOW = Date.parse('2026-09-26T12:00:00.000Z')
  /** The end of the author's window, a few minutes from now. */
  const UNTIL = '2026-09-26T12:05:00.000Z'

  /** A text message this viewer sent, as the API sends it with its edit window. */
  function message(overrides: Partial<Message> = {}): Message {
    return {
      id: 'msg-1',
      body: 'hello',
      messageType: 'text',
      createdAt: '2026-09-26T11:55:00.000Z',
      editedAt: null,
      editableUntil: UNTIL,
      replyTo: null,
      reactions: [],
      attachments: [],
      receiptStatus: 'sent',
      fromCompany: false,
      ...overrides,
    } as Message
  }

  /** What the long-press menu offers on a message, read the way the thread screen reads it. */
  function offersEdit(payload: unknown, overrides: Partial<Message> = {}, now = NOW) {
    return messageActions(parseAccess(payload), message(overrides), now).edit
  }

  test('offers Edit inside the window when editing is on', () => {
    expect(offersEdit(openPayload())).toBe(true)
  })

  test('offers Edit 1 ms before the window ends', () => {
    expect(offersEdit(openPayload(), {}, Date.parse(UNTIL) - 1)).toBe(true)
  })

  test('does not offer Edit at exactly the end of the window', () => {
    expect(offersEdit(openPayload(), {}, Date.parse(UNTIL))).toBe(false)
  })

  test('does not offer Edit after the window', () => {
    expect(offersEdit(openPayload(), {}, Date.parse(UNTIL) + 60_000)).toBe(false)
  })

  /* Someone else's message, a voice note, a system notice, a broadcast: the API sends null. */
  test('does not offer Edit on a message this viewer can never edit', () => {
    expect(offersEdit(openPayload(), { editableUntil: null })).toBe(false)
  })

  test('does not offer Edit on a message this device has not sent yet', () => {
    expect(offersEdit(openPayload(), { id: 'local-abc' })).toBe(false)
  })

  /* The Customer in a closed Support DM: still open to write, and not to edit. */
  test('does not offer Edit when editing is off, even with an open composer', () => {
    expect(offersEdit({ write: { state: 'open' }, actions: actions() })).toBe(false)
  })

  test('does not offer Edit in a thread this viewer may only read', () => {
    expect(offersEdit(readOnlyPayload({ reason: 'conversation_closed', wayOut: 'reopen' }))).toBe(false)
  })

  test('does not offer Edit while the access is unknown', () => {
    expect(offersEdit(undefined)).toBe(false)
    expect(messageActions(undefined, message(), NOW)).toEqual({ edit: false })
  })

  test('does not offer Edit on a window end it cannot read', () => {
    expect(offersEdit(openPayload(), { editableUntil: 'soon' })).toBe(false)
  })
})

describe('threadActionsView', () => {
  /** What the details screen offers for a payload, read the way the screen reads it. */
  function offered(payload: unknown) {
    return threadActionsView(parseAccess(payload))
  }

  test('an Agent holding a Support DM, with both Capabilities, is offered Transfer and Close', () => {
    const payload = {
      write: { state: 'open' },
      actions: actions({ editMessages: true, transfer: true, close: true, setPriority: true }),
    }

    expect(offered(payload)).toEqual({
      engage: false,
      takeOver: false,
      transfer: true,
      close: true,
      reopen: false,
    })
  })

  const NONE = { engage: false, takeOver: false, transfer: false, close: false, reopen: false }

  test('an Agent holding a Support DM without the Close Capability is offered Transfer alone', () => {
    const payload = {
      write: { state: 'open' },
      actions: actions({ editMessages: true, transfer: true, setPriority: true }),
    }

    expect(offered(payload)).toEqual({ ...NONE, transfer: true })
  })

  test('an Agent holding a Support DM without the Transfer Capability is offered Close alone', () => {
    const payload = {
      write: { state: 'open' },
      actions: actions({ editMessages: true, close: true, setPriority: true }),
    }

    expect(offered(payload)).toEqual({ ...NONE, close: true })
  })

  test('an Agent looking at a Support DM another agent holds is offered nothing', () => {
    const payload = readOnlyPayload({ reason: 'already_engaged', holder: PRIYA })
    payload.actions = actions({ setPriority: true })

    expect(offered(payload)).toEqual(NONE)
  })

  test('an Agent on an Unassigned Support DM is offered Engage', () => {
    const payload = readOnlyPayload({ reason: 'must_engage', wayOut: 'engage' })
    payload.actions = actions({ engage: true, setPriority: true })

    expect(offered(payload)).toEqual({ ...NONE, engage: true })
  })

  test('an Agent with the Close Capability is offered Reopen on a closed Support DM', () => {
    const payload = readOnlyPayload({ reason: 'conversation_closed', wayOut: 'reopen' })
    payload.actions = actions({ reopen: true, setPriority: true })

    expect(offered(payload)).toEqual({ ...NONE, reopen: true })
  })

  test('an Agent without the Close Capability is offered nothing on a closed Support DM', () => {
    const payload = readOnlyPayload({ reason: 'conversation_closed' })
    payload.actions = actions({ setPriority: true })

    expect(offered(payload)).toEqual(NONE)
  })

  test('an Admin on a Support DM another agent holds is offered Take over, and not Close or Transfer', () => {
    const payload = readOnlyPayload({ reason: 'must_take_over', holder: PRIYA, wayOut: 'take_over' })
    payload.actions = actions({ takeOver: true, setPriority: true })

    expect(offered(payload)).toEqual({ ...NONE, takeOver: true })
  })

  test('an Admin holding a Support DM is offered Transfer and Close', () => {
    const payload = {
      write: { state: 'open' },
      actions: actions({ editMessages: true, transfer: true, close: true, setPriority: true }),
    }

    expect(offered(payload)).toEqual({ ...NONE, transfer: true, close: true })
  })

  /* A Customer may write in their own Support DM, closed or not, and act on it never. */
  test('a Customer is offered nothing, with an open composer', () => {
    const payload = { write: { state: 'open' }, actions: actions({ editMessages: true }) }

    expect(offered(payload)).toEqual(NONE)
  })

  /* A Shared queue has no assignee: nothing to engage, take over or hand on. */
  test('a Shared queue offers Close and nothing to claim or hand on', () => {
    const payload = {
      write: { state: 'open' },
      actions: actions({ editMessages: true, close: true, setPriority: true }),
    }

    expect(offered(payload)).toEqual({ ...NONE, close: true })
  })

  test('priority alone offers nothing here, since this client has no priority control', () => {
    const payload = { write: { state: 'open' }, actions: actions({ setPriority: true }) }

    expect(offered(payload)).toEqual(NONE)
  })

  test('unknown access offers nothing', () => {
    expect(threadActionsView(UNKNOWN_ACCESS)).toEqual(NONE)
    expect(offered({ write: { state: 'open' }, actions: actions({ close: 'yes' }) })).toEqual(NONE)
  })

  test('a missing access field offers nothing', () => {
    expect(threadActionsView(undefined)).toEqual(NONE)
  })
})
