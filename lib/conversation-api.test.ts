import { API_BASE_URL } from '@/lib/api-config'
import { clearCsrfPair, setSessionCookie } from '@/lib/api-client'
import {
  addReaction,
  closeConversation,
  createNote,
  createStaffDm,
  deleteNote,
  engageConversation,
  getConversation,
  listConversations,
  listMessages,
  listMyOrganizations,
  sendMessage,
  takeOverConversation,
  updateNote,
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
  test('asks for every conversation, carries the Session cookie, and reads the rows', async () => {
    enqueue(envelope([SUPPORT_ROW]))

    const result = await listConversations()

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/conversations`)
    expect((calls[0]?.init.headers as Record<string, string>).Cookie).toBe(
      'better-auth.session_token=abc.def',
    )
    expect(result).toEqual({ ok: true, value: [expect.objectContaining({ id: 'conv-1' })] })
  })

  test('narrows by type when asked', async () => {
    enqueue(envelope([]))

    await listConversations({ type: 'group' })

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/conversations?type=group`)
  })
})

describe('getConversation', () => {
  test('reports a row it cannot read as malformed', async () => {
    enqueue(envelope({ id: 'conv-1' }))

    expect(await getConversation('conv-1')).toEqual({
      ok: false,
      failure: { kind: 'malformed' },
    })
  })
})

describe('listMessages', () => {
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
})

describe('listMyOrganizations', () => {
  test('reads the rows the memberships endpoint wraps them in', async () => {
    enqueue(envelope({ rows: [{ id: 'org-1', name: 'Talo' }] }))

    expect(await listMyOrganizations()).toEqual({ ok: true, value: [{ id: 'org-1', name: 'Talo' }] })
  })
})

describe('sendMessage', () => {
  const SENT_ROW = {
    ...MESSAGE_ROW,
    id: 'msg-2',
    body: 'Is my payout on the way?',
    createdAt: '2026-08-13T08:05:00.000Z',
  }

  test('posts the body to the thread, with the CSRF pair and the Session cookie a mutation needs', async () => {
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
    expect((calls[1]?.init.headers as Record<string, string>).Cookie).toBe(
      'better-auth.session_token=abc.def; csrf-token=cookie-value',
    )
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ id: 'msg-2' }) })
  })

  test('omits the reply key rather than sending it empty, which the strict schema refuses', async () => {
    enqueue(csrfResponse(), envelope(SENT_ROW, 201))

    await sendMessage('conv-1', { body: 'Hello' })

    expect(JSON.parse(String(calls[1]?.init.body))).not.toHaveProperty('replyToMessageId')
  })

  test('reports an answer it cannot read as malformed rather than as a message', async () => {
    enqueue(csrfResponse(), envelope({ id: 'msg-2' }, 201))

    expect(await sendMessage('conv-1', { body: 'Hello' })).toEqual({
      ok: false,
      failure: { kind: 'malformed' },
    })
  })
})

describe('addReaction', () => {
  test('posts the emoji to the message reactions path, escaping both ids', async () => {
    enqueue(csrfResponse(), envelope({ ...MESSAGE_ROW, reactions: [{ emoji: '❤️', userId: 'customer-1' }] }))

    await addReaction('conv 1/..', 'msg 1/..', '❤️')

    expect(calls[1]?.url).toBe(
      `${API_BASE_URL}/conversations/conv%201%2F../messages/msg%201%2F../reactions`,
    )
    expect(calls[1]?.init.body).toBe(JSON.stringify({ emoji: '❤️' }))
  })
})

describe('createStaffDm', () => {
  test('names the organization when one was picked, and omits the key otherwise', async () => {
    enqueue(csrfResponse(), envelope({ ...SUPPORT_ROW, type: 'staff_dm', title: null, members: [], labels: [] }))
    enqueue(csrfResponse(), envelope({ ...SUPPORT_ROW, type: 'staff_dm', title: null, members: [], labels: [] }))

    await createStaffDm('agent-2')
    await createStaffDm('agent-2', 'org-1')

    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({ userId: 'agent-2' })
    expect(JSON.parse(String(calls[calls.length - 1]?.init.body))).toEqual({
      userId: 'agent-2',
      organizationId: 'org-1',
    })
  })
})

describe('notes', () => {
  const NOTE_ROW = {
    id: 'note-1',
    text: 'Refund approved',
    author: { id: 'agent-1', name: 'Rizwan Manzoor' },
    messageId: 'msg-1',
    editedAt: null,
    deletedAt: null,
    deletedBy: null,
    access: { edit: true, delete: true },
    createdAt: '2026-11-06T04:00:00.000Z',
  }

  /** The request that carried the write, not the CSRF pre-flight before it. */
  const write = () => calls.filter((call) => call.init?.method && call.init.method !== 'GET').at(-1)

  test.each<[string, string | undefined, Record<string, unknown>]>([
    ['about the conversation, with no messageId key', undefined, { text: 'Refund approved' }],
    ['about one message', 'msg-1', { text: 'Refund approved', messageId: 'msg-1' }],
  ])('createNote posts %s', async (_label, messageId, body) => {
    enqueue(csrfResponse(), envelope(NOTE_ROW, 201))

    const result = await createNote('conv-1', 'Refund approved', messageId)

    expect(write()?.url).toBe(`${API_BASE_URL}/conversations/conv-1/notes`)
    expect(JSON.parse(String(write()?.init.body))).toEqual(body)
    expect(result.ok && result.value.messageId).toBe('msg-1')
  })

  test('updateNote patches the text on the note path, escaping both ids', async () => {
    enqueue(csrfResponse(), envelope({ ...NOTE_ROW, text: 'Refund sent', editedAt: '2026-11-06T05:00:00.000Z' }))

    const result = await updateNote('conv 1', 'note/1', 'Refund sent')

    expect(write()?.init.method).toBe('PATCH')
    expect(write()?.url).toBe(`${API_BASE_URL}/conversations/conv%201/notes/note%2F1`)
    expect(JSON.parse(String(write()?.init.body))).toEqual({ text: 'Refund sent' })
    expect(result.ok && result.value.editedAt).toBe('2026-11-06T05:00:00.000Z')
  })

  test('deleteNote answers with the tombstone', async () => {
    enqueue(
      csrfResponse(),
      envelope({
        ...NOTE_ROW,
        deletedAt: '2026-11-06T05:00:00.000Z',
        deletedBy: { id: 'admin-1', name: 'Tajbin Khan' },
        access: { edit: false, delete: false },
      }),
    )

    const result = await deleteNote('conv-1', 'note-1')

    expect(write()?.init.method).toBe('DELETE')
    expect(write()?.url).toBe(`${API_BASE_URL}/conversations/conv-1/notes/note-1`)
    expect(result.ok && result.value.deletedBy).toEqual({ id: 'admin-1', name: 'Tajbin Khan' })
  })

  test('a refusal comes back as one, with its code', async () => {
    enqueue(csrfResponse(), response(409, { statusCode: 409, message: 'This note was deleted.', code: 'note_deleted' }))

    const result = await updateNote('conv-1', 'note-1', 'x')

    expect(result).toEqual({
      ok: false,
      failure: expect.objectContaining({ kind: 'refused', message: 'This note was deleted.' }),
    })
  })
})

describe('closeConversation', () => {
  test('posts the summary the API requires', async () => {
    enqueue(csrfResponse(), envelope({ ...SUPPORT_ROW, status: 'closed' }))

    await closeConversation('conv-1', 'Reset the password.')

    expect(calls[1]?.url).toBe(`${API_BASE_URL}/conversations/conv-1/close`)
    expect(calls[1]?.init.body).toBe(JSON.stringify({ summary: 'Reset the password.' }))
  })
})

/**
 * The two assignment actions. One shape, so one table: a POST with no body,
 * answering with the conversation as it now stands.
 */
describe.each([
  ['engageConversation', engageConversation, 'engage'] as const,
  ['takeOverConversation', takeOverConversation, 'takeover'] as const,
])('%s', (_name, call, path) => {
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

  test(`posts to the conversation ${path} path with no body, and answers with the conversation as it now stands`, async () => {
    enqueue(csrfResponse(), envelope(ENGAGED_ROW))

    const result = await call('conv-1')

    expect(calls[1]?.url).toBe(`${API_BASE_URL}/conversations/conv-1/${path}`)
    expect(calls[1]?.init.body).toBeUndefined()
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        status: 'engaged',
        assignedAgent: expect.objectContaining({ id: 'me', name: 'Jonah Reed' }),
      }),
    })
  })

  /**
   * Assignment switched off after this session read the switch. The code is
   * what `assignmentRefusal` tells it apart by, so it has to survive the trip.
   */
  test('a refusal while assignment is switched off carries the code', async () => {
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
})

describe('an Agent asking to take over', () => {
  // A 403 is a verdict on the request rather than on the session, so it never signs anybody out.
  test('is forbidden, not signed out', async () => {
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
    expect(uploads[0]?.options.headers['x-csrf-token']).toBe('csrf-token-value')
    expect(uploads[0]?.options).toMatchObject({ fieldName: 'file', mimeType: 'image/jpeg' })
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
})
