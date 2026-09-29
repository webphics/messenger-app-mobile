import { threadNotice, type ThreadNoticeInput } from '@/lib/thread-notice'

const blank: ThreadNoticeInput = {
  drawn: 0,
  confirmed: 0,
  loading: false,
  failure: null,
  readOnly: false,
}

/** A thread the API has answered for, with `n` Messages on screen. */
const read = (n: number): ThreadNoticeInput => ({ ...blank, drawn: n, confirmed: n })

describe('threadNotice', () => {
  test('a first page still in flight is loading, not an empty thread', () => {
    expect(threadNotice({ ...blank, loading: true })).toEqual({ kind: 'loading' })
  })

  test('a thread this device could not read says that, not that it is empty', () => {
    expect(threadNotice({ ...blank, failure: { kind: 'unreachable' } }).kind).toBe('failed')
    expect(threadNotice(blank).kind).toBe('empty')
  })

  test('a failure outranks the loading a retry left behind it', () => {
    expect(threadNotice({ ...blank, loading: true, failure: { kind: 'malformed' } }).kind).toBe(
      'failed',
    )
  })

  test('a failure does not replace Messages that are already drawn', () => {
    expect(threadNotice({ ...read(3), failure: { kind: 'unreachable' } }).kind).toBe('stale')
  })

  test('and says nothing at all about a session that is already leaving the screen', () => {
    expect(threadNotice({ ...read(1), failure: { kind: 'unauthorised' } })).toEqual({
      kind: 'none',
    })
  })

  test('an Unsent Message of your own is not the server having answered', () => {
    expect(
      threadNotice({ ...blank, drawn: 1, confirmed: 0, failure: { kind: 'unreachable' } }).kind,
    ).toBe('failed')
  })
})
