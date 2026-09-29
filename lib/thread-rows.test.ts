import { buildThreadRows, type ThreadRow } from '@/lib/thread-rows'
import type { Message, MessageType } from '@/lib/types'

/**
 * Built from local parts, so these say the same thing on a machine in any zone.
 * A `Z` literal only asserts the intended day where the machine is at UTC.
 */
function localIso(y: number, m: number, d: number, hour: number, minute = 0): string {
  return new Date(y, m - 1, d, hour, minute).toISOString()
}

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
    editedAt: null,
    editableUntil: null,
    replyTo: null,
    reactions: [],
    attachments: [],
    receiptStatus: 'sent',
    sender: { ...sender, role: 'agent' },
  }
}

const ME = { id: 'me', name: 'Jonah Reed' }
const THEM = { id: 'them', name: 'Priya Raman' }

/** Newest first, the way an inverted list reads them. */
function kinds(rows: ThreadRow[]): string[] {
  return rows.map((row) => `${row.type}:${row.id}`)
}

describe('buildThreadRows', () => {
  test('opens each new day with a divider, newest row first', () => {
    const rows = buildThreadRows(
      [
        staffMessage('m1', localIso(2026, 8, 12, 22), THEM),
        staffMessage('m2', localIso(2026, 8, 13, 9), THEM),
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
  })

  test('the sender is named once per run, and never for the viewer', () => {
    const rows = buildThreadRows(
      [
        staffMessage('m1', localIso(2026, 8, 13, 9), THEM),
        staffMessage('m2', localIso(2026, 8, 13, 9, 1), THEM),
        staffMessage('m3', localIso(2026, 8, 13, 9, 2), ME),
      ],
      { viewerId: 'me', namesSenders: true },
    )

    expect(
      rows.filter((row) => row.type === 'message').map((row) => `${row.id}:${row.senderName ?? '-'}`),
    ).toEqual(['m3:-', 'm2:-', 'm1:Priya Raman'])
  })
})
