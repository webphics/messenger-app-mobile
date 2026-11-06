import {
  parseWallAttachment,
  parseWallContributorGrant,
  parseWallPost,
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
  viewCount: 12,
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
      kind: 'community',
      title: null,
      endsAt: null,
      pinnedAt: null,
      body: 'The lift is fixed.',
      attachments: [{ kind: 'image', url: '/uploads/lift.png', fileName: 'lift.png', size: 2048 }],
      link: { label: 'Read the notice', url: 'https://example.com/notice' },
      reactions: [{ emoji: '🎉', userId: 'user-2' }],
      score: 4,
      upvoteCount: 5,
      viewCount: 12,
      isBookmarked: true,
      editedAt: null,
      createdAt: '2026-09-14T10:00:00.000Z',
    })
  })

  it.each(['id', 'author'])(
    'refuses a Post with no %s, because the alternative is inventing one',
    field => {
      expect(parseWallPost({ ...post, [field]: undefined })).toBeNull()
    },
  )

  it('is false for anything but a literal true, rather than dropping the Post', () => {
    expect(parseWallPost({ ...post, isBookmarked: 'yes' })?.isBookmarked).toBe(false)
  })

  it('reads a kind this build does not know as community rather than refusing', () => {
    expect(parseWallPost({ ...post, kind: 'townhall' })?.kind).toBe('community')
  })
})

describe('parseWallPosts', () => {
  it('drops the row it could not read, never the page', () => {
    expect(parseWallPosts([post, { id: 'post-2' }])).toHaveLength(1)
  })

  it('is malformed when the payload is not a list at all', () => {
    expect(parseWallPosts({ posts: [] })).toBeNull()
  })
})

describe('parseWallAttachment', () => {
  it('drops a kind this build does not know rather than drawing it as an image', () => {
    expect(parseWallAttachment({ type: 'hologram', url: '/uploads/a' })).toBeNull()
  })

  it('drops a URL that names a file on this device rather than one the API stores', () => {
    expect(parseWallAttachment({ type: 'document', url: 'file:///data/a.db' })).toBeNull()
    expect(parseWallAttachment({ type: 'image', url: 'content://media/42' })).toBeNull()
    expect(parseWallAttachment({ type: 'image', url: '/uploads/wall/a.png' })?.url).toBe(
      '/uploads/wall/a.png',
    )
  })
})

describe('parseWallContributorGrant', () => {
  it('is false for anything but a literal true, rather than dropping the row', () => {
    const grant = { userId: 'user-1', organizationId: 'org-1' }
    expect(parseWallContributorGrant({ ...grant, isContributor: 'true' })).toEqual({
      ...grant,
      isContributor: false,
    })
  })
})
