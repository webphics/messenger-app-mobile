import { parseMessage } from '@/lib/conversation-parse'
import { draftMessage } from '@/lib/thread-state'
import {
  parseMessageWallPost,
  wallPostReferenceFromPost,
  wallPostReferenceText,
} from '@/lib/message-wall-post'
import type { MessageWallPost, WallPost } from '@/lib/types'

const payload = {
  id: '4f3b2c1d-8e7a-4b6c-9d5e-1a2b3c4d5e6f',
  organizationId: '0b7d3c2e-5a4f-4e1d-9c8b-7a6f5e4d3c2b',
  kind: 'promotion',
  authorName: 'Acme Support',
  title: '20% off annual plans',
  excerpt: 'Upgrade before the end of the month.',
  imageUrl: '/uploads/wall/annual.webp',
  postedAt: '2026-10-06T08:00:00.000Z',
}

function post(overrides: Partial<WallPost> = {}): WallPost {
  return {
    id: 'post-1',
    author: { id: 'company:org-1', name: 'Acme Support' },
    organizationId: 'org-1',
    kind: 'news',
    title: 'Launch day',
    body: 'We are live.',
    endsAt: null,
    pinnedAt: null,
    attachments: [],
    link: null,
    reactions: [],
    score: 0,
    upvoteCount: 0,
    viewCount: 0,
    isBookmarked: false,
    editedAt: null,
    createdAt: '2026-10-06T08:00:00.000Z',
    ...overrides,
  }
}

function reference(overrides: Partial<MessageWallPost> = {}): MessageWallPost {
  return {
    id: 'post-1',
    organizationId: 'org-1',
    kind: 'news',
    authorName: 'Acme Support',
    title: null,
    excerpt: null,
    imageUrl: null,
    postedAt: '2026-10-06T08:00:00.000Z',
    ...overrides,
  }
}

describe('parseMessageWallPost', () => {
  it('reads a reference whole', () => {
    expect(parseMessageWallPost(payload)).toEqual({ ...payload, kind: 'promotion' })
  })

  it('reads the optional fields as null when the API sent null', () => {
    expect(
      parseMessageWallPost({ ...payload, title: null, excerpt: null, imageUrl: null }),
    ).toMatchObject({ title: null, excerpt: null, imageUrl: null })
  })

  it.each([
    ['no id', { ...payload, id: undefined }],
    ['no organization', { ...payload, organizationId: '' }],
    ['no publish time', { ...payload, postedAt: null }],
  ])('is null with %s, since it could not be opened', (_, value) => {
    expect(parseMessageWallPost(value)).toBeNull()
  })

  it.each([null, undefined, 'post-1', 42, []])('is null for %p', (value) => {
    expect(parseMessageWallPost(value)).toBeNull()
  })

  it('reads a kind this build does not know as community', () => {
    expect(parseMessageWallPost({ ...payload, kind: 'raffle' })?.kind).toBe('community')
  })

  it('names a missing author generically rather than dropping the card', () => {
    expect(parseMessageWallPost({ ...payload, authorName: '' })?.authorName).toBe('Someone')
  })
})

describe('wallPostReferenceFromPost', () => {
  it("keeps the Post's id, organization, kind, author and publish time", () => {
    expect(wallPostReferenceFromPost(post())).toEqual({
      id: 'post-1',
      organizationId: 'org-1',
      kind: 'news',
      authorName: 'Acme Support',
      title: 'Launch day',
      excerpt: 'We are live.',
      imageUrl: null,
      postedAt: '2026-10-06T08:00:00.000Z',
    })
  })

  it('takes the first image, skipping a video or document before it', () => {
    const result = wallPostReferenceFromPost(
      post({
        attachments: [
          { kind: 'video', url: '/uploads/wall/a.mp4', fileName: null, size: null },
          { kind: 'image', url: '/uploads/wall/b.webp', fileName: null, size: null },
          { kind: 'image', url: '/uploads/wall/c.webp', fileName: null, size: null },
        ],
      }),
    )
    expect(result.imageUrl).toBe('/uploads/wall/b.webp')
  })

  it("cuts a long body to the API's excerpt length", () => {
    expect(wallPostReferenceFromPost(post({ body: 'x'.repeat(500) })).excerpt).toHaveLength(200)
  })

  it('reads a blank title and body as absent', () => {
    const result = wallPostReferenceFromPost(post({ title: '  ', body: ' ' }))
    expect(result.title).toBeNull()
    expect(result.excerpt).toBeNull()
  })
})

describe('wallPostReferenceText', () => {
  it('leads with the title and follows with the excerpt', () => {
    expect(wallPostReferenceText(reference({ title: 'Launch day', excerpt: 'We are live.' }))).toEqual(
      { headline: 'Launch day', detail: 'We are live.' },
    )
  })

  it('leads with the excerpt alone when there is no title', () => {
    expect(wallPostReferenceText(reference({ excerpt: 'We are live.' }))).toEqual({
      headline: 'We are live.',
      detail: null,
    })
  })

  it('names the author when the Post has neither title nor body', () => {
    expect(wallPostReferenceText(reference({ title: ' ', excerpt: '' }))).toEqual({
      headline: 'Post by Acme Support',
      detail: null,
    })
  })
})

describe('a message carrying a Post', () => {
  const message = {
    id: 'msg-1',
    body: '',
    messageType: 'text',
    createdAt: '2026-10-08T10:12:44.120Z',
    editedAt: null,
    editableUntil: null,
    replyTo: null,
    reactions: [],
    attachments: [],
    receiptStatus: 'sent',
    fromCompany: false,
  }

  it('is read with its Post, and with no body of its own', () => {
    const parsed = parseMessage({ ...message, wallPost: payload })
    expect(parsed?.wallPost).toEqual(parseMessageWallPost(payload))
    expect(parsed?.body).toBe('')
  })

  it('leaves the key off a message that carries no Post', () => {
    expect(parseMessage({ ...message, body: 'Hi', wallPost: null })).not.toHaveProperty('wallPost')
    expect(parseMessage({ ...message, body: 'Hi' })).not.toHaveProperty('wallPost')
  })

  it('puts the Post on the bubble a send draws before the API answers', () => {
    const wallPost = reference({ title: 'Launch day' })
    const drawn = draftMessage({
      id: 'local-1',
      body: '',
      author: { id: 'customer-1', name: 'QA', role: 'customer' },
      wallPost,
    })
    expect(drawn.wallPost).toEqual(wallPost)
  })

  it('draws no Post on a send that has none', () => {
    const drawn = draftMessage({
      id: 'local-1',
      body: 'Hi',
      author: { id: 'customer-1', name: 'QA', role: 'customer' },
    })
    expect(drawn).not.toHaveProperty('wallPost')
  })
})
