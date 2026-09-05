import { assignmentRefusal, failureNotice, readRefusal } from '@/lib/conversation-failure'

describe('failureNotice', () => {
  test('offers a retry for a request that never arrived', () => {
    expect(failureNotice({ kind: 'unreachable' })).toEqual({
      title: 'Cannot reach the server',
      hint: 'Check your connection and try again.',
    })
  })

  test('repeats what the server said when it refused', () => {
    expect(failureNotice({ kind: 'refused', message: 'Email not verified.' }).hint).toBe(
      'Email not verified.',
    )
  })

  test('titles a refusal for conversations by default', () => {
    expect(failureNotice({ kind: 'refused', message: 'x' }).title).toBe(
      'Could not load conversations',
    )
  })

  test('takes a caller-supplied title for a refusal in a different context', () => {
    expect(
      failureNotice({ kind: 'refused', message: 'x' }, 'Could not load the staff directory')
        .title,
    ).toBe('Could not load the staff directory')
  })

  test('says a session ended rather than showing an empty inbox', () => {
    expect(failureNotice({ kind: 'unauthorised' }).title).toBe('Your session ended')
  })

  test('does not blame the person for a body it could not read', () => {
    expect(failureNotice({ kind: 'malformed' }).title).toBe('Could not read the reply')
  })
})

describe('assignmentRefusal', () => {
  test('repeats the one refusal that matters: somebody reached the thread first', () => {
    expect(
      assignmentRefusal({ kind: 'refused', message: 'This chat is already engaged.' }),
    ).toBe('This chat is already engaged.')
  })

  test('and the one an Agent would get for a Takeover, if anything offered them one', () => {
    expect(
      assignmentRefusal({ kind: 'refused', message: "You don't have permission to do that." }),
    ).toBe("You don't have permission to do that.")
  })

  test('offers the retry a request that never arrived deserves', () => {
    expect(assignmentRefusal({ kind: 'unreachable' })).toBe(
      'Could not reach the server. Check your connection and try again.',
    )
  })

  test('does not blame the person for a body it could not read', () => {
    expect(assignmentRefusal({ kind: 'malformed' })).toBe(
      'The server answered with something this app did not understand.',
    )
  })

  test('says nothing about an expired session, which is already leaving the screen', () => {
    expect(assignmentRefusal({ kind: 'unauthorised' })).toBeNull()
  })
})

describe('readRefusal', () => {
  test('says what is drawn is what this device had, rather than that it is all there is', () => {
    expect(readRefusal({ kind: 'unreachable' })).toBe(
      'No connection. This is what this device already had.',
    )
  })

  test('repeats a refusal in the server’s own words', () => {
    expect(readRefusal({ kind: 'refused', message: 'Too many requests.' })).toBe(
      'Too many requests.',
    )
  })

  test('does not blame the person for a body it could not read', () => {
    expect(readRefusal({ kind: 'malformed' })).toBe(
      'The server answered with something this app did not understand.',
    )
  })

  test('says nothing about an expired session over a thread that is already leaving', () => {
    expect(readRefusal({ kind: 'unauthorised' })).toBeNull()
  })
})
