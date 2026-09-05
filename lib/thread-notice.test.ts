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

  test('a thread nobody has written in says so', () => {
    expect(threadNotice(blank)).toEqual({
      kind: 'empty',
      title: 'No messages yet',
      hint: 'Write the first message to start this conversation.',
    })
  })

  test('and does not invite a message from someone who cannot send one', () => {
    expect(threadNotice({ ...blank, readOnly: true })).toEqual({
      kind: 'empty',
      title: 'No messages yet',
      hint: 'Nothing has been posted here yet.',
    })
  })

  test('a thread this device could not read says that instead', () => {
    expect(threadNotice({ ...blank, failure: { kind: 'unreachable' } })).toEqual({
      kind: 'failed',
      title: 'Cannot reach the server',
      hint: 'Check your connection and try again.',
    })
  })

  test('titles a refusal for this thread rather than for the conversation list', () => {
    expect(threadNotice({ ...blank, failure: { kind: 'refused', message: 'Nope.' } })).toEqual({
      kind: 'failed',
      title: 'Could not load this conversation',
      hint: 'Nope.',
    })
  })

  test('says an expired session out loud, which an empty thread would hide', () => {
    expect(threadNotice({ ...blank, failure: { kind: 'unauthorised' } }).kind).toBe('failed')
  })

  test('a failure outranks the loading a retry left behind it', () => {
    expect(threadNotice({ ...blank, loading: true, failure: { kind: 'malformed' } }).kind).toBe(
      'failed',
    )
  })

  test('a retry that succeeded clears the notice', () => {
    expect(threadNotice(read(3))).toEqual({ kind: 'none' })
  })

  test('nor is a thread this device is holding drawn over while it re-reads', () => {
    expect(threadNotice({ ...read(3), loading: true })).toEqual({ kind: 'none' })
  })

  test('a failure does not replace Messages that are already drawn', () => {
    expect(threadNotice({ ...read(3), failure: { kind: 'unreachable' } })).toEqual({
      kind: 'stale',
      message: 'No connection. This is what this device already had.',
    })
  })

  test('it repeats a refusal beside them in the server’s own words', () => {
    expect(
      threadNotice({ ...read(1), failure: { kind: 'refused', message: 'Too many requests.' } }),
    ).toEqual({ kind: 'stale', message: 'Too many requests.' })
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

  test('but it is still something on screen, so it is not an empty thread', () => {
    expect(threadNotice({ ...blank, drawn: 1, confirmed: 0 })).toEqual({ kind: 'none' })
  })
})
