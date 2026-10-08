import { parseMessageHistory } from '@/lib/conversation-parse'
import { messageHistoryRows, offersEditHistory } from '@/lib/message-history'
import type { MessageHistory } from '@/lib/types'

const AGENT = { id: 'u-agent', name: 'Priya Raman', role: 'agent' as const }

function history(overrides: Partial<MessageHistory> = {}): MessageHistory {
  return {
    messageId: 'm1',
    originalRecorded: true,
    versions: [
      { body: 'refund issued on the 4th', writtenAt: '2026-09-18T11:39:02.118Z', writtenBy: AGENT },
      { body: 'refund issued on the 14th', writtenAt: '2026-09-18T11:42:07.113Z', writtenBy: AGENT },
      { body: 'refund issued on the 14th.', writtenAt: '2026-09-18T11:44:00.000Z', writtenBy: AGENT },
    ],
    ...overrides,
  }
}

describe('offersEditHistory', () => {
  test.each([
    ['an edited message the server holds', { id: 'm1', editedAt: '2026-09-18T11:42:07.113Z' }, true],
    ['a message never edited', { id: 'm1', editedAt: null }, false],
    ['a message still on this device', { id: 'local-1', editedAt: '2026-09-18T11:42:07.113Z' }, false],
  ])('%s', (_, message, expected) => {
    expect(offersEditHistory(message)).toBe(expected)
  })
})

describe('messageHistoryRows', () => {
  test('newest first, labelled current, earlier and original', () => {
    const rows = messageHistoryRows(history())
    expect(rows.map((row) => [row.label, row.body])).toEqual([
      ['Current version', 'refund issued on the 14th.'],
      ['Earlier version', 'refund issued on the 14th'],
      ['Original', 'refund issued on the 4th'],
    ])
  })

  test('a message never edited is one current version and no original', () => {
    const rows = messageHistoryRows(
      history({ versions: [{ body: 'hi', writtenAt: '2026-09-18T11:39:02.118Z', writtenBy: null }] }),
    )
    expect(rows.map((row) => row.label)).toEqual(['Current version'])
  })

  test('the oldest wording is not called the original when the API did not record it', () => {
    const rows = messageHistoryRows(history({ originalRecorded: false }))
    expect(rows.map((row) => row.label)).toEqual([
      'Current version',
      'Earlier version',
      'Earlier version',
    ])
  })

  test('does not reorder the history it was given', () => {
    const input = history()
    messageHistoryRows(input)
    expect(input.versions[0]?.body).toBe('refund issued on the 4th')
  })
})

describe('parseMessageHistory', () => {
  test('reads the Staff shape, writer included', () => {
    const parsed = parseMessageHistory({
      messageId: 'm1',
      originalRecorded: true,
      versions: [
        { body: 'a', writtenAt: '2026-09-18T11:39:02.118Z', writtenBy: AGENT },
        { body: 'b', writtenAt: '2026-09-18T11:42:07.113Z', writtenBy: AGENT },
      ],
    })
    expect(parsed?.versions.map((version) => version.writtenBy?.name)).toEqual([
      'Priya Raman',
      'Priya Raman',
    ])
  })

  test("reads the Customer shape, where no writer is ever named", () => {
    const parsed = parseMessageHistory({
      messageId: 'm1',
      originalRecorded: true,
      versions: [{ body: 'a', writtenAt: '2026-09-18T11:39:02.118Z', writtenBy: null }],
    })
    expect(parsed?.versions[0]?.writtenBy).toBeNull()
  })

  test('drops a version with no time or no body, keeps an empty one', () => {
    const parsed = parseMessageHistory({
      messageId: 'm1',
      originalRecorded: true,
      versions: [
        { body: 'a', writtenAt: 'not a date', writtenBy: null },
        { writtenAt: '2026-09-18T11:39:02.118Z', writtenBy: null },
        { body: '', writtenAt: '2026-09-18T11:40:00.000Z', writtenBy: null },
      ],
    })
    expect(parsed?.versions).toEqual([
      { body: '', writtenAt: '2026-09-18T11:40:00.000Z', writtenBy: null },
    ])
  })

  test('reads anything but a true originalRecorded as not recorded', () => {
    expect(parseMessageHistory({ messageId: 'm1', versions: [] })?.originalRecorded).toBe(false)
  })

  test('refuses a payload with no message id', () => {
    expect(parseMessageHistory({ versions: [] })).toBeNull()
    expect(parseMessageHistory(null)).toBeNull()
  })
})
