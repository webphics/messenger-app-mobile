import { wallPostActions } from '@/lib/wall-actions'
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

describe('what a Post offers', () => {
  it('offers nothing at all when there is nothing to offer, so no control is drawn', () => {
    expect(wallPostActions(post())).toEqual([])
  })

  it('offers its text', () => {
    expect(wallPostActions(post({ body: 'The lift is fixed.' }))).toEqual(['copy-body'])
  })

  it('does not offer a body that is only whitespace', () => {
    expect(wallPostActions(post({ body: '   ' }))).toEqual([])
  })

  it('offers where its link goes', () => {
    expect(wallPostActions(post({ link: { label: 'Read it', url: 'https://x.test' } }))).toEqual([
      'copy-link',
    ])
  })

  it('offers both, in the order the card reads', () => {
    expect(
      wallPostActions(post({ body: 'Hi', link: { label: 'Read it', url: 'https://x.test' } })),
    ).toEqual(['copy-body', 'copy-link'])
  })
})
