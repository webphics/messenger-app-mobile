import { readOutcome } from '@/lib/api-result'

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

  test('reads a code named like an object property as any other code', () => {
    expect(refusedWith(400, { code: 'toString', message: 'Bad request.' })).toMatchObject({
      failure: { message: 'Bad request.' },
    })
  })
})
