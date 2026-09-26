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

  /*
   * This client has no Delete. The sentence is here so a delete that arrives
   * later, or a refusal relayed from somewhere else, reads the same wherever it
   * is shown.
   */
  test('says in its own words that a system notice cannot be deleted', () => {
    const body = { code: 'message_not_deletable', message: 'Message is not deletable.' }

    expect(refusedWith(422, body)).toEqual({
      ok: false,
      failure: {
        kind: 'refused',
        message: 'System notices cannot be deleted, and neither can their attachments.',
        code: 'message_not_deletable',
      },
    })
  })

  test('uses its own words for message_not_deletable even when the API sent no sentence', () => {
    expect(refusedWith(422, { code: 'message_not_deletable' })).toMatchObject({
      failure: { message: 'System notices cannot be deleted, and neither can their attachments.' },
    })
  })

  test('reads a code named like an object property as any other code', () => {
    expect(refusedWith(400, { code: 'toString', message: 'Bad request.' })).toMatchObject({
      failure: { message: 'Bad request.' },
    })
  })
})
