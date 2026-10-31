import {
  parseAdminReport,
  parseAdminReportPage,
  parseReportReceipt,
  parseReportSummary,
} from '@/lib/report-parse'

const ROW = {
  id: 'rpt-1',
  reference: 'RPT-12',
  targetKind: 'wall_post',
  targetId: 'post-1',
  conversationId: null,
  reason: 'harassment',
  details: 'Targets me every day',
  status: 'open',
  action: null,
  resolutionNote: null,
  content: { text: 'You are worthless', attachmentCount: 1, removed: false },
  reporter: { id: 'u-1', name: 'Ada', email: 'ada@x.test', image: null, role: 'customer' },
  reportedUser: { id: 'u-2', name: 'Mallory', email: 'm@x.test', image: null, role: 'customer' },
  handledBy: null,
  availableActions: ['remove_content', 'ban_user', 'dismiss'],
  createdAt: '2026-10-31T10:00:00.000Z',
  resolvedAt: null,
}

describe('reading a report', () => {
  it('reads every field a reviewer acts on', () => {
    expect(parseAdminReport(ROW)).toEqual(ROW)
  })

  it.each([
    ['no id', { ...ROW, id: '' }],
    ['a target kind this build does not know', { ...ROW, targetKind: 'community' }],
    ['a reason this build does not know', { ...ROW, reason: 'rudeness' }],
    ['no time', { ...ROW, createdAt: undefined }],
    ['not an object', 'rpt-1'],
  ])('answers null for %s', (_, data) => {
    expect(parseAdminReport(data)).toBeNull()
  })

  it('drops an action this build does not know rather than drawing a button for it', () => {
    const report = parseAdminReport({ ...ROW, availableActions: ['remove_content', 'escalate'] })
    expect(report?.availableActions).toEqual(['remove_content'])
  })

  it('reads a person who has gone as nobody', () => {
    expect(parseAdminReport({ ...ROW, reporter: null })?.reporter).toBeNull()
  })

  it('reads missing content as nothing captured', () => {
    expect(parseAdminReport({ ...ROW, content: undefined })?.content).toEqual({
      text: null,
      attachmentCount: 0,
      removed: false,
    })
  })
})

describe('reading a page of reports', () => {
  it('keeps the readable rows and drops the rest', () => {
    const page = parseAdminReportPage({ rows: [ROW, { id: 'bad' }], total: 2, page: 1, pageSize: 20 })
    expect(page?.rows.map(row => row.id)).toEqual(['rpt-1'])
    expect(page?.total).toBe(2)
  })

  it('answers null for a body with no rows', () => {
    expect(parseAdminReportPage({ total: 0 })).toBeNull()
  })
})

describe('the receipt and the summary', () => {
  it('reads the receipt a reporter gets back', () => {
    const receipt = { id: 'rpt-1', reference: 'RPT-12', status: 'open', createdAt: '2026-10-31T10:00:00.000Z' }
    expect(parseReportReceipt(receipt)).toEqual(receipt)
  })

  it('reads the summary, counting anything unreadable as zero', () => {
    expect(parseReportSummary({ open: 3, overdue: 'x', oldestOpenAt: null })).toEqual({
      open: 3,
      overdue: 0,
      oldestOpenAt: null,
    })
  })
})
