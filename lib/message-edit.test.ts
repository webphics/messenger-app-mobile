import { withRefreshedQuotes } from '@/lib/message-edit'
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

describe('withRefreshedQuotes', () => {
  test('rewrites the quote on a reply pointing at the edited message, truncated to the API length', () => {
    const edited = message({ id: 'm1', body: 'x'.repeat(200) })
    const reply = message({ id: 'm2', replyTo: { id: 'm1', preview: 'old' } })

    const [, refreshed] = withRefreshedQuotes([edited, reply], edited)

    expect(refreshed.replyTo?.preview).toHaveLength(140)
  })

  test('leaves replies quoting something else alone', () => {
    const edited = message({ id: 'm1', body: 'the corrected wording' })
    const other = message({ id: 'm2', replyTo: { id: 'm9', preview: 'untouched' } })

    const [, refreshed] = withRefreshedQuotes([edited, other], edited)

    expect(refreshed).toBe(other)
  })
})
