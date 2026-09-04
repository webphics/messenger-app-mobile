import { API_BASE_URL } from '@/lib/api-config'
import { clearCsrfPair, setSessionCookie } from '@/lib/api-client'
import {
  createStaffDm,
  ensureSupportConversation,
  getConversation,
  listConversations,
  listMessages,
  listMyOrganizations,
  listStaffDirectory,
  markConversationRead,
  sendMessage,
} from '@/lib/conversation-api'

/**
 * The two boundaries this file cannot cross under Jest, both reached through
 * `authenticatedRequest`: the Google native module throws at import when there
 * is no native side, and the keychain is where a refused cookie is forgotten.
 * The transport itself is real — this file is about the requests that go out.
 */
jest.mock('@/lib/google-session', () => ({
  requestGoogleIdToken: jest.fn(async () => ({ kind: 'failed' })),
  releaseGoogleSession: jest.fn(async () => undefined),
}))

jest.mock('@/lib/keychain', () => ({
  readSessionCookie: jest.fn(),
  writeSessionCookie: jest.fn(async () => true),
  clearSessionCookie: jest.fn(async () => true),
  clearRetiredCredential: jest.fn(async () => undefined),
}))

jest.mock('@/lib/legacy-session', () => ({
  purgeMockSession: jest.fn(async () => undefined),
}))

type FetchCall = { url: string; init: RequestInit }

const calls: FetchCall[] = []

/** Queued in order, the way `lib/api-client.test.ts` queues them: a mutation costs two requests. */
let queue: (Response | Error)[] = []

function enqueue(...responses: (Response | Error)[]): void {
  queue.push(...responses)
}

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const lookup = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  )
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => lookup.get(name.toLowerCase()) ?? null },
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected end of JSON input')
      return body
    },
  } as unknown as Response
}

function envelope(data: unknown, status = 200): Response {
  return response(status, { statusCode: status, message: 'Success', data })
}

function csrfResponse(token = 'csrf-token-value', cookie = 'cookie-value'): Response {
  return response(
    200,
    { statusCode: 200, message: 'Success', data: token },
    { 'set-cookie': `csrf-token=${cookie}; Path=/; HttpOnly` },
  )
}

const SUPPORT_ROW = {
  id: 'conv-1',
  organizationId: 'org-1',
  type: 'support_dm',
  lastMessageAt: '2026-08-13T08:22:00.000Z',
  lastMessagePreview: 'Checking the mail logs now.',
  lastMessageMine: false,
  lastMessageReceiptStatus: null,
  lastMessageRead: false,
  unreadCount: 2,
}

const MESSAGE_ROW = {
  id: 'msg-1',
  body: 'Hello',
  messageType: 'text',
  createdAt: '2026-08-13T08:00:00.000Z',
  replyTo: null,
  reactions: [],
  attachments: [],
  receiptStatus: 'sent',
  fromCompany: false,
}

beforeEach(() => {
  calls.length = 0
  queue = []
  setSessionCookie('better-auth.session_token=abc.def')
  clearCsrfPair()
  global.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const next = queue.shift()
    if (next instanceof Error) throw next
    return next ?? response(200, {})
  }) as unknown as typeof fetch
})

describe('listConversations', () => {
  test('asks for every conversation and reads the rows', async () => {
    enqueue(envelope([SUPPORT_ROW]))

    const result = await listConversations()

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/conversations`)
    expect(calls[0]?.init.method).toBe('GET')
    expect(result).toEqual({ ok: true, value: [expect.objectContaining({ id: 'conv-1' })] })
  })

  test('carries the Session cookie', async () => {
    enqueue(envelope([]))

    await listConversations()

    expect((calls[0]?.init.headers as Record<string, string>).Cookie).toBe(
      'better-auth.session_token=abc.def',
    )
  })

  test('narrows by type when asked', async () => {
    enqueue(envelope([]))

    await listConversations({ type: 'group' })

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/conversations?type=group`)
  })

  test('reads an empty list as an empty list, not as a failure', async () => {
    enqueue(envelope([]))

    expect(await listConversations()).toEqual({ ok: true, value: [] })
  })

  test('reports a request that never arrived as unreachable', async () => {
    enqueue(new TypeError('Network request failed'))

    expect(await listConversations()).toEqual({ ok: false, failure: { kind: 'unreachable' } })
  })

  test('reports a 401 as an expired session rather than a refusal', async () => {
    enqueue(response(401, { statusCode: 401, message: 'Unauthorized' }))

    expect(await listConversations()).toEqual({ ok: false, failure: { kind: 'unauthorised' } })
  })

  test('repeats what the server said when it refused', async () => {
    enqueue(response(403, { statusCode: 403, message: 'Email not verified.' }))

    expect(await listConversations()).toEqual({
      ok: false,
      failure: { kind: 'refused', message: 'Email not verified.' },
    })
  })

  test('has something to say about a refusal that said nothing', async () => {
    enqueue(response(500, undefined))

    const result = await listConversations()

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.failure.kind).toBe('refused')
  })

  test('reports a body with no envelope as malformed rather than as an empty inbox', async () => {
    enqueue(response(200, [SUPPORT_ROW]))

    expect(await listConversations()).toEqual({ ok: false, failure: { kind: 'malformed' } })
  })
})

describe('getConversation', () => {
  test('asks for one conversation by id', async () => {
    enqueue(envelope(SUPPORT_ROW))

    const result = await getConversation('conv-1')

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/conversations/conv-1`)
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ id: 'conv-1' }) })
  })

  test('reports a row it cannot read as malformed', async () => {
    enqueue(envelope({ id: 'conv-1' }))

    expect(await getConversation('conv-1')).toEqual({
      ok: false,
      failure: { kind: 'malformed' },
    })
  })
})

describe('ensureSupportConversation', () => {
  test('posts the organization, with the CSRF pair a mutation needs', async () => {
    enqueue(csrfResponse(), envelope(SUPPORT_ROW))

    const result = await ensureSupportConversation('org-1')

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/csrf`)
    expect(calls[1]?.url).toBe(`${API_BASE_URL}/conversations/support`)
    expect(calls[1]?.init.method).toBe('POST')
    expect(calls[1]?.init.body).toBe(JSON.stringify({ organizationId: 'org-1' }))
    expect((calls[1]?.init.headers as Record<string, string>)['x-csrf-token']).toBe(
      'csrf-token-value',
    )
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ id: 'conv-1' }) })
  })

  test('reads the existing conversation the API answers with on a repeat call', async () => {
    enqueue(csrfResponse(), envelope(SUPPORT_ROW))
    enqueue(envelope(SUPPORT_ROW))

    await ensureSupportConversation('org-1')
    const second = await ensureSupportConversation('org-1')

    expect(second).toEqual({ ok: true, value: expect.objectContaining({ id: 'conv-1' }) })
  })
})

describe('listMessages', () => {
  test('asks for the newest page, capped at the API limit', async () => {
    enqueue(envelope([MESSAGE_ROW]))

    const result = await listMessages('conv-1')

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/conversations/conv-1/messages?limit=50`)
    expect(result).toEqual({ ok: true, value: [expect.objectContaining({ id: 'msg-1' })] })
  })

  test('pages backwards from the oldest message held', async () => {
    enqueue(envelope([]))

    await listMessages('conv-1', { cursor: 'msg-9', limit: 20 })

    expect(calls[0]?.url).toBe(
      `${API_BASE_URL}/conversations/conv-1/messages?cursor=msg-9&limit=20`,
    )
  })

  test('escapes an id rather than letting it shape the path', async () => {
    enqueue(envelope([]))

    await listMessages('conv 1/../secrets')

    expect(calls[0]?.url).toBe(
      `${API_BASE_URL}/conversations/conv%201%2F..%2Fsecrets/messages?limit=50`,
    )
  })

  test('reads an empty page as the end of the thread rather than a failure', async () => {
    enqueue(envelope([]))

    expect(await listMessages('conv-1', { cursor: 'msg-1' })).toEqual({ ok: true, value: [] })
  })
})

describe('listMyOrganizations', () => {
  test('reads the rows the memberships endpoint wraps them in', async () => {
    enqueue(envelope({ rows: [{ id: 'org-1', name: 'Talo' }] }))

    const result = await listMyOrganizations()

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/memberships/mine`)
    expect(result).toEqual({ ok: true, value: [{ id: 'org-1', name: 'Talo' }] })
  })

  test('reads no memberships as an empty list', async () => {
    enqueue(envelope({ rows: [] }))

    expect(await listMyOrganizations()).toEqual({ ok: true, value: [] })
  })
})

describe('sendMessage', () => {
  const SENT_ROW = {
    ...MESSAGE_ROW,
    id: 'msg-2',
    body: 'Is my payout on the way?',
    createdAt: '2026-08-13T08:05:00.000Z',
  }

  test('posts the body to the thread, with the CSRF pair a mutation needs', async () => {
    enqueue(csrfResponse(), envelope(SENT_ROW, 201))

    const result = await sendMessage('conv-1', { body: 'Is my payout on the way?' })

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/csrf`)
    expect(calls[1]?.url).toBe(`${API_BASE_URL}/conversations/conv-1/messages`)
    expect(calls[1]?.init.method).toBe('POST')
    expect(calls[1]?.init.body).toBe(
      JSON.stringify({ body: 'Is my payout on the way?', messageType: 'text' }),
    )
    expect((calls[1]?.init.headers as Record<string, string>)['x-csrf-token']).toBe(
      'csrf-token-value',
    )
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ id: 'msg-2' }) })
  })

  test('carries the Session cookie beside the CSRF cookie', async () => {
    enqueue(csrfResponse(), envelope(SENT_ROW, 201))

    await sendMessage('conv-1', { body: 'Hello' })

    expect((calls[1]?.init.headers as Record<string, string>).Cookie).toBe(
      'better-auth.session_token=abc.def; csrf-token=cookie-value',
    )
  })

  test('names the message being answered when the send is a reply', async () => {
    enqueue(csrfResponse(), envelope(SENT_ROW, 201))

    await sendMessage('conv-1', { body: 'Thanks', replyToMessageId: 'msg-1' })

    expect(calls[1]?.init.body).toBe(
      JSON.stringify({ body: 'Thanks', messageType: 'text', replyToMessageId: 'msg-1' }),
    )
  })

  test('omits the reply key rather than sending it empty, which the strict schema refuses', async () => {
    enqueue(csrfResponse(), envelope(SENT_ROW, 201))

    await sendMessage('conv-1', { body: 'Hello' })

    expect(JSON.parse(String(calls[1]?.init.body))).not.toHaveProperty('replyToMessageId')
  })

  test('escapes an id rather than letting it shape the path', async () => {
    enqueue(csrfResponse(), envelope(SENT_ROW, 201))

    await sendMessage('conv 1/../secrets', { body: 'Hello' })

    expect(calls[1]?.url).toBe(
      `${API_BASE_URL}/conversations/conv%201%2F..%2Fsecrets/messages`,
    )
  })

  test('reports a send that never arrived as unreachable', async () => {
    enqueue(csrfResponse(), new TypeError('Network request failed'))

    expect(await sendMessage('conv-1', { body: 'Hello' })).toEqual({
      ok: false,
      failure: { kind: 'unreachable' },
    })
  })

  test('reports a 401 as an expired session rather than a refusal', async () => {
    enqueue(csrfResponse(), response(401, { statusCode: 401, message: 'Unauthorized' }))

    expect(await sendMessage('conv-1', { body: 'Hello' })).toEqual({
      ok: false,
      failure: { kind: 'unauthorised' },
    })
  })

  test('repeats what the server said when it refused the message', async () => {
    enqueue(
      csrfResponse(),
      response(400, { statusCode: 400, message: 'Body or attachments are required' }),
    )

    expect(await sendMessage('conv-1', { body: '' })).toEqual({
      ok: false,
      failure: { kind: 'refused', message: 'Body or attachments are required' },
    })
  })

  test('reports an answer it cannot read as malformed rather than as a message', async () => {
    enqueue(csrfResponse(), envelope({ id: 'msg-2' }, 201))

    expect(await sendMessage('conv-1', { body: 'Hello' })).toEqual({
      ok: false,
      failure: { kind: 'malformed' },
    })
  })

  test('sends the message once more with a fresh token when the guard refused the first', async () => {
    enqueue(
      csrfResponse(),
      response(403, { statusCode: 403, code: 'csrf_invalid', message: 'Invalid CSRF token.' }),
      csrfResponse('second-token', 'second-cookie'),
      envelope(SENT_ROW, 201),
    )

    const result = await sendMessage('conv-1', { body: 'Hello' })

    expect(calls).toHaveLength(4)
    expect((calls[3]?.init.headers as Record<string, string>)['x-csrf-token']).toBe(
      'second-token',
    )
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ id: 'msg-2' }) })
  })
})

describe('markConversationRead', () => {
  const READ_ROW = { ...SUPPORT_ROW, lastMessageRead: true, unreadCount: null }

  test('posts to the conversation read path, with the CSRF pair a mutation needs', async () => {
    enqueue(csrfResponse(), envelope(READ_ROW))

    const result = await markConversationRead('conv-1')

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/csrf`)
    expect(calls[1]?.url).toBe(`${API_BASE_URL}/conversations/conv-1/read`)
    expect(calls[1]?.init.method).toBe('POST')
    expect((calls[1]?.init.headers as Record<string, string>)['x-csrf-token']).toBe(
      'csrf-token-value',
    )
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ id: 'conv-1' }) })
  })

  test('sends no body, which is all the endpoint takes', async () => {
    enqueue(csrfResponse(), envelope(READ_ROW))

    await markConversationRead('conv-1')

    expect(calls[1]?.init.body).toBeUndefined()
  })

  test('carries the Session cookie beside the CSRF cookie', async () => {
    enqueue(csrfResponse(), envelope(READ_ROW))

    await markConversationRead('conv-1')

    expect((calls[1]?.init.headers as Record<string, string>).Cookie).toBe(
      'better-auth.session_token=abc.def; csrf-token=cookie-value',
    )
  })

  test('escapes an id rather than letting it shape the path', async () => {
    enqueue(csrfResponse(), envelope(READ_ROW))

    await markConversationRead('conv 1/../secrets')

    expect(calls[1]?.url).toBe(`${API_BASE_URL}/conversations/conv%201%2F..%2Fsecrets/read`)
  })

  test('reports a request that never arrived as unreachable', async () => {
    enqueue(csrfResponse(), new TypeError('Network request failed'))

    expect(await markConversationRead('conv-1')).toEqual({
      ok: false,
      failure: { kind: 'unreachable' },
    })
  })

  test('reports a 401 as an expired session rather than a refusal', async () => {
    enqueue(csrfResponse(), response(401, { statusCode: 401, message: 'Unauthorized' }))

    expect(await markConversationRead('conv-1')).toEqual({
      ok: false,
      failure: { kind: 'unauthorised' },
    })
  })

  test('repeats what the server said when it refused', async () => {
    enqueue(csrfResponse(), response(404, { statusCode: 404, message: 'Conversation not found' }))

    expect(await markConversationRead('missing')).toEqual({
      ok: false,
      failure: { kind: 'refused', message: 'Conversation not found' },
    })
  })
})

describe('listStaffDirectory', () => {
  const DIRECTORY_ROW = {
    id: 'agent-1',
    name: 'Jonah Reed',
    role: 'agent',
    isOnline: true,
    lastOnlineAt: null,
    sharedOrganizations: [{ id: 'org-1', name: 'Talo' }],
  }

  test('reads the directory', async () => {
    enqueue(envelope([DIRECTORY_ROW]))

    const result = await listStaffDirectory()

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/conversations/staff`)
    expect(calls[0]?.init.method ?? 'GET').toBe('GET')
    expect(result).toEqual({
      ok: true,
      value: [expect.objectContaining({ id: 'agent-1', role: 'agent' })],
    })
  })

  test('an empty directory is an answer, not a failure', async () => {
    enqueue(envelope([]))

    expect(await listStaffDirectory()).toEqual({ ok: true, value: [] })
  })

  test('a 403 for a Customer is a refusal worth repeating', async () => {
    enqueue(response(403, { statusCode: 403, message: 'Staff only.' }))

    expect(await listStaffDirectory()).toEqual({
      ok: false,
      failure: { kind: 'refused', message: 'Staff only.' },
    })
  })

  test('reports a body that is not an envelope as malformed', async () => {
    enqueue(response(200, [DIRECTORY_ROW]))

    expect(await listStaffDirectory()).toEqual({ ok: false, failure: { kind: 'malformed' } })
  })
})

describe('createStaffDm', () => {
  const STAFF_DM_ROW = {
    ...SUPPORT_ROW,
    id: 'conv-dm',
    type: 'staff_dm',
    status: null,
    title: null,
    description: null,
    avatarUrl: null,
    customer: null,
    assignedAgent: null,
    otherUser: { id: 'agent-2', name: 'Priya Raman', role: 'agent' },
    members: [],
    labels: [],
  }

  test('posts the person, with the CSRF pair a mutation needs', async () => {
    enqueue(csrfResponse(), envelope(STAFF_DM_ROW))

    const result = await createStaffDm('agent-2')

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/csrf`)
    expect(calls[1]?.url).toBe(`${API_BASE_URL}/conversations/staff`)
    expect(calls[1]?.init.method).toBe('POST')
    expect(calls[1]?.init.body).toBe(JSON.stringify({ userId: 'agent-2' }))
    expect((calls[1]?.init.headers as Record<string, string>)['x-csrf-token']).toBe(
      'csrf-token-value',
    )
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ id: 'conv-dm' }) })
  })

  test('names the organization when one was picked, and omits the key otherwise', async () => {
    enqueue(csrfResponse(), envelope(STAFF_DM_ROW))

    await createStaffDm('agent-2', 'org-1')

    expect(calls[1]?.init.body).toBe(
      JSON.stringify({ userId: 'agent-2', organizationId: 'org-1' }),
    )
  })

  test('repeats the refusal when the pair shares no organization', async () => {
    enqueue(
      csrfResponse(),
      response(422, {
        statusCode: 422,
        message: 'You and this person do not share an organization.',
      }),
    )

    expect(await createStaffDm('agent-2')).toEqual({
      ok: false,
      failure: {
        kind: 'refused',
        message: 'You and this person do not share an organization.',
      },
    })
  })
})
