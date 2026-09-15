import {
  applyFirstPage,
  applyOlderPage,
  canPageBack,
  emptyWall,
  withLivePost,
  withoutLivePost,
  withUpdatedPost,
  type WallPages,
} from '@/lib/wall-pages'
import type { WallPost } from '@/lib/types'

const LIMIT = 3

function post(id: string): WallPost {
  return {
    id,
    author: { id: 'user-1', name: 'Ada' },
    organizationId: 'org-1',
    body: id,
    attachments: [],
    link: null,
    reactions: [],
    editedAt: null,
    createdAt: '2026-09-14T10:00:00.000Z',
  }
}

const ids = (read: WallPages) => read.posts.map(p => p.id)

describe('the first page', () => {
  it('draws what came back, newest first as the API ordered it', () => {
    expect(ids(applyFirstPage([post('c'), post('b'), post('a')], LIMIT))).toEqual(['c', 'b', 'a'])
  })

  it('takes its cursor from the last Post, which is where the next page starts', () => {
    expect(applyFirstPage([post('c'), post('b')], LIMIT).cursor).toBe('b')
  })

  it('replaces rather than merges, so a Post taken down between reads leaves the screen', () => {
    const drawn = applyFirstPage([post('c'), post('b'), post('a')], LIMIT)
    expect(ids(applyFirstPage([post('c'), post('a')], LIMIT))).toEqual(['c', 'a'])
    expect(ids(drawn)).toEqual(['c', 'b', 'a'])
  })

  it('is the end of the Wall when it came back short', () => {
    expect(applyFirstPage([post('c')], LIMIT).reachedEnd).toBe(true)
  })

  it('is not the end when it came back full, even if it happens to be the last', () => {
    expect(applyFirstPage([post('c'), post('b'), post('a')], LIMIT).reachedEnd).toBe(false)
  })

  it('leaves an empty Wall with no cursor to page from', () => {
    expect(applyFirstPage([], LIMIT)).toEqual({ posts: [], cursor: null, reachedEnd: true })
  })
})

describe('a page from further back', () => {
  const first = applyFirstPage([post('e'), post('d'), post('c')], LIMIT)

  it('goes under what is already drawn', () => {
    expect(ids(applyOlderPage(first, [post('b'), post('a')], LIMIT))).toEqual([
      'e',
      'd',
      'c',
      'b',
      'a',
    ])
  })

  it('draws a Post that arrived on both pages once', () => {
    expect(ids(applyOlderPage(first, [post('c'), post('b')], LIMIT))).toEqual(['e', 'd', 'c', 'b'])
  })

  it('still moves the cursor to where the API got to, duplicate or not', () => {
    expect(applyOlderPage(first, [post('c'), post('b')], LIMIT).cursor).toBe('b')
  })

  it('keeps the cursor it had when the page came back empty', () => {
    expect(applyOlderPage(first, [], LIMIT).cursor).toBe('c')
  })

  it('ends the Wall when the page came back short', () => {
    expect(applyOlderPage(first, [post('b')], LIMIT).reachedEnd).toBe(true)
  })
})

describe('whether there is a page worth asking for', () => {
  it('there is not, on a Wall nobody has read yet', () => {
    expect(canPageBack(emptyWall)).toBe(false)
  })

  it('there is, once a full page has been drawn', () => {
    expect(canPageBack(applyFirstPage([post('c'), post('b'), post('a')], LIMIT))).toBe(true)
  })

  it('there is not, once the Wall has answered short', () => {
    expect(canPageBack(applyFirstPage([post('c')], LIMIT))).toBe(false)
  })
})

describe('a Post that arrives live', () => {
  const read = applyFirstPage([post('c'), post('b'), post('a')], LIMIT)

  it('goes on top', () => {
    expect(ids(withLivePost(read, post('d')))).toEqual(['d', 'c', 'b', 'a'])
  })

  it('replaces a copy already held rather than duplicating it, but still moves to the top', () => {
    expect(ids(withLivePost(read, post('b')))).toEqual(['b', 'c', 'a'])
  })

  it('leaves the cursor and reachedEnd alone — an arrival changes nothing about paging', () => {
    const ended = { ...read, reachedEnd: true }
    const next = withLivePost(ended, post('d'))
    expect(next.cursor).toBe(ended.cursor)
    expect(next.reachedEnd).toBe(true)
  })
})

describe('an edit or a reaction, over the socket', () => {
  const read = applyFirstPage([post('c'), post('b'), post('a')], LIMIT)

  it('replaces the Post in place, without moving it', () => {
    const edited: WallPost = { ...post('b'), body: 'edited', editedAt: '2026-09-14T11:00:00.000Z' }
    const next = withUpdatedPost(read, edited)
    expect(ids(next)).toEqual(['c', 'b', 'a'])
    expect(next.posts[1]).toEqual(edited)
  })

  it('does nothing for a Post this device has not read', () => {
    expect(withUpdatedPost(read, post('z'))).toBe(read)
  })
})

describe('a Post removed live', () => {
  const read = applyFirstPage([post('c'), post('b'), post('a')], LIMIT)

  it('drops it', () => {
    expect(ids(withoutLivePost(read, 'b'))).toEqual(['c', 'a'])
  })

  it('does nothing for a Post already absent', () => {
    expect(withoutLivePost(read, 'z')).toBe(read)
  })
})
