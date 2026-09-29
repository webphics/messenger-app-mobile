import {
  toggleWallPostReaction,
  wallPostActions,
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

  it('offers the author edit and delete, and a holder of remove_wall_posts takedown only on somebody else’s Post', () => {
    expect(wallPostActions(post(), author)).toEqual(['edit', 'delete'])
    expect(wallPostActions(post(), admin)).toEqual(['takedown'])
    const own: WallPostViewer = { id: 'user-1', role: 'admin', capabilities: ['remove_wall_posts'] }
    expect(wallPostActions(post(), own)).toEqual(['edit', 'delete'])
  })
})

describe('toggling a reaction', () => {
  it('removes the exact one this person already holds, leaving their other emoji alone', () => {
    const held = [
      { emoji: '👍', userId: 'user-1' },
      { emoji: '🔥', userId: 'user-1' },
    ]
    const result = toggleWallPostReaction(held, '🔥', 'user-1')
    expect(result).toEqual({ reactions: [{ emoji: '👍', userId: 'user-1' }], added: false })
  })
})

describe('what a vote does to a Post’s score and upvote count', () => {
  it('replaces a held upvote with a downvote in one move — never both at once', () => {
    const result = withVoteDelta(post({ score: 4, upvoteCount: 4 }), 'up', 'down')
    expect(result.score).toBe(2)
    expect(result.upvoteCount).toBe(3)
  })

  it('is its own inverse — applying a delta and then swapping the arguments undoes it', () => {
    const before = post({ score: 5, upvoteCount: 5 })
    const applied = withVoteDelta(before, null, 'up')
    expect(withVoteDelta(applied, 'up', null)).toEqual(before)
  })
})
