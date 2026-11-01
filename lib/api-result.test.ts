import { readOutcome, refusalSentence } from '@/lib/api-result'

/** A response that reached the API and was refused with this body. */
function refusedWith(status: number, body: unknown) {
  return readOutcome({ reached: true, status, body, sessionCookie: null }, () => null)
}

describe('readOutcome refusals', () => {
  test("repeats the API's sentence for a code this client has no wording of its own for", () => {
    expect(refusedWith(403, { code: 'must_engage', message: 'Engage this chat first.' })).toEqual({
      ok: false,
      failure: { kind: 'refused', message: 'Engage this chat first.', code: 'must_engage' },
    })
  })

  test('words the content filter’s refusal itself, keeping the code', () => {
    expect(
      refusedWith(422, { code: 'objectionable_content', message: "This contains language that isn't allowed." }),
    ).toEqual({
      ok: false,
      failure: {
        kind: 'refused',
        message: 'This contains language that isn’t allowed on ChatRoute. Edit it and try again.',
        code: 'objectionable_content',
      },
    })
  })

  test('reads a code named like an object property as any other code', () => {
    expect(refusedWith(400, { code: 'toString', message: 'Bad request.' })).toMatchObject({
      failure: { message: 'Bad request.' },
    })
  })
})

describe('refusalSentence', () => {
  test.each([
    ['repeats the refusal', { kind: 'refused', message: 'Not yours.' } as const, 'Not yours.'],
    ['names the network', { kind: 'unreachable' } as const, 'No connection. Try again.'],
    ['says nothing for an expired session', { kind: 'unauthorised' } as const, null],
    ['falls back for a body it could not read', { kind: 'malformed' } as const, 'Fallback.'],
  ])('%s', (_, failure, expected) => {
    expect(refusalSentence(failure, 'Fallback.')).toBe(expected)
  })
})
