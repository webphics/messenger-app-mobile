import { buildThreadRows, threadDayMarks, type ThreadRow } from '@/lib/thread-rows'

/**
 * Built from local parts, so these say the same thing on a machine in any zone.
 * A `Z` literal only asserts the intended day where the machine is at UTC --
 * which is what let a pair of times on one local evening read as two days here.
 */
function localIso(y: number, m: number, d: number, hour: number, minute = 0): string {
  return new Date(y, m - 1, d, hour, minute).toISOString()
}
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
    editedAt: null,
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
    editedAt: null,
    replyTo: null,
    reactions: [],
    attachments: [],
    receiptStatus: 'sent',
    fromCompany,
  }
}

const ME = { id: 'me', name: 'Jonah Reed' }
const THEM = { id: 'them', name: 'Priya Raman' }
const OTHER = { id: 'other', name: 'Sam Okafor' }

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
    expect(rows[0]).toEqual({
      type: 'system',
      id: 'sys',
      message: expect.objectContaining({ id: 'sys' }),
    })
  })

  test('a system message still opens its day', () => {
    const rows = buildThreadRows(
      [
        staffMessage('m1', localIso(2026, 8, 12, 22), THEM),
        staffMessage('sys', localIso(2026, 8, 13, 8), ME, 'system'),
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

describe('the sender is named once per run', () => {
  function names(messages: Parameters<typeof buildThreadRows>[0]) {
    return buildThreadRows(messages, { viewerId: 'me', namesSenders: true })
      .filter((row) => row.type === 'message')
      .map((row) => `${row.id}:${row.senderName ?? '-'}`)
  }

  test('only the first message of a run carries the name', () => {
    expect(
      names([
        staffMessage('m1', localIso(2026, 8, 13, 9), THEM),
        staffMessage('m2', localIso(2026, 8, 13, 9, 1), THEM),
        staffMessage('m3', localIso(2026, 8, 13, 9, 2), THEM),
      ]),
      // Newest first, so the run's first message is the last row.
    ).toEqual(['m3:-', 'm2:-', 'm1:Priya Raman'])
  })

  test('a different sender begins a new run', () => {
    expect(
      names([
        staffMessage('m1', localIso(2026, 8, 13, 9), THEM),
        staffMessage('m2', localIso(2026, 8, 13, 9, 1), OTHER),
      ]),
    ).toEqual(['m2:Sam Okafor', 'm1:Priya Raman'])
  })

  test('a day boundary begins a new run for one sender', () => {
    expect(
      names([
        staffMessage('m1', localIso(2026, 8, 12, 22), THEM),
        staffMessage('m2', localIso(2026, 8, 13, 9), THEM),
      ]),
    ).toEqual(['m2:Priya Raman', 'm1:Priya Raman'])
  })

  test('a notice between two messages begins a new run', () => {
    expect(
      names([
        staffMessage('m1', localIso(2026, 8, 13, 9), THEM),
        staffMessage('sys', localIso(2026, 8, 13, 9, 1), ME, 'system'),
        staffMessage('m2', localIso(2026, 8, 13, 9, 2), THEM),
      ]),
    ).toEqual(['m2:Priya Raman', 'm1:Priya Raman'])
  })

  test('the viewer is never named above their own run', () => {
    expect(
      names([
        staffMessage('m1', localIso(2026, 8, 13, 9), ME),
        staffMessage('m2', localIso(2026, 8, 13, 9, 1), ME),
      ]),
    ).toEqual(['m2:-', 'm1:-'])
  })
})

describe('a run is spaced as one column', () => {
  function gaps(messages: Parameters<typeof buildThreadRows>[0]) {
    return buildThreadRows(messages, { viewerId: 'me', namesSenders: false })
      .filter((row) => row.type === 'message')
      .map((row) => `${row.id}:${row.endsRun}`)
  }

  test("only the run's newest message takes the gap below it", () => {
    expect(
      gaps([
        staffMessage('m1', localIso(2026, 8, 13, 9), THEM),
        staffMessage('m2', localIso(2026, 8, 13, 9, 1), THEM),
        staffMessage('m3', localIso(2026, 8, 13, 9, 2), THEM),
      ]),
      // Newest first; m3 ends the run because nothing follows it.
    ).toEqual(['m3:true', 'm2:false', 'm1:false'])
  })

  test('a different sender ends the run below', () => {
    expect(
      gaps([
        staffMessage('m1', localIso(2026, 8, 13, 9), THEM),
        staffMessage('m2', localIso(2026, 8, 13, 9, 1), OTHER),
      ]),
    ).toEqual(['m2:true', 'm1:true'])
  })

  test('a notice ends the run below', () => {
    expect(
      gaps([
        staffMessage('m1', localIso(2026, 8, 13, 9), THEM),
        staffMessage('sys', localIso(2026, 8, 13, 9, 1), ME, 'system'),
      ]),
    ).toEqual(['m1:true'])
  })
})

describe('threadDayMarks', () => {
  const rows: ThreadRow[] = [
    { type: 'message', id: 'c', message: staffMessage('c', '2026-03-02T09:00:00.000Z', THEM), endsRun: true },
    { type: 'day', id: 'day-b', label: 'Today' },
    { type: 'message', id: 'b', message: staffMessage('b', '2026-03-01T10:00:00.000Z', THEM), endsRun: true },
    { type: 'message', id: 'a', message: staffMessage('a', '2026-03-01T09:00:00.000Z', THEM), endsRun: false },
    { type: 'day', id: 'day-a', label: 'Yesterday' },
  ]

  it('gives every row the day it sits under', () => {
    expect(threadDayMarks(rows).map((mark) => mark.label)).toEqual([
      'Today',
      'Today',
      'Yesterday',
      'Yesterday',
      'Yesterday',
    ])
  })

  it('points each row at the divider that begins its day', () => {
    expect(threadDayMarks(rows).map((mark) => mark.dividerIndex)).toEqual([1, 1, 4, 4, 4])
  })

  it('is empty for an empty thread', () => {
    expect(threadDayMarks([])).toEqual([])
  })

  it('never reads undefined for a row with no divider ahead of it', () => {
    const orphan: ThreadRow[] = [
      { type: 'message', id: 'a', message: staffMessage('a', '2026-03-01T09:00:00.000Z', THEM), endsRun: false },
    ]
    expect(threadDayMarks(orphan)).toEqual([{ label: '', dividerIndex: 0 }])
  })
})
