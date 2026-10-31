import { parseAdminReport, type AdminReport } from '@/lib/report-parse'
import {
  isReportOverdue,
  reportAge,
  reportSummaryLine,
  withResolvedReport,
} from '@/lib/report-queue'

const NOW = Date.parse('2026-10-31T12:00:00.000Z')
const HOUR = 60 * 60 * 1000

function report(overrides: Record<string, unknown> = {}): AdminReport {
  return parseAdminReport({
    id: 'rpt-1',
    targetKind: 'message',
    targetId: 'msg-1',
    reason: 'spam',
    status: 'open',
    createdAt: new Date(NOW - HOUR).toISOString(),
    availableActions: ['dismiss'],
    ...overrides,
  })!
}

describe('overdue', () => {
  it.each([
    ['open for an hour', { createdAt: new Date(NOW - HOUR).toISOString() }, false],
    ['open for a day exactly', { createdAt: new Date(NOW - 24 * HOUR).toISOString() }, true],
    ['open for two days', { createdAt: new Date(NOW - 48 * HOUR).toISOString() }, true],
    ['actioned after two days', { createdAt: new Date(NOW - 48 * HOUR).toISOString(), status: 'actioned' }, false],
  ])('%s', (_, overrides, expected) => {
    expect(isReportOverdue(report(overrides), NOW)).toBe(expected)
  })
})

describe('how long a report has waited', () => {
  it.each([
    [0, 'just now'],
    [12 * 60 * 1000, '12 min'],
    [5 * HOUR, '5 h'],
    [72 * HOUR, '3 d'],
  ])('%i ms reads as %s', (ago, expected) => {
    expect(reportAge(new Date(NOW - ago).toISOString(), NOW)).toBe(expected)
  })
})

describe('the Hub row', () => {
  it.each([
    [null, 'Reported posts, messages and groups'],
    [{ open: 0, overdue: 0, oldestOpenAt: null }, 'Nothing waiting for review'],
    [{ open: 3, overdue: 0, oldestOpenAt: null }, '3 open'],
    [{ open: 3, overdue: 2, oldestOpenAt: null }, '2 overdue · 3 open'],
  ])('%j says %s', (summary, expected) => {
    expect(reportSummaryLine(summary)).toBe(expected)
  })
})

describe('the queue after an action', () => {
  it('drops a report that left the tab', () => {
    const rows = [report({ id: 'a' }), report({ id: 'b' })]
    const resolved = report({ id: 'a', status: 'actioned' })
    expect(withResolvedReport(rows, resolved, 'open').map(row => row.id)).toEqual(['b'])
  })

  it('replaces a report that stays in the tab', () => {
    const rows = [report({ id: 'a', status: 'actioned' })]
    const resolved = report({ id: 'a', status: 'actioned', action: 'ban_user' })
    expect(withResolvedReport(rows, resolved, 'actioned')[0]?.action).toBe('ban_user')
  })
})
