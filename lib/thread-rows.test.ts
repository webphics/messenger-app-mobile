import { buildThreadRows, type ThreadRow } from '@/lib/thread-rows'
import type { Message, MessageType } from '@/lib/types'

function staffMessage(
  id: string,
  createdAt: string,
  sender: { id: string; name: string },
  messageType: MessageType = 'text',
): Message {
  return {
    id,
    body: `body of ${id}`,
    messageType,
    createdAt,
    replyTo: null,
    reactions: [],
    attachments: [],
    receiptStatus: 'sent',
    sender: { ...sender, role: 'agent' },
  }
}

function customerMessage(id: string, createdAt: string, fromCompany: boolean): Message {
  return {
    id,
    body: `body of ${id}`,
    messageType: 'text',
    createdAt,
    replyTo: null,
    reactions: [],
    attachments: [],
    receiptStatus: 'sent',
    fromCompany,
  }
}

const ME = { id: 'me', name: 'Jonah Reed' }
const THEM = { id: 'them', name: 'Priya Raman' }

/** Newest first, the way an inverted list reads them. */
function kinds(rows: ThreadRow[]): string[] {
  return rows.map((row) => `${row.type}:${row.id}`)
}

describe('buildThreadRows', () => {
  test('answers nothing for an empty thread', () => {
    expect(buildThreadRows([], { viewerId: 'me', namesSenders: false })).toEqual([])
  })

  test('reverses the thread, so the newest message is the first row', () => {
    const rows = buildThreadRows(
      [
        staffMessage('m1', '2026-08-13T08:00:00.000Z', THEM),
        staffMessage('m2', '2026-08-13T09:00:00.000Z', ME),
      ],
      { viewerId: 'me', namesSenders: false },
    )

    expect(kinds(rows)).toEqual(['message:m2', 'message:m1', 'day:day-m1'])
  })

  test('opens each new day with a divider', () => {
    const rows = buildThreadRows(
      [
        staffMessage('m1', '2026-08-12T22:00:00.000Z', THEM),
        staffMessage('m2', '2026-08-13T09:00:00.000Z', THEM),
      ],
      { viewerId: 'me', namesSenders: false },
    )

    expect(kinds(rows)).toEqual(['message:m2', 'day:day-m2', 'message:m1', 'day:day-m1'])
  })

  test('a system message is its own row rather than a bubble', () => {
    const rows = buildThreadRows(
      [
        staffMessage('m1', '2026-08-13T08:00:00.000Z', THEM),
        staffMessage('sys', '2026-08-13T08:05:00.000Z', ME, 'system'),
      ],
      { viewerId: 'me', namesSenders: true },
    )

    expect(kinds(rows)).toEqual(['system:sys', 'message:m1', 'day:day-m1'])
    expect(rows[0]).toEqual({
      type: 'system',
      id: 'sys',
      message: expect.objectContaining({ id: 'sys' }),
    })
  })

  test('a system message still opens its day', () => {
    const rows = buildThreadRows(
      [
        staffMessage('m1', '2026-08-12T22:00:00.000Z', THEM),
        staffMessage('sys', '2026-08-13T08:00:00.000Z', ME, 'system'),
      ],
      { viewerId: 'me', namesSenders: false },
    )

    expect(kinds(rows)).toEqual(['system:sys', 'day:day-sys', 'message:m1', 'day:day-m1'])
  })

  test('names the sender of an incoming message where the thread names senders', () => {
    const rows = buildThreadRows([staffMessage('m1', '2026-08-13T08:00:00.000Z', THEM)], {
      viewerId: 'me',
      namesSenders: true,
    })

    expect(rows[0]).toMatchObject({ type: 'message', senderName: 'Priya Raman' })
  })

  test('never names the viewer above their own message', () => {
    const rows = buildThreadRows([staffMessage('m1', '2026-08-13T08:00:00.000Z', ME)], {
      viewerId: 'me',
      namesSenders: true,
    })

    expect(rows[0]).toMatchObject({ type: 'message', senderName: undefined })
  })

  test('names nobody where the thread does not name senders', () => {
    const rows = buildThreadRows([staffMessage('m1', '2026-08-13T08:00:00.000Z', THEM)], {
      viewerId: 'me',
      namesSenders: false,
    })

    expect(rows[0]).toMatchObject({ type: 'message', senderName: undefined })
  })

  test("a Customer's Support DM message carries no name to show", () => {
    const rows = buildThreadRows([customerMessage('m1', '2026-08-13T08:00:00.000Z', true)], {
      viewerId: 'me',
      namesSenders: true,
    })

    expect(rows[0]).toMatchObject({ type: 'message', senderName: undefined })
  })
})
