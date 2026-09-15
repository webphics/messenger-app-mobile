import { wallBookmarksNotice, type WallBookmarksNoticeInput } from '@/lib/wall-bookmarks-notice'

const blank: WallBookmarksNoticeInput = { drawn: 0, loading: false, failure: null }

describe('wallBookmarksNotice', () => {
  it('is a spinner while the first page is still in flight, never an empty Saved view', () => {
    expect(wallBookmarksNotice({ ...blank, loading: true })).toEqual({ kind: 'loading' })
  })

  it('says nothing has been saved when the Saved view really is empty', () => {
    expect(wallBookmarksNotice(blank)).toEqual({
      kind: 'empty',
      title: 'Nothing saved yet',
      hint: 'Bookmark a post from the Wall and it will show up here.',
    })
  })

  it('says this device could not find out, which is a different screen', () => {
    expect(wallBookmarksNotice({ ...blank, failure: { kind: 'unreachable' } })).toEqual({
      kind: 'failed',
      title: 'Cannot reach the server',
      hint: 'Check your connection and try again.',
    })
  })

  it('titles a refusal for the Saved view rather than for the Wall', () => {
    expect(wallBookmarksNotice({ ...blank, failure: { kind: 'refused', message: 'Nope.' } })).toEqual({
      kind: 'failed',
      title: 'Could not load your saved posts',
      hint: 'Nope.',
    })
  })

  it('says nothing at all once the Saved view has something drawn', () => {
    expect(wallBookmarksNotice({ ...blank, drawn: 3 })).toEqual({ kind: 'none' })
  })

  it('does not replace Posts already drawn: a failure over them is one line', () => {
    expect(
      wallBookmarksNotice({ drawn: 3, loading: false, failure: { kind: 'unreachable' } }),
    ).toEqual({
      kind: 'stale',
      message: 'No connection. This is what this device already had.',
    })
  })

  it('lets a failure outrank a reload of a Saved view that is still drawn', () => {
    expect(
      wallBookmarksNotice({ drawn: 2, loading: true, failure: { kind: 'unreachable' } }).kind,
    ).toBe('stale')
  })
})
