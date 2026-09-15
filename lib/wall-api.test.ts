import { API_BASE_URL } from '@/lib/api-config'
import { clearCsrfPair, setSessionCookie } from '@/lib/api-client'
import { reactToWallPost, removeWallPost, updateWallPost } from '@/lib/wall-api'

/**
 * The two boundaries this file cannot cross under Jest, mirroring
 * `conversation-api.test.ts`: the Google native module throws at import when
 * there is no native side, and the keychain is where a refused cookie is
 * forgotten. The transport itself is real — this file is about the requests
 * that go out for the three write routes #75 adds.
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

type FetchCall = { url: string; init: RequestInit }

const calls: FetchCall[] = []

/** Queued in order: a mutation costs two requests, the CSRF pre-flight and the write. */
let queue: (Response | Error)[] = []

function enqueue(...responses: (Response | Error)[]): void {
  queue.push(...responses)
}

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const lookup = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))
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

const POST_ROW = {
  id: 'post-1',
  author: { id: 'user-1', name: 'Ada' },
  organizationId: 'org-1',
  body: 'The lift is fixed.',
  attachments: [],
  link: null,
  reactions: [{ emoji: '👍', userId: 'user-1' }],
  editedAt: null,
  createdAt: '2026-09-14T10:00:00.000Z',
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

describe('reactToWallPost', () => {
  test('posts the emoji to the reactions path, with the CSRF pair a mutation needs', async () => {
    enqueue(csrfResponse(), envelope(POST_ROW))

    const result = await reactToWallPost('post-1', '👍')

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/csrf`)
    expect(calls[1]?.url).toBe(`${API_BASE_URL}/wall/posts/post-1/reactions`)
    expect(calls[1]?.init.method).toBe('POST')
    expect(calls[1]?.init.body).toBe(JSON.stringify({ emoji: '👍' }))
    expect((calls[1]?.init.headers as Record<string, string>)['x-csrf-token']).toBe(
      'csrf-token-value',
    )
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ id: 'post-1' }) })
  })

  test('escapes the id rather than letting it shape the path', async () => {
    enqueue(csrfResponse(), envelope(POST_ROW))
    await reactToWallPost('post 1', '👍')
    expect(calls[1]?.url).toBe(`${API_BASE_URL}/wall/posts/post%201/reactions`)
  })
})

describe('updateWallPost', () => {
  test('PATCHes only the fields it was given', async () => {
    enqueue(csrfResponse(), envelope({ ...POST_ROW, body: 'The lift is fixed now.' }))

    const result = await updateWallPost('post-1', { body: 'The lift is fixed now.' })

    expect(calls[1]?.url).toBe(`${API_BASE_URL}/wall/posts/post-1`)
    expect(calls[1]?.init.method).toBe('PATCH')
    expect(calls[1]?.init.body).toBe(JSON.stringify({ body: 'The lift is fixed now.' }))
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ body: 'The lift is fixed now.' }),
    })
  })

  test('sends an explicit null to remove the link, never omitting the field for that', async () => {
    enqueue(csrfResponse(), envelope({ ...POST_ROW, link: null }))

    await updateWallPost('post-1', { link: null })

    expect(calls[1]?.init.body).toBe(JSON.stringify({ link: null }))
  })

  test('a refusal is read back as one, not thrown', async () => {
    enqueue(
      csrfResponse(),
      response(403, { statusCode: 403, message: 'Only the author may edit this post.' }),
    )

    const result = await updateWallPost('post-1', { body: 'Not mine to edit.' })

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'refused', message: 'Only the author may edit this post.' },
    })
  })
})

describe('removeWallPost', () => {
  test('DELETEs the Post and reads back only its id', async () => {
    enqueue(csrfResponse(), envelope({ id: 'post-1' }))

    const result = await removeWallPost('post-1')

    expect(calls[1]?.url).toBe(`${API_BASE_URL}/wall/posts/post-1`)
    expect(calls[1]?.init.method).toBe('DELETE')
    expect(result).toEqual({ ok: true, value: { id: 'post-1' } })
  })
})
