import { parseAnalyticsOverview, parseAnalyticsSeriesPoint } from '@/lib/analytics-parse'

function payload(patch: Record<string, unknown> = {}) {
  return {
    range: { from: '2026-08-21T00:00:00.000Z', to: '2026-09-19T23:59:59.999Z' },
    snapshot: {
      unassigned: 2,
      engaged: 5,
      closed: 9,
      open: 7,
      awaitingReply: 3,
      groups: 3,
      users: { admin: 1, agent: 4, customer: 25 },
    },
    resolution: { opened: 11, closed: 14 },
    series: [{ date: '2026-09-18', conversationsOpened: 1, messagesSent: 10 }],
    ...patch,
  }
}

describe('parseAnalyticsSeriesPoint', () => {
  it.each([
    ['a missing count', { date: '2026-09-18', conversationsOpened: 1 }],
  ])('refuses %s', (_label, input) => {
    expect(parseAnalyticsSeriesPoint(input)).toBeNull()
  })
})

describe('parseAnalyticsOverview', () => {
  it('reads a whole overview', () => {
    expect(parseAnalyticsOverview(payload())).toEqual(payload())
  })

  /**
   * The rule this parser exists for: a count is never defaulted. A zero drawn
   * because a field was absent is a claim that nothing happened, which on a
   * chart an Admin reads as a fact about their desk.
   */
  it.each([
    ['snapshot', { snapshot: { unassigned: 2, engaged: 5, closed: 9, groups: 3 } }],
    ['resolution', { resolution: { opened: 11 } }],
  ])('refuses the whole overview when %s is incomplete, rather than zeroing it', (_l, patch) => {
    expect(parseAnalyticsOverview(payload(patch))).toBeNull()
  })

  /**
   * `open` and `awaitingReply` arrived after the rest of the snapshot, so an API
   * that predates them is not an unreadable one. Unknown is null, never zero,
   * and the overview around it still draws.
   */
  it.each([
    ['both unreadable', { open: '7', awaitingReply: -1 }, { open: null, awaitingReply: null }],
  ])('reads the later snapshot counts with %s', (_label, fields, expected) => {
    const base = { unassigned: 2, engaged: 5, closed: 9, groups: 3, users: { admin: 1, agent: 4, customer: 25 } }
    const parsed = parseAnalyticsOverview(payload({ snapshot: { ...base, ...fields } }))
    expect(parsed?.snapshot).toEqual({ ...base, ...expected })
  })

  it('drops a day it cannot read rather than failing the overview for it', () => {
    const parsed = parseAnalyticsOverview(
      payload({
        series: [
          { date: '2026-09-18', conversationsOpened: 1, messagesSent: 10 },
          { date: 'yesterday', conversationsOpened: 2, messagesSent: 20 },
          { date: '2026-09-19', conversationsOpened: 3, messagesSent: 30 },
        ],
      }),
    )
    expect(parsed?.series.map(point => point.date)).toEqual(['2026-09-18', '2026-09-19'])
  })
})
