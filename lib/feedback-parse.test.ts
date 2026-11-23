import {
  parseAdminFeedback,
  parseAdminFeedbackPage,
  parseFeedbackReceipt,
  parseFeedbackSummary,
} from '@/lib/feedback-parse'

const ROW = {
  id: '6f1c2b2e-1d1a-4b8e-9c3a-0c1d2e3f4a5b',
  reference: 'BUG-12',
  kind: 'bug_report',
  status: 'new',
  category: 'messaging',
  severity: 'high',
  rating: null,
  title: 'Composer freezes',
  description: 'Typing a long message freezes the composer.',
  stepsToReproduce: '1. Open a thread',
  expectedBehavior: null,
  actualBehavior: null,
  attachments: [
    { url: '/uploads/feedback/a.png', fileName: 'a.png', mimeType: 'image/png', size: 1200 },
    { url: '', mimeType: 'image/png' },
  ],
  platform: 'android',
  appVersion: '1.1.3',
  allowContact: true,
  response: null,
  resolvedAt: null,
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
  pageUrl: null,
  userAgent: 'ChatRoute/1.1.3',
  locale: 'en-GB',
  viewport: '390x844',
  internalNote: null,
  reporter: { id: 'u-1', name: 'Ada', email: 'ada@x.test', image: null, role: 'customer' },
  handledBy: null,
}

describe('reading an entry', () => {
  test('reads every field a triager is shown', () => {
    const entry = parseAdminFeedback(ROW)
    expect(entry).toMatchObject({
      id: ROW.id,
      reference: 'BUG-12',
      kind: 'bug_report',
      status: 'new',
      category: 'messaging',
      severity: 'high',
      platform: 'android',
      allowContact: true,
      reporter: { name: 'Ada', email: 'ada@x.test' },
      handledBy: null,
    })
  })

  test('drops an attachment it cannot read rather than the entry', () => {
    expect(parseAdminFeedback(ROW)?.attachments).toEqual([
      { url: '/uploads/feedback/a.png', fileName: 'a.png', mimeType: 'image/png', size: 1200 },
    ])
  })

  test.each([
    ['no id', { id: undefined }],
    ['an unknown kind', { kind: 'complaint' }],
    ['an unknown status', { status: 'archived' }],
    ['no title', { title: '' }],
    ['no creation time', { createdAt: null }],
  ])('refuses an entry with %s', (_, patch) => {
    expect(parseAdminFeedback({ ...ROW, ...patch })).toBeNull()
  })

  test('a category, severity or rating this build does not know reads as none', () => {
    const entry = parseAdminFeedback({ ...ROW, category: 'quantum', severity: 'apocalyptic', rating: 9 })
    expect(entry).toMatchObject({ category: null, severity: null, rating: null })
  })

  test('allowContact is true only when the API says exactly true', () => {
    expect(parseAdminFeedback({ ...ROW, allowContact: 'true' })?.allowContact).toBe(false)
  })
})

describe('reading a page', () => {
  test('keeps the rows it can read', () => {
    const page = parseAdminFeedbackPage({ rows: [ROW, { id: 'x' }], total: 2, page: 1, pageSize: 30 })
    expect(page?.rows.map(row => row.reference)).toEqual(['BUG-12'])
    expect(page).toMatchObject({ total: 2, page: 1, pageSize: 30 })
  })

  test('a body without rows is not a page', () => {
    expect(parseAdminFeedbackPage({ total: 0 })).toBeNull()
  })
})

describe('reading the receipt and the summary', () => {
  test('a receipt needs an id and a kind', () => {
    expect(parseFeedbackReceipt(ROW)).toEqual({ id: ROW.id, reference: 'BUG-12', kind: 'bug_report' })
    expect(parseFeedbackReceipt({ reference: 'FB-1' })).toBeNull()
  })

  test('the summary reads both halves and keeps a missing average as none', () => {
    expect(
      parseFeedbackSummary({
        bugReports: { open: 4, new: 2, critical: 1 },
        feedback: { open: 3, new: 1, averageRating: null },
      }),
    ).toEqual({
      bugReports: { open: 4, new: 2, critical: 1 },
      feedback: { open: 3, new: 1, averageRating: null },
    })
    expect(parseFeedbackSummary({ bugReports: {} })).toBeNull()
  })
})
