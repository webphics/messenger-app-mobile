import { communityNotice, type CommunityNoticeInput } from '@/lib/community-notice'

const blank: CommunityNoticeInput = { drawn: 0, loading: false, failure: null }

describe('communityNotice', () => {
  it('is a spinner while the first read is still out, never an empty tab', () => {
    expect(communityNotice({ ...blank, loading: true })).toEqual({ kind: 'loading' })
  })

  it('says somebody belongs to none when that is the settled answer', () => {
    expect(communityNotice(blank)).toEqual({
      kind: 'empty',
      title: 'No communities yet',
      hint: 'Communities you are added to will appear here, with the groups inside them.',
    })
  })

  it('says this device could not find out, which is the opposite fact', () => {
    expect(communityNotice({ ...blank, failure: { kind: 'unreachable' } })).toEqual({
      kind: 'failed',
      title: 'Cannot reach the server',
      hint: 'Check your connection and try again.',
    })
  })

  it('titles a refusal for the tab rather than for the conversation list', () => {
    expect(communityNotice({ ...blank, failure: { kind: 'refused', message: 'Nope.' } })).toEqual({
      kind: 'failed',
      title: 'Could not load communities',
      hint: 'Nope.',
    })
  })

  it('leaves Restored Communities on screen and reports the failure in one line', () => {
    expect(communityNotice({ drawn: 3, loading: false, failure: { kind: 'unreachable' } })).toEqual({
      kind: 'stale',
      message: 'No connection. This is what this device already had.',
    })
  })

  it('says nothing at all when there are Communities and nothing went wrong', () => {
    expect(communityNotice({ ...blank, drawn: 2 })).toEqual({ kind: 'none' })
  })

  it('keeps a load behind a failure, so a retry shows a spinner rather than the same notice', () => {
    expect(communityNotice({ drawn: 0, loading: true, failure: { kind: 'unreachable' } })).toMatchObject(
      { kind: 'failed' },
    )
  })
})
