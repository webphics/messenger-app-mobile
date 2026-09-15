import { API_BASE_URL } from '@/lib/api-config'
import { clearCsrfPair, setSessionCookie } from '@/lib/api-client'
import {
  createWallPost,
  getNamedWall,
  getWallContributorGrant,
  listWallBookmarks,
  listWallPosts,
  reactToWallPost,
  recordWallPostView,
  removeWallPost,
  searchWallPosts,
  toggleWallPostBookmark,
  updateWallPost,
  uploadWallFile,
  voteOnWallPost,
} from '@/lib/wall-api'
import type { AttachmentView } from '@/lib/types'

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

/**
 * The native uploader, exactly as `conversation-api.test.ts` mocks it —
 * `uploadWallFile` goes through the same `sendFile` in `lib/api-client.ts`.
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

describe('recordWallPostView', () => {
  test('posts to the view path with no body, and the CSRF pair a mutation needs', async () => {
    enqueue(csrfResponse(), envelope({ ...POST_ROW, viewCount: 1 }, 201))

    const result = await recordWallPostView('post-1')

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/csrf`)
    expect(calls[1]?.url).toBe(`${API_BASE_URL}/wall/posts/post-1/view`)
    expect(calls[1]?.init.method).toBe('POST')
    expect(calls[1]?.init.body).toBeUndefined()
    expect((calls[1]?.init.headers as Record<string, string>)['x-csrf-token']).toBe(
      'csrf-token-value',
    )
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ viewCount: 1 }) })
  })

  test('escapes the id rather than letting it shape the path', async () => {
    enqueue(csrfResponse(), envelope(POST_ROW, 201))
    await recordWallPostView('post 1')
    expect(calls[1]?.url).toBe(`${API_BASE_URL}/wall/posts/post%201/view`)
  })

  test('a refusal is read back as one, not thrown', async () => {
    enqueue(csrfResponse(), response(404, { statusCode: 404, message: 'Post not found' }))

    const result = await recordWallPostView('post-1')

    expect(result).toEqual({ ok: false, failure: { kind: 'refused', message: 'Post not found' } })
  })
})

describe('toggleWallPostBookmark', () => {
  test('posts to the bookmark path, with the CSRF pair a mutation needs', async () => {
    enqueue(csrfResponse(), envelope({ ...POST_ROW, isBookmarked: true }))

    const result = await toggleWallPostBookmark('post-1')

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/csrf`)
    expect(calls[1]?.url).toBe(`${API_BASE_URL}/wall/posts/post-1/bookmark`)
    expect(calls[1]?.init.method).toBe('POST')
    expect((calls[1]?.init.headers as Record<string, string>)['x-csrf-token']).toBe(
      'csrf-token-value',
    )
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ id: 'post-1', isBookmarked: true }),
    })
  })

  test('escapes the id rather than letting it shape the path', async () => {
    enqueue(csrfResponse(), envelope(POST_ROW))
    await toggleWallPostBookmark('post 1')
    expect(calls[1]?.url).toBe(`${API_BASE_URL}/wall/posts/post%201/bookmark`)
  })

  test('a refusal is read back as one, not thrown', async () => {
    enqueue(csrfResponse(), response(404, { statusCode: 404, message: 'Post not found' }))

    const result = await toggleWallPostBookmark('post-1')

    expect(result).toEqual({ ok: false, failure: { kind: 'refused', message: 'Post not found' } })
  })
})

describe('listWallBookmarks', () => {
  test('reads the Saved view with no cursor at all on the first page', async () => {
    enqueue(envelope([{ ...POST_ROW, isBookmarked: true }]))

    await listWallBookmarks()

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/wall/posts/bookmarks?limit=20`)
    expect(calls[0]?.init.method ?? 'GET').toBe('GET')
  })

  test('carries the cursor for a page further back', async () => {
    enqueue(envelope([]))

    await listWallBookmarks({ cursor: 'post-9' })

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/wall/posts/bookmarks?cursor=post-9&limit=20`)
  })

  test('every Post it reads back is bookmarked, by construction of the endpoint', async () => {
    enqueue(envelope([{ ...POST_ROW, isBookmarked: true }]))

    const result = await listWallBookmarks()

    expect(result).toEqual({
      ok: true,
      value: [expect.objectContaining({ isBookmarked: true })],
    })
  })

  test('an empty Saved view is an empty page, not a refusal', async () => {
    enqueue(envelope([]))

    const result = await listWallBookmarks()

    expect(result).toEqual({ ok: true, value: [] })
  })
})

describe('voteOnWallPost', () => {
  test('posts the direction to the vote path, with the CSRF pair a mutation needs', async () => {
    enqueue(csrfResponse(), envelope({ ...POST_ROW, score: 1, upvoteCount: 1 }))

    const result = await voteOnWallPost('post-1', 'up')

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/csrf`)
    expect(calls[1]?.url).toBe(`${API_BASE_URL}/wall/posts/post-1/vote`)
    expect(calls[1]?.init.method).toBe('POST')
    expect(calls[1]?.init.body).toBe(JSON.stringify({ direction: 'up' }))
    expect((calls[1]?.init.headers as Record<string, string>)['x-csrf-token']).toBe(
      'csrf-token-value',
    )
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ score: 1, upvoteCount: 1 }),
    })
  })

  test('escapes the id rather than letting it shape the path', async () => {
    enqueue(csrfResponse(), envelope(POST_ROW))
    await voteOnWallPost('post 1', 'down')
    expect(calls[1]?.url).toBe(`${API_BASE_URL}/wall/posts/post%201/vote`)
  })

  test('a refusal is read back as one, not thrown', async () => {
    enqueue(csrfResponse(), response(404, { statusCode: 404, message: 'Post not found' }))

    const result = await voteOnWallPost('post-1', 'up')

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'refused', message: 'Post not found' },
    })
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

describe('listWallPosts', () => {
  test('reads the default Wall with no wall parameter at all', async () => {
    enqueue(envelope([POST_ROW]))

    await listWallPosts()

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/wall/posts?limit=20`)
  })

  test('names a Wall to read through it instead', async () => {
    enqueue(envelope([POST_ROW]))

    await listWallPosts({ wall: 'wall-1' })

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/wall/posts?wall=wall-1&limit=20`)
  })

  test('a Wall naming no organizations this reader is in comes back as an empty page, not a refusal', async () => {
    enqueue(envelope([]))

    const result = await listWallPosts({ wall: 'wall-1' })

    expect(result).toEqual({ ok: true, value: [] })
  })

  test('a Wall that does not exist is a plain refusal', async () => {
    enqueue(response(404, { statusCode: 404, code: 'wall_not_found', message: 'Wall not found' }))

    const result = await listWallPosts({ wall: 'missing-wall' })

    expect(result).toEqual({ ok: false, failure: { kind: 'refused', message: 'Wall not found' } })
  })

  test('recent is left off the request entirely, byte-identical to no sort at all', async () => {
    enqueue(envelope([POST_ROW]))

    await listWallPosts({ sort: 'recent' })

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/wall/posts?limit=20`)
  })

  test('popular is the one value that reaches the request', async () => {
    enqueue(envelope([POST_ROW]))

    await listWallPosts({ sort: 'popular' })

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/wall/posts?sort=popular&limit=20`)
  })

  test('sort and a named Wall combine, sort read first', async () => {
    enqueue(envelope([POST_ROW]))

    await listWallPosts({ wall: 'wall-1', sort: 'popular', cursor: 'post-9' })

    expect(calls[0]?.url).toBe(
      `${API_BASE_URL}/wall/posts?wall=wall-1&sort=popular&cursor=post-9&limit=20`,
    )
  })
})

describe('searchWallPosts', () => {
  test('reads the search route with the term, over the default Wall', async () => {
    enqueue(envelope([POST_ROW]))

    await searchWallPosts({ q: 'lift' })

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/wall/posts/search?q=lift&limit=20`)
  })

  test('names a Wall to search within it instead', async () => {
    enqueue(envelope([POST_ROW]))

    await searchWallPosts({ q: 'lift', wall: 'wall-1' })

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/wall/posts/search?q=lift&wall=wall-1&limit=20`)
  })

  test('pages a result exactly like a Wall, the cursor read last', async () => {
    enqueue(envelope([POST_ROW]))

    await searchWallPosts({ q: 'lift', cursor: 'post-9' })

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/wall/posts/search?q=lift&cursor=post-9&limit=20`)
  })

  test('a term naming nothing this reader can see comes back as an empty page, not a refusal', async () => {
    enqueue(envelope([]))

    const result = await searchWallPosts({ q: 'nothing-like-this' })

    expect(result).toEqual({ ok: true, value: [] })
  })
})

const WALL_ROW = {
  id: 'wall-1',
  name: 'Ops watch',
  ownerId: 'user-1',
  organizationIds: ['org-1'],
  createdAt: '2026-09-12T06:28:38.122Z',
  updatedAt: '2026-09-12T06:28:38.122Z',
}

describe('getNamedWall', () => {
  test('reads one Wall by id', async () => {
    enqueue(envelope(WALL_ROW))

    const result = await getNamedWall('wall-1')

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/wall/walls/wall-1`)
    expect(calls[0]?.init.method ?? 'GET').toBe('GET')
    expect(result).toEqual({
      ok: true,
      value: { id: 'wall-1', name: 'Ops watch', organizationIds: ['org-1'] },
    })
  })

  test('escapes the id rather than letting it shape the path', async () => {
    enqueue(envelope(WALL_ROW))
    await getNamedWall('wall 1')
    expect(calls[0]?.url).toBe(`${API_BASE_URL}/wall/walls/wall%201`)
  })

  test('a deleted or never-existing Wall is a plain refusal, not a thrown error', async () => {
    enqueue(response(404, { statusCode: 404, code: 'wall_not_found', message: 'Wall not found' }))

    const result = await getNamedWall('gone')

    expect(result).toEqual({ ok: false, failure: { kind: 'refused', message: 'Wall not found' } })
  })
})

describe('createWallPost', () => {
  test('posts the organization, body and link, with the CSRF pair a mutation needs', async () => {
    enqueue(csrfResponse(), envelope(POST_ROW))

    const result = await createWallPost({
      organizationId: 'org-1',
      body: 'The lift is fixed.',
      link: { label: 'Read more', url: 'https://x.test' },
    })

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/csrf`)
    expect(calls[1]?.url).toBe(`${API_BASE_URL}/wall/posts`)
    expect(calls[1]?.init.method).toBe('POST')
    expect(JSON.parse(calls[1]?.init.body as string)).toEqual({
      organizationId: 'org-1',
      body: 'The lift is fixed.',
      link: { label: 'Read more', url: 'https://x.test' },
    })
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ id: 'post-1' }) })
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

  test('omits an empty body, link or attachment list rather than sending them empty', async () => {
    enqueue(csrfResponse(), envelope(POST_ROW))

    await createWallPost({ organizationId: 'org-1' })

    expect(JSON.parse(calls[1]?.init.body as string)).toEqual({ organizationId: 'org-1' })
  })

  test('a missing-image refusal is read back as one, not thrown', async () => {
    enqueue(
      csrfResponse(),
      response(422, { statusCode: 422, message: 'A post needs at least one image.' }),
    )

    const result = await createWallPost({ organizationId: 'org-1', body: 'Text only.' })

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'refused', message: 'A post needs at least one image.' },
    })
  })
})

describe('uploadWallFile', () => {
  const PHOTO: AttachmentView = {
    kind: 'image',
    uri: 'file:///data/user/0/cache/ImagePicker/9a2f.jpeg',
    name: 'IMG_0001.jpg',
    size: 204_800,
  }

  const STORED = {
    type: 'image',
    url: '/uploads/wall/9f1c-4a2b.jpg',
    fileName: '9a2f.jpeg',
    size: 204_800,
  }

  test('uploads to the organization the Post is going to, with the CSRF pair a mutation needs', async () => {
    enqueue(csrfResponse())
    enqueueUpload(uploadEnvelope(STORED))

    const result = await uploadWallFile('org-1', PHOTO)

    expect(uploads[0]?.url).toBe(`${API_BASE_URL}/wall/organizations/org-1/files`)
    expect(uploads[0]?.uri).toBe('file:///data/user/0/cache/ImagePicker/9a2f.jpeg')
    expect(uploads[0]?.options.headers['x-csrf-token']).toBe('csrf-token-value')
    expect(result).toEqual({
      ok: true,
      value: { kind: 'image', url: '/uploads/wall/9f1c-4a2b.jpg', fileName: '9a2f.jpeg', size: 204_800 },
    })
  })

  test('escapes the organization id rather than letting it shape the path', async () => {
    enqueue(csrfResponse())
    enqueueUpload(uploadEnvelope(STORED))
    await uploadWallFile('org 1', PHOTO)
    expect(uploads[0]?.url).toBe(`${API_BASE_URL}/wall/organizations/org%201/files`)
  })

  test('refuses a type the API does not take, without spending the upload', async () => {
    const result = await uploadWallFile('org-1', {
      kind: 'image',
      uri: 'file:///logo.svg',
      name: 'logo.svg',
      size: 900,
    })

    expect(uploads).toHaveLength(0)
    expect(result).toEqual({
      ok: false,
      failure: { kind: 'refused', message: expect.stringContaining('not allowed') },
    })
  })
})

describe('getWallContributorGrant', () => {
  test('reads back a grant for one organization and this caller', async () => {
    enqueue(envelope({ userId: 'user-1', organizationId: 'org-1', isContributor: true }))

    const result = await getWallContributorGrant('org-1', 'user-1')

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/wall-contributors/org-1/user-1`)
    expect(result).toEqual({
      ok: true,
      value: { userId: 'user-1', organizationId: 'org-1', isContributor: true },
    })
  })

  test('an Admin-only refusal — asking about oneself — is read back as one, not thrown', async () => {
    enqueue(response(403, { statusCode: 403, message: 'Admins only.' }))

    const result = await getWallContributorGrant('org-1', 'user-1')

    expect(result).toEqual({ ok: false, failure: { kind: 'refused', message: 'Admins only.' } })
  })
})
