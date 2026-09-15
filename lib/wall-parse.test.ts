import {
  parseNamedWall,
  parseWallAttachment,
  parseWallContributorGrant,
  parseWallLink,
  parseWallPost,
  parseWallPostRemoval,
  parseWallPosts,
} from '@/lib/wall-parse'

const post = {
  id: 'post-1',
  author: { id: 'user-1', name: 'Ada Lovelace' },
  organizationId: 'org-1',
  body: 'The lift is fixed.',
  attachments: [{ type: 'image', url: '/uploads/lift.png', fileName: 'lift.png', size: 2048 }],
  link: { label: 'Read the notice', url: 'https://example.com/notice' },
  reactions: [{ emoji: '🎉', userId: 'user-2' }],
  score: 4,
  upvoteCount: 5,
  isBookmarked: true,
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
      score: 4,
      upvoteCount: 5,
      isBookmarked: true,
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

  it('reads score and upvoteCount, which may be negative and zero respectively', () => {
    const parsed = parseWallPost({ ...post, score: -3, upvoteCount: 0 })
    expect(parsed?.score).toBe(-3)
    expect(parsed?.upvoteCount).toBe(0)
  })

  it('falls back to no vote at all when the API omits or malforms score and upvoteCount', () => {
    const { score: _score, upvoteCount: _upvoteCount, ...rest } = post
    expect(parseWallPost(rest)).toMatchObject({ score: 0, upvoteCount: 0 })
    expect(parseWallPost({ ...post, score: 'a lot', upvoteCount: null })).toMatchObject({
      score: 0,
      upvoteCount: 0,
    })
  })

  it('is not a Message: nothing it reads is a Receipt or a Delivery state', () => {
    const parsed = parseWallPost({ ...post, receiptStatus: 'read', status: 'sent' })
    expect(parsed).not.toHaveProperty('receiptStatus')
    expect(parsed).not.toHaveProperty('status')
  })

  it('reads whether the caller has bookmarked this Post', () => {
    expect(parseWallPost({ ...post, isBookmarked: false })?.isBookmarked).toBe(false)
    expect(parseWallPost({ ...post, isBookmarked: true })?.isBookmarked).toBe(true)
  })

  it('is false for anything but a literal true, rather than dropping the Post', () => {
    const { isBookmarked: _isBookmarked, ...rest } = post
    expect(parseWallPost(rest)?.isBookmarked).toBe(false)
    expect(parseWallPost({ ...post, isBookmarked: 'yes' })?.isBookmarked).toBe(false)
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

describe('parseWallPostRemoval', () => {
  it('reads the id, which is all a soft-removed Post answers with', () => {
    expect(parseWallPostRemoval({ id: 'post-1' })).toEqual({ id: 'post-1' })
  })

  it('is null for anything with nothing to identify the Post by', () => {
    expect(parseWallPostRemoval({})).toBeNull()
    expect(parseWallPostRemoval(null)).toBeNull()
  })
})

const namedWall = {
  id: 'wall-1',
  name: 'Ops watch',
  ownerId: 'user-1',
  organizationIds: ['org-1', 'org-2'],
  createdAt: '2026-09-12T06:28:38.122Z',
  updatedAt: '2026-09-12T06:28:38.122Z',
}

describe('parseNamedWall', () => {
  it('reads a Wall by its id and name, and the organizations this reader may see', () => {
    expect(parseNamedWall(namedWall)).toEqual({
      id: 'wall-1',
      name: 'Ops watch',
      organizationIds: ['org-1', 'org-2'],
    })
  })

  it('reads a Wall narrowed to no organizations at all, rather than refusing it', () => {
    expect(parseNamedWall({ ...namedWall, organizationIds: [] })).toEqual({
      id: 'wall-1',
      name: 'Ops watch',
      organizationIds: [],
    })
  })

  it('falls back to no organizations when the field is missing entirely', () => {
    const { organizationIds: _organizationIds, ...rest } = namedWall
    expect(parseNamedWall(rest)?.organizationIds).toEqual([])
  })

  it.each(['id', 'name'])('refuses a Wall with no %s, because the alternative is inventing one', field => {
    expect(parseNamedWall({ ...namedWall, [field]: undefined })).toBeNull()
  })

  it('does not read ownerId, createdAt, or updatedAt — nothing here offers to manage a Wall', () => {
    const parsed = parseNamedWall(namedWall)
    expect(parsed).not.toHaveProperty('ownerId')
    expect(parsed).not.toHaveProperty('createdAt')
    expect(parsed).not.toHaveProperty('updatedAt')
  })

  it('is null for anything that is not a record', () => {
    expect(parseNamedWall(null)).toBeNull()
    expect(parseNamedWall('wall-1')).toBeNull()
  })
})

describe('parseWallContributorGrant', () => {
  const grant = { userId: 'user-1', organizationId: 'org-1', isContributor: true }

  it('reads a grant', () => {
    expect(parseWallContributorGrant(grant)).toEqual(grant)
  })

  it('is false for anything but a literal true, rather than dropping the row', () => {
    expect(parseWallContributorGrant({ ...grant, isContributor: 'true' })).toEqual({
      ...grant,
      isContributor: false,
    })
    expect(parseWallContributorGrant({ ...grant, isContributor: undefined })).toEqual({
      ...grant,
      isContributor: false,
    })
  })

  it.each(['userId', 'organizationId'])('refuses a grant with no %s', field => {
    expect(parseWallContributorGrant({ ...grant, [field]: undefined })).toBeNull()
  })

  it('is null for anything that is not a record', () => {
    expect(parseWallContributorGrant(null)).toBeNull()
  })
})
