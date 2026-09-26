import { API_BASE_URL } from '@/lib/api-config'
import { clearCsrfPair, setSessionCookie } from '@/lib/api-client'
import {
  addReaction,
  closeConversation,
  createStaffDm,
  engageConversation,
  ensureSupportConversation,
  getConversation,
  listConversations,
  listMessages,
  listMyOrganizations,
  listStaffDirectory,
  markConversationRead,
  registerPushDevice,
  removeReaction,
  sendMessage,
  takeOverConversation,
  uploadAttachment,
} from '@/lib/conversation-api'
import type { AttachmentView } from '@/lib/types'

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
  readKeptPerson: jest.fn(async () => null),
  writeKeptPerson: jest.fn(async () => undefined),
  clearKeptPerson: jest.fn(async () => undefined),
}))

jest.mock('@/lib/legacy-session', () => ({
  purgeMockSession: jest.fn(async () => undefined),
}))

/**
 * The native uploader, which is where a file goes instead of through `fetch` —
 * see `sendFile` in `lib/api-client.ts`. Everything else in this file is real.
 */
type UploadCall = {
  uri: string
  url: string
  options: { headers: Record<string, string>; [key: string]: unknown }
}

const mockUploads: UploadCall[] = []
const mockUploadQueue: ({ status: number; body: string } | Error)[] = []
const uploads = mockUploads

function enqueueUpload(...answers: ({ status: number; body: string } | Error)[]): void {
  mockUploadQueue.push(...answers)
}

/** The upload endpoint answers `201` with the envelope every other route uses. */
function uploadEnvelope(data: unknown, status = 201): { status: number; body: string } {
  return { status, body: JSON.stringify({ statusCode: status, message: 'File uploaded', data }) }
}

jest.mock('expo-file-system', () => ({
  UploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
  File: class {
    uri: string
    constructor(uri: string) {
      this.uri = uri
    }
    async upload(url: string, options: UploadCall['options']) {
      mockUploads.push({ uri: this.uri, url, options })
      const answer = mockUploadQueue.shift()
      if (!answer) throw new Error('no upload answer was queued')
      if (answer instanceof Error) throw answer
      return { status: answer.status, body: answer.body, headers: {} }
    }
  },
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
  mockUploads.length = 0
  mockUploadQueue.length = 0
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

describe('addReaction', () => {
  const REACTED = { ...MESSAGE_ROW, reactions: [{ emoji: '❤️', userId: 'customer-1' }] }

  test('posts the emoji to the message reactions path, with the CSRF pair a mutation needs', async () => {
    enqueue(csrfResponse(), envelope(REACTED))

    const result = await addReaction('conv-1', 'msg-1', '❤️')

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/csrf`)
    expect(calls[1]?.url).toBe(`${API_BASE_URL}/conversations/conv-1/messages/msg-1/reactions`)
    expect(calls[1]?.init.method).toBe('POST')
    expect(calls[1]?.init.body).toBe(JSON.stringify({ emoji: '❤️' }))
    expect((calls[1]?.init.headers as Record<string, string>)['x-csrf-token']).toBe(
      'csrf-token-value',
    )
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        id: 'msg-1',
        reactions: [{ emoji: '❤️', userId: 'customer-1' }],
      }),
    })
  })

  test('escapes the ids rather than letting them shape the path', async () => {
    enqueue(csrfResponse(), envelope(REACTED))

    await addReaction('conv 1/..', 'msg 1/..', '❤️')

    expect(calls[1]?.url).toBe(
      `${API_BASE_URL}/conversations/conv%201%2F../messages/msg%201%2F../reactions`,
    )
  })

  test('reports a request that never landed as unreachable', async () => {
    enqueue(csrfResponse(), new TypeError('Network request failed'))

    expect(await addReaction('conv-1', 'msg-1', '❤️')).toEqual({
      ok: false,
      failure: { kind: 'unreachable' },
    })
  })

  test('repeats what the server said when it refused', async () => {
    enqueue(csrfResponse(), response(403, { statusCode: 403, message: 'You cannot write here' }))

    expect(await addReaction('conv-1', 'msg-1', '❤️')).toEqual({
      ok: false,
      failure: { kind: 'refused', message: 'You cannot write here' },
    })
  })
})

describe('removeReaction', () => {
  test('deletes at the same path, and sends no body', async () => {
    enqueue(csrfResponse(), envelope(MESSAGE_ROW))

    const result = await removeReaction('conv-1', 'msg-1')

    expect(calls[1]?.url).toBe(`${API_BASE_URL}/conversations/conv-1/messages/msg-1/reactions`)
    expect(calls[1]?.init.method).toBe('DELETE')
    expect(calls[1]?.init.body).toBeUndefined()
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ reactions: [] }) })
  })

  test('reports a 401 as an expired session rather than a refusal', async () => {
    enqueue(csrfResponse(), response(401, { statusCode: 401, message: 'Unauthorized' }))

    expect(await removeReaction('conv-1', 'msg-1')).toEqual({
      ok: false,
      failure: { kind: 'unauthorised' },
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

describe('closeConversation', () => {
  test('posts the summary the API requires, with the CSRF pair a mutation needs', async () => {
    enqueue(csrfResponse(), envelope({ ...SUPPORT_ROW, status: 'closed' }))

    const result = await closeConversation('conv-1', 'Reset the password.')

    expect(calls[1]?.url).toBe(`${API_BASE_URL}/conversations/conv-1/close`)
    expect(calls[1]?.init.method).toBe('POST')
    expect(calls[1]?.init.body).toBe(JSON.stringify({ summary: 'Reset the password.' }))
    expect((calls[1]?.init.headers as Record<string, string>)['x-csrf-token']).toBe(
      'csrf-token-value',
    )
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ id: 'conv-1' }) })
  })
})

/**
 * The two assignment actions. One shape, so one table: a POST with no body,
 * carrying the CSRF pair every mutation needs, answering with the conversation
 * as it now stands.
 */
describe.each([
  ['engageConversation', engageConversation, 'engage'] as const,
  ['takeOverConversation', takeOverConversation, 'takeover'] as const,
])('%s', (_name, call, path) => {
  /**
   * A staff row: only a staff payload carries `labels`, and only a staff payload
   * carries the assignment these two actions change.
   */
  const ENGAGED_ROW = {
    ...SUPPORT_ROW,
    status: 'engaged',
    title: null,
    description: null,
    avatarUrl: null,
    customer: { id: 'cust-1', name: 'Luis Ferreira' },
    assignedAgent: { id: 'me', name: 'Jonah Reed' },
    otherUser: null,
    members: [],
    labels: [],
  }

  test(`posts to the conversation ${path} path, with the CSRF pair a mutation needs`, async () => {
    enqueue(csrfResponse(), envelope(ENGAGED_ROW))

    const result = await call('conv-1')

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/csrf`)
    expect(calls[1]?.url).toBe(`${API_BASE_URL}/conversations/conv-1/${path}`)
    expect(calls[1]?.init.method).toBe('POST')
    expect((calls[1]?.init.headers as Record<string, string>)['x-csrf-token']).toBe(
      'csrf-token-value',
    )
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ id: 'conv-1' }) })
  })

  test('sends no body, which is all the endpoint takes', async () => {
    enqueue(csrfResponse(), envelope(ENGAGED_ROW))

    await call('conv-1')

    expect(calls[1]?.init.body).toBeUndefined()
  })

  test('answers with the conversation as it now stands, so the composer can open on it', async () => {
    enqueue(csrfResponse(), envelope(ENGAGED_ROW))

    const result = await call('conv-1')

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        status: 'engaged',
        assignedAgent: expect.objectContaining({ id: 'me', name: 'Jonah Reed' }),
      }),
    })
  })

  test('escapes an id rather than letting it shape the path', async () => {
    enqueue(csrfResponse(), envelope(ENGAGED_ROW))

    await call('conv 1/../secrets')

    expect(calls[1]?.url).toBe(
      `${API_BASE_URL}/conversations/conv%201%2F..%2Fsecrets/${path}`,
    )
  })

  test('reports a request that never arrived as unreachable', async () => {
    enqueue(csrfResponse(), new TypeError('Network request failed'))

    expect(await call('conv-1')).toEqual({ ok: false, failure: { kind: 'unreachable' } })
  })

  test('reports a 401 as an expired session rather than a refusal', async () => {
    enqueue(csrfResponse(), response(401, { statusCode: 401, message: 'Unauthorized' }))

    expect(await call('conv-1')).toEqual({ ok: false, failure: { kind: 'unauthorised' } })
  })
})

describe('the refusals the API answers an assignment with', () => {
  test('somebody reached the thread first', async () => {
    enqueue(
      csrfResponse(),
      response(409, {
        statusCode: 409,
        code: 'already_engaged',
        message: 'This chat is already engaged.',
      }),
    )

    expect(await engageConversation('conv-1')).toEqual({
      ok: false,
      failure: { kind: 'refused', message: 'This chat is already engaged.', code: 'already_engaged' },
    })
  })

  /**
   * Assignment switched off after this session read the switch. The code is
   * what `assignmentRefusal` tells it apart by, so it has to survive the trip.
   */
  test.each([
    ['engageConversation', engageConversation],
    ['takeOverConversation', takeOverConversation],
  ] as const)('%s while assignment is switched off carries the code', async (_name, call) => {
    enqueue(
      csrfResponse(),
      response(409, {
        statusCode: 409,
        code: 'support_assignment_disabled',
        message: 'Assignment is switched off; any staff member can reply.',
      }),
    )

    expect(await call('conv-1')).toEqual({
      ok: false,
      failure: {
        kind: 'refused',
        message: 'Assignment is switched off; any staff member can reply.',
        code: 'support_assignment_disabled',
      },
    })
  })

  /**
   * An Agent's Takeover, which `assertCanTakeOver` refuses before it looks at
   * the thread. The API never offers an Agent this way out (see
   * `lib/conversation-access.ts`), and a 403 is a verdict on the request rather
   * than on the session, so it never signs anybody out.
   */
  test('an Agent asking to take over is forbidden, not signed out', async () => {
    enqueue(
      csrfResponse(),
      response(403, {
        statusCode: 403,
        code: 'forbidden',
        message: "You don't have permission to do that.",
      }),
    )

    expect(await takeOverConversation('conv-1')).toEqual({
      ok: false,
      failure: { kind: 'refused', message: "You don't have permission to do that.", code: 'forbidden' },
    })
  })
})


describe('uploadAttachment', () => {
  const PHOTO: AttachmentView = {
    kind: 'image',
    uri: 'file:///data/user/0/cache/ImagePicker/9a2f.jpeg',
    name: 'IMG_0001.jpg',
    size: 204_800,
  }

  /** What `POST /:id/files` answers with: the object it stored, and nothing else. */
  const STORED = {
    type: 'image/jpeg',
    url: '/uploads/chat/9f1c-4a2b.jpg',
    fileName: '9a2f.jpeg',
    size: 204_800,
  }

  test('uploads the file to the conversation, with the CSRF pair a mutation needs', async () => {
    enqueue(csrfResponse())
    enqueueUpload(uploadEnvelope(STORED))

    const result = await uploadAttachment('conv-1', PHOTO)

    expect(uploads[0]?.url).toBe(`${API_BASE_URL}/conversations/conv-1/files`)
    expect(uploads[0]?.uri).toBe('file:///data/user/0/cache/ImagePicker/9a2f.jpeg')
    expect(uploads[0]?.options.headers['x-csrf-token']).toBe('csrf-token-value')
    expect(result).toEqual({
      ok: true,
      value: {
        type: 'image/jpeg',
        url: '/uploads/chat/9f1c-4a2b.jpg',
        fileName: 'IMG_0001.jpg',
        size: 204_800,
        durationSeconds: null,
        waveform: null,
      },
    })
  })

  test('sends it under the field name and the type the API reads', async () => {
    enqueue(csrfResponse())
    enqueueUpload(uploadEnvelope(STORED))

    await uploadAttachment('conv-1', PHOTO)

    expect(uploads[0]?.options).toMatchObject({ fieldName: 'file', mimeType: 'image/jpeg' })
  })

  /**
   * The API names its objects randomly — an uploaded name is attacker-supplied —
   * and echoes back whatever the multipart part was called, which for a photo is
   * the picker's cache filename and means nothing to anyone.
   */
  test('keeps the name the person chose rather than the one the picker cached it under', async () => {
    enqueue(csrfResponse())
    enqueueUpload(uploadEnvelope(STORED))

    const result = await uploadAttachment('conv-1', { ...PHOTO, name: 'Receipt March.jpg' })

    expect(result).toMatchObject({ ok: true, value: { fileName: 'Receipt March.jpg' } })
  })

  /**
   * The endpoint received a file, so it reports a file. Everything a voice note
   * is beyond its bytes was measured by the recorder, and this is the last thing
   * holding it before the send.
   */
  test('carries the duration and the waveform of a voice note over the round trip', async () => {
    enqueue(csrfResponse())
    enqueueUpload(
      uploadEnvelope({
        type: 'audio/mp4',
        url: '/uploads/chat/v.m4a',
        fileName: 'v.m4a',
        size: 8_000,
      }),
    )

    const result = await uploadAttachment('conv-1', {
      kind: 'audio',
      uri: 'file:///cache/v.m4a',
      name: 'v.m4a',
      size: 8_000,
      durationMs: 4_500,
      peaks: [0.2, 0.8, 0.4],
    })

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ durationSeconds: 4.5, waveform: [0.2, 0.8, 0.4] }),
    })
  })

  test('refuses a type the API does not take, without spending the upload', async () => {
    const result = await uploadAttachment('conv-1', {
      kind: 'image',
      uri: 'file:///logo.svg',
      name: 'logo.svg',
      size: 900,
    })

    expect(uploads).toHaveLength(0)
    expect(calls).toHaveLength(0)
    expect(result).toEqual({
      ok: false,
      failure: { kind: 'refused', message: expect.stringContaining('not allowed') },
    })
  })

  test('a file the API found too large is a refusal worth reading', async () => {
    enqueue(csrfResponse())
    enqueueUpload({
      status: 413,
      body: JSON.stringify({ statusCode: 413, message: 'File too large' }),
    })

    expect(await uploadAttachment('conv-1', PHOTO)).toEqual({
      ok: false,
      failure: { kind: 'refused', message: 'File too large' },
    })
  })

  test('a type the API refuses after all is its refusal, in its own words', async () => {
    enqueue(csrfResponse())
    enqueueUpload({
      status: 415,
      body: JSON.stringify({
        statusCode: 415,
        code: 'unsupported_file_type',
        message: 'File type image/heic is not supported.',
      }),
    })

    expect(await uploadAttachment('conv-1', PHOTO)).toEqual({
      ok: false,
      failure: {
        kind: 'refused',
        message: 'File type image/heic is not supported.',
        code: 'unsupported_file_type',
      },
    })
  })

  test('an upload that never reached the API is unreachable, not a refusal', async () => {
    enqueue(csrfResponse())
    enqueueUpload(new Error('Network request failed'))

    expect(await uploadAttachment('conv-1', PHOTO)).toEqual({
      ok: false,
      failure: { kind: 'unreachable' },
    })
  })

  test('a session the API has stopped accepting is unauthorised, and says so once', async () => {
    enqueue(csrfResponse())
    enqueueUpload({ status: 401, body: JSON.stringify({ statusCode: 401 }) })

    expect(await uploadAttachment('conv-1', PHOTO)).toEqual({
      ok: false,
      failure: { kind: 'unauthorised' },
    })
  })
})

describe('sending a message that carries attachments', () => {
  const STORED_PHOTO = {
    type: 'image/jpeg',
    url: '/uploads/chat/9f1c.jpg',
    fileName: 'IMG_0001.jpg',
    size: 204_800,
    durationSeconds: null,
    waveform: null,
  }

  test('names the uploaded objects and the message type', async () => {
    enqueue(csrfResponse(), envelope({ ...MESSAGE_ROW, id: 'msg-9' }, 201))

    await sendMessage('conv-1', {
      body: 'Here it is',
      messageType: 'media',
      attachments: [STORED_PHOTO],
    })

    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({
      body: 'Here it is',
      messageType: 'media',
      attachments: [
        {
          type: 'image/jpeg',
          url: '/uploads/chat/9f1c.jpg',
          fileName: 'IMG_0001.jpg',
          size: 204_800,
        },
      ],
    })
  })

  /**
   * `body` is `min(1)` where present on the send schema, so an attachment with
   * no caption omits the key rather than sending the empty string the composer
   * held — the refine below it accepts a message that is attachments alone.
   */
  test('omits an empty body rather than sending one the schema refuses', async () => {
    enqueue(csrfResponse(), envelope({ ...MESSAGE_ROW, id: 'msg-10' }, 201))

    await sendMessage('conv-1', { body: '', messageType: 'media', attachments: [STORED_PHOTO] })

    const sent = JSON.parse(String(calls[1]?.init.body))
    expect(sent).not.toHaveProperty('body')
    expect(sent.attachments).toHaveLength(1)
  })

  /**
   * The send schema's attachment fields are `.optional()` where a message's are
   * `.nullable()`, so the null a parsed message carries has to be dropped rather
   * than echoed back.
   */
  test('drops the nulls a parsed attachment carries, which the send schema refuses', async () => {
    enqueue(csrfResponse(), envelope({ ...MESSAGE_ROW, id: 'msg-11' }, 201))

    await sendMessage('conv-1', {
      body: '',
      messageType: 'voice',
      attachments: [
        {
          type: 'audio/mp4',
          url: '/uploads/chat/v.m4a',
          fileName: null,
          size: null,
          durationSeconds: 4.5,
          waveform: [0.2, 0.8],
        },
      ],
    })

    expect(JSON.parse(String(calls[1]?.init.body)).attachments[0]).toEqual({
      type: 'audio/mp4',
      url: '/uploads/chat/v.m4a',
      durationSeconds: 4.5,
      waveform: [0.2, 0.8],
    })
  })

  test('a text message still sends no attachments key at all', async () => {
    enqueue(csrfResponse(), envelope({ ...MESSAGE_ROW, id: 'msg-12' }, 201))

    await sendMessage('conv-1', { body: 'Just words' })

    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({
      body: 'Just words',
      messageType: 'text',
    })
  })
})


describe('registerPushDevice', () => {
  /** What the API answers with: the row it wrote, which no caller here reads. */
  const DEVICE_ROW = {
    publicId: 'device-1',
    token: 'ExponentPushToken[abc]',
    platform: 'android',
    createdAt: '2026-09-06T00:00:00.000Z',
  }

  test('posts the token to the device path, with the CSRF pair a mutation needs', async () => {
    enqueue(csrfResponse(), envelope(DEVICE_ROW, 201))

    const result = await registerPushDevice('ExponentPushToken[abc]', 'android')

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/csrf`)
    expect(calls[1]?.url).toBe(`${API_BASE_URL}/push/devices`)
    expect(calls[1]?.init.method).toBe('POST')
    expect((calls[1]?.init.headers as Record<string, string>)['x-csrf-token']).toBe(
      'csrf-token-value',
    )
    expect(result.ok).toBe(true)
  })

  test('sends the token and the platform, and nothing else the route would refuse', async () => {
    enqueue(csrfResponse(), envelope(DEVICE_ROW, 201))

    await registerPushDevice('ExponentPushToken[abc]', 'android')

    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({
      token: 'ExponentPushToken[abc]',
      platform: 'android',
    })
  })

  test('carries the Session cookie beside the CSRF cookie', async () => {
    enqueue(csrfResponse(), envelope(DEVICE_ROW, 201))

    await registerPushDevice('ExponentPushToken[abc]', 'android')

    expect((calls[1]?.init.headers as Record<string, string>).Cookie).toBe(
      'better-auth.session_token=abc.def; csrf-token=cookie-value',
    )
  })

  test('reports a request that never arrived as unreachable', async () => {
    enqueue(csrfResponse(), new TypeError('Network request failed'))

    expect(await registerPushDevice('ExponentPushToken[abc]', 'android')).toEqual({
      ok: false,
      failure: { kind: 'unreachable' },
    })
  })

  /**
   * An ordinary refusal rather than anything a screen has to handle: a device at
   * the API's ceiling, or a token it will not take, changes nothing about the
   * app.
   */
  test('reports a refusal with what the API said about it', async () => {
    enqueue(
      csrfResponse(),
      response(403, {
        statusCode: 403,
        code: 'push_device_limit_reached',
        message: 'Too many devices are registered.',
      }),
    )

    expect(await registerPushDevice('ExponentPushToken[abc]', 'android')).toEqual({
      ok: false,
      failure: {
        kind: 'refused',
        message: 'Too many devices are registered.',
        code: 'push_device_limit_reached',
      },
    })
  })

  test('reports a session the API stopped accepting as unauthorised', async () => {
    enqueue(csrfResponse(), response(401, { statusCode: 401, message: 'Unauthorized' }))

    expect(await registerPushDevice('ExponentPushToken[abc]', 'android')).toEqual({
      ok: false,
      failure: { kind: 'unauthorised' },
    })
  })
})
