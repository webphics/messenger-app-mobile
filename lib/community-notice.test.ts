import { communityNotice, type CommunityNoticeInput } from '@/lib/community-notice'

const blank: CommunityNoticeInput = { drawn: 0, loading: false, failure: null }

describe('communityNotice', () => {
  it('tells belonging to none apart from being unable to find out', () => {
    expect(communityNotice(blank).kind).toBe('empty')
    expect(communityNotice({ ...blank, failure: { kind: 'unreachable' } }).kind).toBe('failed')
  })

  it('leaves Restored Communities on screen and reports the failure in one line', () => {
    expect(communityNotice({ drawn: 3, loading: false, failure: { kind: 'unreachable' } }).kind).toBe(
      'stale',
    )
  })

  it('keeps a load behind a failure, so a retry shows a spinner rather than the same notice', () => {
    expect(communityNotice({ drawn: 0, loading: true, failure: { kind: 'unreachable' } }).kind).toBe(
      'failed',
    )
  })
})
