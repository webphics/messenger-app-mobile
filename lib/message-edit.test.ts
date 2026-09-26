import { messageEditRefusal, withRefreshedQuotes } from '@/lib/message-edit'
import type { Message, MessageType } from '@/lib/types'

const NOW = Date.parse('2026-09-21T12:00:00.000Z')

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    body: 'hello',
    messageType: 'text' as MessageType,
    createdAt: new Date(NOW - 60_000).toISOString(),
    editedAt: null,
    editableUntil: null,
    replyTo: null,
    reactions: [],
    attachments: [],
    receiptStatus: 'sent',
    fromCompany: false,
    ...overrides,
  } as Message
}

describe('messageEditRefusal', () => {
  test("a refusal keeps the API's own sentence", () => {
    expect(messageEditRefusal({ kind: 'refused', message: 'That message is too old.' })).toBe(
      'That message is too old.',
    )
  })

  test.each(['unauthorised', 'unreachable', 'malformed'] as const)(
    '%s says the message was not changed',
    (kind) => {
      expect(messageEditRefusal({ kind })).toMatch(/\S/)
    },
  )
})

describe('withRefreshedQuotes', () => {
  const edited = message({ id: 'm1', body: 'the corrected wording' })

  test('rewrites the quote on a reply pointing at it', () => {
    const reply = message({ id: 'm2', replyTo: { id: 'm1', preview: 'the old wording' } })

    const [, refreshed] = withRefreshedQuotes([edited, reply], edited)

    expect(refreshed.replyTo).toEqual({ id: 'm1', preview: 'the corrected wording' })
  })

  test('truncates to the length the API freezes', () => {
    const long = message({ id: 'm1', body: 'x'.repeat(200) })
    const reply = message({ id: 'm2', replyTo: { id: 'm1', preview: 'old' } })

    const [, refreshed] = withRefreshedQuotes([long, reply], long)

    expect(refreshed.replyTo?.preview).toHaveLength(140)
  })

  test('leaves replies quoting something else alone', () => {
    const other = message({ id: 'm2', replyTo: { id: 'm9', preview: 'untouched' } })

    const [, refreshed] = withRefreshedQuotes([edited, other], edited)

    expect(refreshed).toBe(other)
  })

  test('returns the same array when nothing quoted it', () => {
    const messages = [edited, message({ id: 'm2' })]

    expect(withRefreshedQuotes(messages, edited)).toBe(messages)
  })

  test('returns the same array when the quote already matches', () => {
    const reply = message({ id: 'm2', replyTo: { id: 'm1', preview: 'the corrected wording' } })
    const messages = [edited, reply]

    expect(withRefreshedQuotes(messages, edited)).toBe(messages)
  })
})
