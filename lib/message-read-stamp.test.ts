import { readStampLabel } from '@/lib/message-read-stamp'

function localIso(hour: number, minute = 0): string {
  return new Date(2026, 7, 13, hour, minute).toISOString()
}

const SENT = localIso(9, 3)

describe('readStampLabel', () => {
  test('an incoming message states when it arrived and asks nothing', () => {
    expect(
      readStampLabel({ isMine: false, status: 'read', createdAt: SENT, receipts: null }),
    ).toMatch(/^9[:.]03/)
  })

  test('a read message states when it was read, not when it was sent', () => {
    const label = readStampLabel({
      isMine: true,
      status: 'read',
      createdAt: SENT,
      receipts: { readBy: [{ user: null, at: localIso(9, 8) }], deliveredTo: [] },
    })
    expect(label).toMatch(/^Seen 9[:.]08/)
  })

  test('the last reader is the one it names', () => {
    const label = readStampLabel({
      isMine: true,
      status: 'read',
      createdAt: SENT,
      receipts: {
        readBy: [
          { user: null, at: localIso(9, 8) },
          { user: null, at: localIso(9, 20) },
          { user: null, at: localIso(9, 11) },
        ],
        deliveredTo: [],
      },
    })
    expect(label).toMatch(/^Seen 9[:.]20/)
  })

  test('delivered but unread states the delivery', () => {
    const label = readStampLabel({
      isMine: true,
      status: 'delivered',
      createdAt: SENT,
      receipts: { readBy: [], deliveredTo: [{ user: null, at: localIso(9, 5) }] },
    })
    expect(label).toMatch(/^Delivered 9[:.]05/)
  })

  test('nobody has reached it yet', () => {
    expect(
      readStampLabel({
        isMine: true,
        status: 'sent',
        createdAt: SENT,
        receipts: { readBy: [], deliveredTo: [] },
      }),
    ).toMatch(/^Sent 9[:.]03/)
  })

  test('before the answer arrives it still says something', () => {
    expect(
      readStampLabel({ isMine: true, status: 'sent', createdAt: SENT, receipts: null }),
    ).toMatch(/^Sent 9[:.]03/)
  })
})
