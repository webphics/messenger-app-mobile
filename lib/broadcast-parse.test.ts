import {
  parseAcknowledgementReport,
  parseBroadcast,
  parseBroadcasts,
} from '@/lib/broadcast-parse'

const ROW = {
  id: 'b1',
  title: 'Maintenance on Friday',
  body: 'The app will be down from 2 to 3am.',
  essential: true,
  requiresAcknowledgement: false,
  audience: { userIds: [], groupIds: ['g1'], communityIds: [], organizationIds: ['o1', 'o2'] },
  recipientCount: 42,
  acknowledgedCount: 0,
  acknowledgedByViewer: false,
  createdBy: { id: 'u1', name: 'Rizwan' },
  sentAt: '2026-10-09T10:00:00.000Z',
}

describe('parseBroadcast', () => {
  it('reads a sent Broadcast', () => {
    expect(parseBroadcast(ROW)).toEqual({
      id: 'b1',
      title: 'Maintenance on Friday',
      body: 'The app will be down from 2 to 3am.',
      essential: true,
      requiresAcknowledgement: false,
      audience: { userIds: [], groupIds: ['g1'], communityIds: [], organizationIds: ['o1', 'o2'] },
      recipientCount: 42,
      acknowledgedCount: 0,
      createdByName: 'Rizwan',
      sentAt: '2026-10-09T10:00:00.000Z',
    })
  })

  it('reads a sender whose account is gone as no name', () => {
    expect(parseBroadcast({ ...ROW, createdBy: null })?.createdByName).toBeNull()
  })

  it.each([
    ['no id', { ...ROW, id: '' }],
    ['no title', { ...ROW, title: undefined }],
    ['no body', { ...ROW, body: '' }],
    ['no sent time', { ...ROW, sentAt: null }],
    ['not a record', 'hello'],
  ])('drops a row with %s', (_case, value) => {
    expect(parseBroadcast(value)).toBeNull()
  })
})

describe('parseBroadcasts', () => {
  it('keeps the readable rows and drops the rest', () => {
    expect(parseBroadcasts([ROW, { id: 'broken' }])?.map((row) => row.id)).toEqual(['b1'])
  })

  it('reads a body that is not a list as malformed, never as an empty history', () => {
    expect(parseBroadcasts({ rows: [ROW] })).toBeNull()
  })
})

describe('parseAcknowledgementReport', () => {
  it('reads who has and has not confirmed', () => {
    const report = parseAcknowledgementReport({
      broadcastId: 'b1',
      requiresAcknowledgement: true,
      recipientCount: 2,
      acknowledgedCount: 1,
      recipients: [
        { user: { id: 'u2', name: 'Ana' }, userId: 'u2', acknowledgedAt: '2026-10-09T11:00:00.000Z' },
        { user: null, userId: 'u3', acknowledgedAt: null },
      ],
    })
    expect(report?.recipients).toEqual([
      { userId: 'u2', name: 'Ana', acknowledgedAt: '2026-10-09T11:00:00.000Z' },
      { userId: 'u3', name: null, acknowledgedAt: null },
    ])
    expect(report?.acknowledgedCount).toBe(1)
  })

  it('answers null for a report with no recipient list', () => {
    expect(parseAcknowledgementReport({ broadcastId: 'b1' })).toBeNull()
  })
})
