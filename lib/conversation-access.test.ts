import {
  composerView,
  detailsView,
  messageActions,
  messageNoteOffered,
  parseAccess,
  refusalMeansStale,
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
    manageLabels: false,
    readNotes: false,
    writeNotes: false,
    setWritePolicy: false,
    setJoinPolicy: false,
    deleteMessages: false,
    deleteConversation: false,
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

  test('reads the thread actions the API offers', () => {
    const offered = {
      ...actions(),
      editMessages: true,
      transfer: true,
      close: true,
      setPriority: true,
      manageLabels: true,
      readNotes: true,
      setJoinPolicy: true,
      deleteMessages: true,
    }

    expect(parseAccess({ write: { state: 'open' }, actions: offered })).toEqual({
      write: { state: 'open' },
      actions: offered,
    })
  })

  test('reads the same thing twice, so a row the Store wrote reads back as it was written', () => {
    const once = parseAccess(readOnlyPayload({ reason: 'must_engage', wayOut: 'engage' }))

    expect(parseAccess(JSON.parse(JSON.stringify(once)))).toEqual(once)
  })

  /*
   * Story 33: an older build keeps working after the API adds a reason or a
   * way out. A reason it cannot word is still read-only, in general words, and
   * a way out it cannot wire is no way out. Only a broken shape is unknown.
   */
  test('reads a reason it does not know as read-only for a reason it does not name', () => {
    expect(parseAccess(readOnlyPayload({ reason: 'must_wait', wayOut: 'engage' }))).toEqual({
      write: { state: 'read_only', reason: 'unrecognised', holder: null, wayOut: 'engage' },
      actions: actions(),
    })
  })

  test('reads a way out it does not know as no way out', () => {
    expect(parseAccess(readOnlyPayload({ reason: 'must_engage', wayOut: 'claim' }))).toEqual({
      write: { state: 'read_only', reason: 'must_engage', holder: null, wayOut: null },
      actions: actions(),
    })
  })

  /*
   * Unknown is what a row restored from a Store written before `access` existed
   * reads as. Guessing at a reason would offer somebody a composer or a button
   * the API may refuse.
   */
  test.each([
    ['a missing field', undefined],
    ['a write state it does not know', { write: { state: 'maybe' }, actions: actions({ editMessages: true }) }],
    ['a read-only write with no reason', { write: { state: 'read_only' }, actions: actions() }],
    ['no actions', { write: { state: 'open' } }],
    ...malformedActions('editMessages').slice(1, 3),
  ])('reads %s as unknown', (_case, payload) => {
    expect(parseAccess(payload)).toEqual({ kind: 'unknown' })
  })
})

describe('composerView', () => {
  test('an open write opens the composer', () => {
    expect(composerFor(openPayload())).toEqual({ kind: 'open' })
  })

  test('an Agent on an Unassigned Support DM is offered Engage', () => {
    expect(composerFor(readOnlyPayload({ reason: 'must_engage', wayOut: 'engage' }))).toMatchObject({
      kind: 'read-only',
      wayOut: { wayOut: 'engage' },
    })
  })

  test('an Agent on a Support DM another agent holds is offered nothing', () => {
    expect(composerFor(readOnlyPayload({ reason: 'already_engaged', holder: PRIYA }))).toMatchObject({
      kind: 'read-only',
      wayOut: null,
    })
  })

  test('a closed Support DM offers Reopen to somebody the API lets reopen it', () => {
    expect(composerFor(readOnlyPayload({ reason: 'conversation_closed', wayOut: 'reopen' }))).toMatchObject({
      kind: 'read-only',
      wayOut: { wayOut: 'reopen' },
    })
  })

  test('a reason this build does not know is still read-only, and keeps the way out', () => {
    expect(composerFor(readOnlyPayload({ reason: 'must_wait', wayOut: 'reopen' }))).toMatchObject({
      kind: 'read-only',
      wayOut: { wayOut: 'reopen' },
    })
  })

  test('unknown access is read-only, with no way out', () => {
    expect(composerView(UNKNOWN_ACCESS)).toMatchObject({ kind: 'read-only', wayOut: null })
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

  test('does not offer Edit at exactly the end of the window', () => {
    expect(offersEdit(openPayload(), {}, Date.parse(UNTIL))).toBe(false)
  })

  /* The Customer in a closed Support DM: still open to write, and not to edit. */
  test('does not offer Edit when editing is off, even with an open composer', () => {
    expect(offersEdit({ write: { state: 'open' }, actions: actions() })).toBe(false)
  })

  test('does not offer Edit while the access is unknown', () => {
    expect(messageActions(undefined, message(), NOW)).toEqual({ edit: false, delete: false })
  })

  test('does not offer Edit on a window end it cannot read', () => {
    expect(offersEdit(openPayload(), { editableUntil: 'soon' })).toBe(false)
  })

  /** Delete, read the way the thread screen reads it. */
  function offersDelete(deleteMessages: boolean, overrides: Partial<Message> = {}) {
    const payload = { write: { state: 'open' }, actions: actions({ deleteMessages }) }
    return messageActions(parseAccess(payload), message(overrides), NOW).delete
  }

  /*
   * The role and Capability cases arrive already folded into `deletable` by the
   * API: an Admin with `delete_messages` gets it on anybody's message, an Agent
   * with only `delete_own_messages` on their own, a Customer on nothing.
   */
  test.each([
    ['a deletable message where the conversation offers delete', true, { deletable: true }, true],
    ["somebody else's message after its edit window, still deletable", true, { deletable: true, editableUntil: null }, true],
    ["a message the API did not mark deletable (an Agent on somebody else's)", true, {}, false],
    ['a message marked not deletable', true, { deletable: false }, false],
    ['a deletable message where the conversation turns delete off', false, { deletable: true }, false],
    ['a System notice, even one marked deletable', true, { deletable: true, messageType: 'system' as const }, false],
    ['a message this device is still carrying', true, { deletable: true, id: 'local-1' }, false],
  ])('%s', (_, deleteMessages, overrides, offered) => {
    expect(offersDelete(deleteMessages, overrides as Partial<Message>)).toBe(offered)
  })

  test('offers Delete and Edit independently', () => {
    const payload = { write: { state: 'open' }, actions: actions({ editMessages: true, deleteMessages: true }) }
    expect(messageActions(parseAccess(payload), message({ deletable: true }), NOW)).toEqual({
      edit: true,
      delete: true,
    })
  })

  test('does not offer Delete while the access is unknown', () => {
    expect(messageActions(UNKNOWN_ACCESS, message({ deletable: true }), NOW).delete).toBe(false)
  })
})

describe('messageNoteOffered', () => {
  const message = (id = 'msg-1') =>
    ({ id, body: 'hello', messageType: 'text', createdAt: '2026-09-26T11:55:00.000Z', editedAt: null,
       editableUntil: null, replyTo: null, reactions: [], attachments: [], receiptStatus: 'sent',
       fromCompany: false }) as unknown as Message

  test.each<[string, unknown, boolean]>([
    ['a Support DM offering writeNotes', { write: { state: 'open' }, actions: actions({ readNotes: true, writeNotes: true }) }, true],
    ['notes readable and not writable', { write: { state: 'open' }, actions: actions({ readNotes: true }) }, false],
    ['an org DM, a Group or a Customer (no writeNotes)', openPayload(), false],
    ['writeNotes on a read-only thread', { ...readOnlyPayload({ reason: 'must_engage', wayOut: 'engage' }), actions: actions({ writeNotes: true }) }, true],
  ])('%s → %s', (_label, payload, offered) => {
    expect(messageNoteOffered(parseAccess(payload), message())).toBe(offered)
  })

  test('not on a message that has not reached the API', () => {
    const payload = { write: { state: 'open' }, actions: actions({ writeNotes: true }) }
    expect(messageNoteOffered(parseAccess(payload), message('local-123'))).toBe(false)
  })

  test('not while the access is unknown or absent', () => {
    expect(messageNoteOffered(UNKNOWN_ACCESS, message())).toBe(false)
    expect(messageNoteOffered(undefined, message())).toBe(false)
  })
})

describe('threadActionsView', () => {
  /** What the details screen offers for a payload, read the way the screen reads it. */
  function offered(payload: unknown) {
    return threadActionsView(parseAccess(payload))
  }

  const NONE = { engage: false, takeOver: false, transfer: false, close: false, reopen: false }

  test('an Agent holding a Support DM, with both Capabilities, is offered Transfer and Close', () => {
    const payload = {
      write: { state: 'open' },
      actions: actions({ editMessages: true, transfer: true, close: true, setPriority: true }),
    }

    expect(offered(payload)).toEqual({ ...NONE, transfer: true, close: true })
  })

  test('an Agent on an Unassigned Support DM is offered Engage', () => {
    const payload = readOnlyPayload({ reason: 'must_engage', wayOut: 'engage' })
    payload.actions = actions({ engage: true, setPriority: true })

    expect(offered(payload)).toEqual({ ...NONE, engage: true })
  })

  test('an Admin on a Support DM another agent holds is offered Take over, and not Close or Transfer', () => {
    const payload = readOnlyPayload({ reason: 'must_take_over', holder: PRIYA, wayOut: 'take_over' })
    payload.actions = actions({ takeOver: true, setPriority: true })

    expect(offered(payload)).toEqual({ ...NONE, takeOver: true })
  })

  test('priority alone offers nothing here, since this client has no priority control', () => {
    const payload = { write: { state: 'open' }, actions: actions({ setPriority: true }) }

    expect(offered(payload)).toEqual(NONE)
  })

  test('unknown or missing access offers nothing', () => {
    expect(threadActionsView(UNKNOWN_ACCESS)).toEqual(NONE)
    expect(threadActionsView(undefined)).toEqual(NONE)
  })
})

describe('detailsView', () => {
  /** What Conversation details offers for a payload, read the way the screen reads it. */
  function offered(payload: unknown) {
    return detailsView(parseAccess(payload))
  }

  const NONE = { labels: false, readNotes: false, writeNotes: false }

  test('an Agent with the label Capability on a Support DM they can see is offered labels and notes', () => {
    const payload = {
      write: { state: 'open' },
      actions: actions({ editMessages: true, manageLabels: true, readNotes: true, writeNotes: true }),
    }

    expect(offered(payload)).toEqual({ labels: true, readNotes: true, writeNotes: true })
  })

  test('notes the API lets a viewer read and not write are shown without the field', () => {
    const payload = { write: { state: 'open' }, actions: actions({ readNotes: true }) }

    expect(offered(payload)).toEqual({ ...NONE, readNotes: true })
  })

  /* This client has no Group policy or delete control, so those actions offer nothing here. */
  test('policy and delete actions alone offer nothing on details', () => {
    const payload = {
      write: { state: 'open' },
      actions: actions({
        setWritePolicy: true,
        setJoinPolicy: true,
        deleteMessages: true,
        deleteConversation: true,
      }),
    }

    expect(offered(payload)).toEqual(NONE)
  })

  test('unknown or missing access offers nothing', () => {
    expect(detailsView(UNKNOWN_ACCESS)).toEqual(NONE)
    expect(detailsView(undefined)).toEqual(NONE)
  })
})

describe('refusalMeansStale', () => {
  function refusedWith(code?: string) {
    return { kind: 'refused' as const, message: 'Refused.', ...(code ? { code } : {}) }
  }

  test('a write refused with must_engage means the copy is stale', () => {
    expect(refusalMeansStale(refusedWith('must_engage'))).toBe(true)
  })

  /*
   * The two codes the API's rulings answer the common races with: a Close or
   * Transfer after somebody else took or closed the thread is a 404, and a
   * Take over on a thread the viewer already holds is `forbidden`.
   */
  test.each(['conversation_not_found', 'forbidden'])(
    'a write refused with %s means the copy is stale, since it is how the API answers a lost race',
    (code) => {
      expect(refusalMeansStale(refusedWith(code))).toBe(true)
    },
  )

  /* What a refused delete leads to: a refetch of the conversation, or nothing. */
  test.each([
    ['message_not_deletable', true],
    ['missing_capability', true],
    ['forbidden', true],
    ['conversation_not_found', true],
    ['message_not_found', false],
  ])('a delete refused with %s refetches: %s', (code, stale) => {
    expect(refusalMeansStale(refusedWith(code))).toBe(stale)
  })

  test('a refusal about the request, a lost thread or a code named like an object property is not stale', () => {
    expect(refusalMeansStale(refusedWith('validation_failed'))).toBe(false)
    expect(refusalMeansStale(refusedWith('conversation_reassigned'))).toBe(false)
    expect(refusalMeansStale(refusedWith('constructor'))).toBe(false)
  })

  test('a failure that is not a refusal is not a stale copy', () => {
    expect(refusalMeansStale({ kind: 'unreachable' })).toBe(false)
    expect(refusalMeansStale({ kind: 'unauthorised' })).toBe(false)
  })
})
