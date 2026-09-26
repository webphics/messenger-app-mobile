import {
  canReplyToWallPost,
  flipWallPostBookmark,
  nextWallPostVote,
  toggleWallPostReaction,
  wallPostActions,
  wallPostReplyDraft,
  withVoteDelta,
  type WallPostViewer,
} from '@/lib/wall-actions'
import type { WallPost } from '@/lib/types'

function post(overrides: Partial<WallPost> = {}): WallPost {
  return {
    id: 'post-1',
    author: { id: 'user-1', name: 'Ada' },
    organizationId: 'org-1',
    kind: 'community',
    title: null,
    endsAt: null,
    pinnedAt: null,
    body: null,
    attachments: [],
    link: null,
    reactions: [],
    score: 0,
    upvoteCount: 0,
    viewCount: 0,
    isBookmarked: false,
    editedAt: null,
    createdAt: '2026-09-14T10:00:00.000Z',
    ...overrides,
  }
}

const author: WallPostViewer = { id: 'user-1', role: 'customer', capabilities: [] }
const stranger: WallPostViewer = { id: 'user-2', role: 'customer', capabilities: [] }
const admin: WallPostViewer = { id: 'user-3', role: 'admin', capabilities: ['remove_wall_posts'] }

describe('what a Post offers', () => {
  it('offers nothing at all when there is nothing to offer, so no control is drawn', () => {
    expect(wallPostActions(post(), stranger)).toEqual([])
  })

  it('offers its text', () => {
    expect(wallPostActions(post({ body: 'The lift is fixed.' }), stranger)).toEqual(['copy-body'])
  })

  it('does not offer a body that is only whitespace', () => {
    expect(wallPostActions(post({ body: '   ' }), stranger)).toEqual([])
  })

  it('offers where its link goes', () => {
    expect(
      wallPostActions(post({ link: { label: 'Read it', url: 'https://x.test' } }), stranger),
    ).toEqual(['copy-link'])
  })

  it('offers copy actions in the order the card reads, ahead of everything else', () => {
    expect(
      wallPostActions(
        post({ body: 'Hi', link: { label: 'Read it', url: 'https://x.test' } }),
        author,
      ),
    ).toEqual(['copy-body', 'copy-link', 'edit', 'delete'])
  })
})

describe('who may edit and delete', () => {
  it('offers the author edit and delete on their own Post', () => {
    expect(wallPostActions(post(), author)).toEqual(['edit', 'delete'])
  })

  it('offers a stranger neither, and no takedown either, since they do not hold remove_wall_posts', () => {
    expect(wallPostActions(post(), stranger)).toEqual([])
  })

  it('offers a holder of remove_wall_posts takedown on somebody else’s Post, never edit or delete', () => {
    expect(wallPostActions(post(), admin)).toEqual(['takedown'])
  })

  it('offers an Admin without remove_wall_posts no takedown', () => {
    const restricted: WallPostViewer = { id: 'user-3', role: 'admin', capabilities: ['pin_wall_posts'] }
    expect(wallPostActions(post(), restricted)).toEqual([])
  })

  it('offers an Agent granted remove_wall_posts takedown on somebody else’s Post', () => {
    const agent: WallPostViewer = { id: 'user-4', role: 'agent', capabilities: ['remove_wall_posts'] }
    expect(wallPostActions(post(), agent)).toEqual(['takedown'])
  })

  it('offers an Admin their own Post as delete, not takedown — it is their own writing', () => {
    const own: WallPostViewer = { id: 'user-1', role: 'admin', capabilities: ['remove_wall_posts'] }
    expect(wallPostActions(post({ author: { id: 'user-1', name: 'Ada' } }), own)).toEqual([
      'edit',
      'delete',
    ])
  })
})

describe('toggling a reaction', () => {
  it('adds one this person has not reacted with yet', () => {
    const result = toggleWallPostReaction([], '👍', 'user-1')
    expect(result).toEqual({ reactions: [{ emoji: '👍', userId: 'user-1' }], added: true })
  })

  it('removes the exact one this person already holds', () => {
    const result = toggleWallPostReaction([{ emoji: '👍', userId: 'user-1' }], '👍', 'user-1')
    expect(result).toEqual({ reactions: [], added: false })
  })

  it('leaves this person’s other emoji alone — several may coexist, unlike a Message', () => {
    const held = [
      { emoji: '👍', userId: 'user-1' },
      { emoji: '🔥', userId: 'user-1' },
    ]
    const result = toggleWallPostReaction(held, '🔥', 'user-1')
    expect(result).toEqual({ reactions: [{ emoji: '👍', userId: 'user-1' }], added: false })
  })

  it('leaves everybody else’s reactions untouched', () => {
    const held = [{ emoji: '👍', userId: 'user-2' }]
    const result = toggleWallPostReaction(held, '👍', 'user-1')
    expect(result.reactions).toEqual(
      expect.arrayContaining([
        { emoji: '👍', userId: 'user-2' },
        { emoji: '👍', userId: 'user-1' },
      ]),
    )
  })
})

describe('what a tap on a vote direction leaves the caller holding', () => {
  it('casts a vote nobody held before', () => {
    expect(nextWallPostVote(null, 'up')).toBe('up')
    expect(nextWallPostVote(null, 'down')).toBe('down')
  })

  it('clears a vote cast the same direction again', () => {
    expect(nextWallPostVote('up', 'up')).toBeNull()
    expect(nextWallPostVote('down', 'down')).toBeNull()
  })

  it('replaces a vote cast the opposite direction', () => {
    expect(nextWallPostVote('up', 'down')).toBe('down')
    expect(nextWallPostVote('down', 'up')).toBe('up')
  })
})

describe('what a vote does to a Post’s score and upvote count', () => {
  it('adds an upvote nobody held before', () => {
    const result = withVoteDelta(post({ score: 3, upvoteCount: 3 }), null, 'up')
    expect(result.score).toBe(4)
    expect(result.upvoteCount).toBe(4)
  })

  it('adds a downvote nobody held before, which moves the score but never the upvote count', () => {
    const result = withVoteDelta(post({ score: 3, upvoteCount: 3 }), null, 'down')
    expect(result.score).toBe(2)
    expect(result.upvoteCount).toBe(3)
  })

  it('clears a held upvote', () => {
    const result = withVoteDelta(post({ score: 4, upvoteCount: 4 }), 'up', null)
    expect(result.score).toBe(3)
    expect(result.upvoteCount).toBe(3)
  })

  it('clears a held downvote, which never touched the upvote count either way', () => {
    const result = withVoteDelta(post({ score: 2, upvoteCount: 3 }), 'down', null)
    expect(result.score).toBe(3)
    expect(result.upvoteCount).toBe(3)
  })

  it('replaces a held upvote with a downvote in one move — never both at once', () => {
    const result = withVoteDelta(post({ score: 4, upvoteCount: 4 }), 'up', 'down')
    expect(result.score).toBe(2)
    expect(result.upvoteCount).toBe(3)
  })

  it('replaces a held downvote with an upvote in one move', () => {
    const result = withVoteDelta(post({ score: 2, upvoteCount: 3 }), 'down', 'up')
    expect(result.score).toBe(4)
    expect(result.upvoteCount).toBe(4)
  })

  it('can go negative — a score is upvotes minus downvotes and may be', () => {
    const result = withVoteDelta(post({ score: 0, upvoteCount: 0 }), null, 'down')
    expect(result.score).toBe(-1)
    expect(result.upvoteCount).toBe(0)
  })

  it('leaves everything else about the Post untouched', () => {
    const before = post({ score: 1, upvoteCount: 1, body: 'Hi' })
    const result = withVoteDelta(before, null, 'up')
    expect(result).toEqual({ ...before, score: 2, upvoteCount: 2 })
  })

  it('is its own inverse — applying a delta and then swapping the arguments undoes it', () => {
    const before = post({ score: 5, upvoteCount: 5 })
    const applied = withVoteDelta(before, null, 'up')
    const rolledBack = withVoteDelta(applied, 'up', null)
    expect(rolledBack).toEqual(before)
  })
})

describe('who may reply', () => {
  it('offers it to a Customer, on anybody’s Post — even their own', () => {
    expect(canReplyToWallPost(stranger)).toBe(true)
    expect(canReplyToWallPost(author)).toBe(true)
  })

  it('never offers it to staff — there is no such thing as their own support conversation', () => {
    expect(canReplyToWallPost(admin)).toBe(false)
    expect(canReplyToWallPost({ id: 'user-4', role: 'agent', capabilities: [] })).toBe(false)
  })
})

describe('the reference a reply seeds the composer with', () => {
  it('quotes a short body in full', () => {
    expect(wallPostReplyDraft(post({ body: 'The lift is fixed.' }))).toBe(
      'Re: “The lift is fixed.”\n\n',
    )
  })

  it('cuts a long body off rather than quoting all of it', () => {
    const body = 'x'.repeat(200)
    const draft = wallPostReplyDraft(post({ body }))
    expect(draft.startsWith('Re: “' + 'x'.repeat(119) + '…”')).toBe(true)
    expect(draft.endsWith('\n\n')).toBe(true)
  })

  it('names the author instead, for a Post with no body', () => {
    expect(wallPostReplyDraft(post({ body: null, author: { id: 'user-1', name: 'Ada' } }))).toBe(
      'Re: Ada’s post\n\n',
    )
  })

  it('does the same for a body that is only whitespace', () => {
    expect(wallPostReplyDraft(post({ body: '   ', author: { id: 'user-1', name: 'Ada' } }))).toBe(
      'Re: Ada’s post\n\n',
    )
  })
})

describe('flipping a bookmark', () => {
  it('bookmarks a Post that was not', () => {
    expect(flipWallPostBookmark(post({ isBookmarked: false })).isBookmarked).toBe(true)
  })

  it('un-bookmarks one that was', () => {
    expect(flipWallPostBookmark(post({ isBookmarked: true })).isBookmarked).toBe(false)
  })

  it('leaves everything else about the Post untouched', () => {
    const before = post({ isBookmarked: false, body: 'Hi' })
    expect(flipWallPostBookmark(before)).toEqual({ ...before, isBookmarked: true })
  })

  it('is its own inverse — flipping twice is the Post it started as', () => {
    const before = post({ isBookmarked: false })
    expect(flipWallPostBookmark(flipWallPostBookmark(before))).toEqual(before)
  })
})
