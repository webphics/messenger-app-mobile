import { wallNotice, type WallNoticeInput } from '@/lib/wall-notice'

const blank: WallNoticeInput = { drawn: 0, loading: false, failure: null }

describe('wallNotice', () => {
  it('is a spinner while the first page is still in flight, never an empty Wall', () => {
    expect(wallNotice({ ...blank, loading: true })).toEqual({ kind: 'loading' })
  })

  it('says nobody has posted when the Wall really is empty', () => {
    expect(wallNotice(blank)).toEqual({
      kind: 'empty',
      title: 'Nothing posted yet',
      hint: 'Posts from the organizations you belong to will appear here.',
    })
  })

  it('says this device could not find out, which is a different screen', () => {
    expect(wallNotice({ ...blank, failure: { kind: 'unreachable' } })).toEqual({
      kind: 'failed',
      title: 'Cannot reach the server',
      hint: 'Check your connection and try again.',
    })
  })

  it('titles a refusal for the Wall rather than for the conversation list', () => {
    expect(wallNotice({ ...blank, failure: { kind: 'refused', message: 'Nope.' } })).toEqual({
      kind: 'failed',
      title: 'Could not load the Wall',
      hint: 'Nope.',
    })
  })

  it('says nothing at all over a Wall that loaded', () => {
    expect(wallNotice({ ...blank, drawn: 3 })).toEqual({ kind: 'none' })
  })

  it('does not replace Posts already drawn: a failure over them is one line', () => {
    expect(wallNotice({ drawn: 3, loading: false, failure: { kind: 'unreachable' } })).toEqual({
      kind: 'stale',
      message: 'No connection. This is what this device already had.',
    })
  })

  it('keeps a refusal in the API’s own words above what is drawn', () => {
    expect(
      wallNotice({ drawn: 3, loading: false, failure: { kind: 'refused', message: 'Nope.' } }),
    ).toEqual({ kind: 'stale', message: 'Nope.' })
  })

  it('says nothing about an expired session, which is already leaving the screen', () => {
    expect(wallNotice({ drawn: 3, loading: false, failure: { kind: 'unauthorised' } })).toEqual({
      kind: 'none',
    })
  })

  it('lets a failure outrank a reload of a Wall that is still drawn', () => {
    expect(
      wallNotice({ drawn: 2, loading: true, failure: { kind: 'unreachable' } }).kind,
    ).toBe('stale')
  })
})
