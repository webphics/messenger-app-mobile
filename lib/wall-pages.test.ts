import {
  applyFirstPage,
  applyOlderPage,
  withLivePost,
  withRestoredPost,
  withUpdatedPost,
} from '@/lib/wall-pages'
import type { WallPost } from '@/lib/types'

const LIMIT = 3

function post(id: string): WallPost {
  return {
    id,
    author: { id: 'user-1', name: 'Ada' },
    organizationId: 'org-1',
    kind: 'community',
    title: null,
    endsAt: null,
    pinnedAt: null,
    body: id,
    attachments: [],
    link: null,
    reactions: [],
    score: 0,
    upvoteCount: 0,
    viewCount: 0,
    isBookmarked: false,
    editedAt: null,
    createdAt: '2026-09-14T10:00:00.000Z',
  }
}

const ids = (read: { posts: WallPost[] }) => read.posts.map(p => p.id)

describe('paging', () => {
  it('a first page that came back short is the end of the Wall; a full one is not', () => {
    expect(applyFirstPage([post('c')], LIMIT).reachedEnd).toBe(true)
    expect(applyFirstPage([post('c'), post('b'), post('a')], LIMIT).reachedEnd).toBe(false)
  })

  it('a Post that arrived on both pages is drawn once, and the cursor still moves', () => {
    const first = applyFirstPage([post('e'), post('d'), post('c')], LIMIT)
    const next = applyOlderPage(first, [post('c'), post('b')], LIMIT)
    expect(ids(next)).toEqual(['e', 'd', 'c', 'b'])
    expect(next.cursor).toBe('b')
  })

  it('keeps the cursor it had when an older page came back empty', () => {
    const first = applyFirstPage([post('e'), post('d'), post('c')], LIMIT)
    expect(applyOlderPage(first, [], LIMIT).cursor).toBe('c')
  })
})

describe('folding in what arrives', () => {
  const read = applyFirstPage([post('c'), post('b'), post('a')], LIMIT)

  it('a live Post already held is replaced rather than duplicated, and moves to the top', () => {
    expect(ids(withLivePost(read, post('b')))).toEqual(['b', 'c', 'a'])
  })

  it('an edit replaces the Post in place, and does nothing for a Post this device has not read', () => {
    const edited: WallPost = { ...post('b'), body: 'edited' }
    expect(ids(withUpdatedPost(read, edited))).toEqual(['c', 'b', 'a'])
    expect(withUpdatedPost(read, post('z'))).toBe(read)
  })

  it('a refused un-bookmark puts the Post back at its index, never duplicating it', () => {
    const saved = applyFirstPage([post('c'), post('a')], LIMIT)
    expect(ids(withRestoredPost(saved, post('b'), 1))).toEqual(['c', 'b', 'a'])
    expect(withRestoredPost(saved, post('c'), 0)).toBe(saved)
  })
})
