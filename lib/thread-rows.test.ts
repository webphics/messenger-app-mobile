import { buildThreadRows, type ThreadRow } from '@/lib/thread-rows'
import type { Message, MessageType, UserRole } from '@/lib/types'

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
  sender: { id: string; name: string; role?: UserRole },
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
    sender: { role: 'agent', ...sender },
  }
}

const ME = { id: 'me', name: 'Jonah Reed' }
const THEM = { id: 'them', name: 'Priya Raman' }
const CUSTOMER = { id: 'cust', name: 'Dana Wolfe', role: 'customer' as const }
const VIEWER = { id: 'me', role: 'agent' as const }

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
      { viewer: VIEWER, conversationType: 'staff_dm' },
    )

    expect(kinds(rows)).toEqual(['message:m2', 'day:day-m2', 'message:m1', 'day:day-m1'])
  })

  test('a system message is its own row rather than a bubble', () => {
    const rows = buildThreadRows(
      [
        staffMessage('m1', '2026-08-13T08:00:00.000Z', THEM),
        staffMessage('sys', '2026-08-13T08:05:00.000Z', ME, 'system'),
      ],
      { viewer: VIEWER, conversationType: 'group' },
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
      { viewer: VIEWER, conversationType: 'group' },
    )

    expect(
      rows.filter((row) => row.type === 'message').map((row) => `${row.id}:${row.senderName ?? '-'}`),
    ).toEqual(['m3:-', 'm2:-', 'm1:Priya Raman'])
  })

  test('a group names the sender with their role', () => {
    const rows = buildThreadRows(
      [staffMessage('m1', localIso(2026, 8, 13, 9), { ...THEM, role: 'admin' })],
      { viewer: VIEWER, conversationType: 'group' },
    )

    const row = rows.find((r) => r.type === 'message')
    expect(row?.type === 'message' && [row.senderName, row.senderRole]).toEqual([
      'Priya Raman',
      'admin',
    ])
  })

  test('the company persona is named without a role', () => {
    const rows = buildThreadRows(
      [staffMessage('m1', localIso(2026, 8, 13, 9), { id: 'company:org1', name: 'Acme' })],
      { viewer: { id: 'cust', role: 'customer' }, conversationType: 'group' },
    )

    const row = rows.find((r) => r.type === 'message')
    expect(row?.type === 'message' && [row.senderName, row.senderRole]).toEqual(['Acme', undefined])
  })

  test("a colleague in a Support DM sits on the company's side and is named", () => {
    const rows = buildThreadRows(
      [
        staffMessage('m1', localIso(2026, 8, 13, 9), CUSTOMER),
        staffMessage('m2', localIso(2026, 8, 13, 9, 1), THEM),
        staffMessage('m3', localIso(2026, 8, 13, 9, 2), ME),
      ],
      { viewer: VIEWER, conversationType: 'support_dm' },
    )

    expect(
      rows
        .filter((row) => row.type === 'message')
        .map((row) =>
          row.type === 'message'
            ? `${row.id}:${row.stance.side}:${row.stance.variant}:${row.senderName ?? '-'}:${row.senderRole ?? '-'}`
            : '',
        ),
    ).toEqual([
      'm3:end:mine:-:-',
      'm2:end:colleague:Priya Raman:agent',
      'm1:start:incoming:-:-',
    ])
  })
})
