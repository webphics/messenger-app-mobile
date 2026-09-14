import { parseWallAttachment, parseWallLink, parseWallPost, parseWallPosts } from '@/lib/wall-parse'

const post = {
  id: 'post-1',
  author: { id: 'user-1', name: 'Ada Lovelace' },
  organizationId: 'org-1',
  body: 'The lift is fixed.',
  attachments: [{ type: 'image', url: '/uploads/lift.png', fileName: 'lift.png', size: 2048 }],
  link: { label: 'Read the notice', url: 'https://example.com/notice' },
  reactions: [{ emoji: '🎉', userId: 'user-2' }],
  editedAt: null,
  createdAt: '2026-09-14T10:00:00.000Z',
}

describe('parseWallPost', () => {
  it('reads a Post whole', () => {
    expect(parseWallPost(post)).toEqual({
      id: 'post-1',
      author: { id: 'user-1', name: 'Ada Lovelace' },
      organizationId: 'org-1',
      body: 'The lift is fixed.',
      attachments: [{ kind: 'image', url: '/uploads/lift.png', fileName: 'lift.png', size: 2048 }],
      link: { label: 'Read the notice', url: 'https://example.com/notice' },
      reactions: [{ emoji: '🎉', userId: 'user-2' }],
      editedAt: null,
      createdAt: '2026-09-14T10:00:00.000Z',
    })
  })

  it.each(['id', 'author', 'organizationId', 'createdAt'])(
    'refuses a Post with no %s, because the alternative is inventing one',
    field => {
      expect(parseWallPost({ ...post, [field]: undefined })).toBeNull()
    },
  )

  it('keeps a Post whose body is absent — a Post leads with an image, not with text', () => {
    expect(parseWallPost({ ...post, body: null })?.body).toBeNull()
  })

  it('names an author the API did not', () => {
    expect(parseWallPost({ ...post, author: { id: 'user-1' } })?.author.name).toBe('Someone')
  })

  it('carries the edit stamp, so a card can say a Post was changed', () => {
    const edited = parseWallPost({ ...post, editedAt: '2026-09-14T11:00:00.000Z' })
    expect(edited?.editedAt).toBe('2026-09-14T11:00:00.000Z')
  })

  it('is not a Message: nothing it reads is a Receipt or a Delivery state', () => {
    const parsed = parseWallPost({ ...post, receiptStatus: 'read', status: 'sent' })
    expect(parsed).not.toHaveProperty('receiptStatus')
    expect(parsed).not.toHaveProperty('status')
  })
})

describe('parseWallAttachment', () => {
  it.each(['image', 'video', 'document'])('reads a %s', type => {
    expect(parseWallAttachment({ type, url: '/uploads/a' })).toEqual({
      kind: type,
      url: '/uploads/a',
      fileName: null,
      size: null,
    })
  })

  it('drops a kind this build does not know rather than drawing it as an image', () => {
    expect(parseWallAttachment({ type: 'hologram', url: '/uploads/a' })).toBeNull()
  })

  it('drops one with nowhere to fetch from', () => {
    expect(parseWallAttachment({ type: 'image', url: '' })).toBeNull()
  })
})

describe('parseWallLink', () => {
  it('needs both halves: a label to press and somewhere to go', () => {
    expect(parseWallLink({ label: 'Read it', url: '' })).toBeNull()
    expect(parseWallLink({ url: 'https://example.com' })).toBeNull()
  })
})

describe('parseWallPosts', () => {
  it('drops the row it could not read, never the page', () => {
    expect(parseWallPosts([post, { id: 'post-2' }])).toHaveLength(1)
  })

  it('reads an empty Wall as an empty page rather than as a broken one', () => {
    expect(parseWallPosts([])).toEqual([])
  })

  it('is malformed when the payload is not a list at all', () => {
    expect(parseWallPosts({ posts: [] })).toBeNull()
  })
})
