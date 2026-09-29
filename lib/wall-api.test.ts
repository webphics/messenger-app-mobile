import { API_BASE_URL } from '@/lib/api-config'
import { clearCsrfPair, setSessionCookie } from '@/lib/api-client'
import {
  createWallPost,
  listWallPosts,
  reactToWallPost,
  updateWallPost,
  uploadWallFile,
} from '@/lib/wall-api'

/**
 * The two boundaries this file cannot cross under Jest, mirroring
 * `conversation-api.test.ts`: the Google native module throws at import when
 * there is no native side, and the keychain is where a refused cookie is
 * forgotten. The transport itself is real.
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

const mockUploads: unknown[] = []

jest.mock('expo-file-system', () => ({
  UploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
  File: class {
    async upload(...args: unknown[]) {
      mockUploads.push(args)
      throw new Error('no upload expected')
    }
  },
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
  score: 0,
  upvoteCount: 0,
  isBookmarked: false,
  editedAt: null,
  createdAt: '2026-09-14T10:00:00.000Z',
}

beforeEach(() => {
  calls.length = 0
  queue = []
  mockUploads.length = 0
  setSessionCookie('better-auth.session_token=abc.def')
  clearCsrfPair()
  global.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const next = queue.shift()
    if (next instanceof Error) throw next
    return next ?? response(200, {})
  }) as unknown as typeof fetch
})

describe('a Wall write', () => {
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

  test('sends an explicit null to remove the link, never omitting the field for that', async () => {
    enqueue(csrfResponse(), envelope({ ...POST_ROW, link: null }))

    await updateWallPost('post-1', { link: null })

    expect(calls[1]?.init.body).toBe(JSON.stringify({ link: null }))
  })

  test('omits an empty body, link or attachment list rather than sending them empty', async () => {
    // `CreateWallPostSchema` is strict: an explicit null is a refusal where an
    // absent key is the default.
    enqueue(csrfResponse(), envelope(POST_ROW))

    await createWallPost({ organizationId: 'org-1' })

    expect(JSON.parse(calls[1]?.init.body as string)).toEqual({ organizationId: 'org-1' })
  })

  test('sends every staged attachment, kind translated back to the wire field', async () => {
    enqueue(csrfResponse(), envelope(POST_ROW))

    await createWallPost({
      organizationId: 'org-1',
      attachments: [
        { kind: 'image', url: '/uploads/wall/a.jpg', fileName: 'a.jpg', size: 900 },
        { kind: 'video', url: '/uploads/wall/b.mp4', fileName: null, size: null },
      ],
    })

    expect(JSON.parse(calls[1]?.init.body as string)).toEqual({
      organizationId: 'org-1',
      attachments: [
        { type: 'image', url: '/uploads/wall/a.jpg', fileName: 'a.jpg', size: 900 },
        { type: 'video', url: '/uploads/wall/b.mp4' },
      ],
    })
  })

  test('refuses a type the API does not take, without spending the upload', async () => {
    const result = await uploadWallFile('org-1', {
      kind: 'image',
      uri: 'file:///logo.svg',
      name: 'logo.svg',
      size: 900,
    })

    expect(mockUploads).toHaveLength(0)
    expect(result).toEqual({
      ok: false,
      failure: { kind: 'refused', message: expect.stringContaining('not allowed') },
    })
  })
})

describe('a Wall read', () => {
  test('reads the default Wall with no wall parameter, and recent is left off the request', async () => {
    enqueue(envelope([POST_ROW]), envelope([POST_ROW]))

    await listWallPosts()
    await listWallPosts({ sort: 'recent' })

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/wall/posts?limit=20`)
    expect(calls[1]?.url).toBe(`${API_BASE_URL}/wall/posts?limit=20`)
  })

  test('popular is the one sort value that reaches the request', async () => {
    enqueue(envelope([POST_ROW]))

    await listWallPosts({ sort: 'popular' })

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/wall/posts?sort=popular&limit=20`)
  })
})
