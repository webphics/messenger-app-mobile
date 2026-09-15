import { toggleWallPostReaction, wallPostActions, type WallPostViewer } from '@/lib/wall-actions'
import type { WallPost } from '@/lib/types'

function post(overrides: Partial<WallPost> = {}): WallPost {
  return {
    id: 'post-1',
    author: { id: 'user-1', name: 'Ada' },
    organizationId: 'org-1',
    body: null,
    attachments: [],
    link: null,
    reactions: [],
    editedAt: null,
    createdAt: '2026-09-14T10:00:00.000Z',
    ...overrides,
  }
}

const author: WallPostViewer = { id: 'user-1', role: 'customer' }
const stranger: WallPostViewer = { id: 'user-2', role: 'customer' }
const admin: WallPostViewer = { id: 'user-3', role: 'admin' }

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

  it('offers a stranger neither, and no takedown either — they are not an Admin', () => {
    expect(wallPostActions(post(), stranger)).toEqual([])
  })

  it('offers an Admin takedown on somebody else’s Post, never edit or delete', () => {
    expect(wallPostActions(post(), admin)).toEqual(['takedown'])
  })

  it('offers an Admin their own Post as delete, not takedown — it is their own writing', () => {
    const own: WallPostViewer = { id: 'user-1', role: 'admin' }
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
