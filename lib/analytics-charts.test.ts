import { analyticsCharts, weekOverWeekDelta } from '@/lib/analytics-charts'
import type { AnalyticsOverview, AnalyticsSeriesPoint } from '@/lib/types'

function days(values: number[][]): AnalyticsSeriesPoint[] {
  return values.map(([conversationsOpened, messagesSent], i) => ({
    date: `2026-09-${String(i + 1).padStart(2, '0')}`,
    conversationsOpened: conversationsOpened ?? 0,
    messagesSent: messagesSent ?? 0,
  }))
}

function overview(patch: Partial<AnalyticsOverview> = {}): AnalyticsOverview {
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
    series: days([
      [1, 10],
      [2, 20],
    ]),
    ...patch,
  }
}

describe('weekOverWeekDelta', () => {
  it('compares the last seven days against the seven before them', () => {
    const previous = [1, 1, 1, 1, 1, 1, 1] // 7
    const recent = [2, 2, 2, 2, 2, 2, 2] // 14
    expect(weekOverWeekDelta([...previous, ...recent])).toBe('+7 vs last week')
  })

  it('reads a decline with an ASCII hyphen, which is what the card tints on', () => {
    const delta = weekOverWeekDelta([...Array(7).fill(3), ...Array(7).fill(1)])
    expect(delta).toBe('-14 vs last week')
    expect(delta.startsWith('-')).toBe(true)
  })
})

describe('analyticsCharts', () => {
  /**
   * A Shared queue has no holder, so Unassigned and Engaged are not two states
   * of anything there: they are one, Open.
   */
  it.each([
    ['assignment on, the three states it has', true, overview().snapshot, '16', [
      { label: 'Unassigned', value: 2 },
      { label: 'Engaged', value: 5 },
      { label: 'Closed', value: 9 },
    ]],
    // Deliberately not unassigned + engaged, so the row shows which one was read.
    ['a Shared queue, Open against Closed from the count the API sent', false, { ...overview().snapshot, open: 8 }, '17', [
      { label: 'Open', value: 8 },
      { label: 'Closed', value: 9 },
    ]],
  ])('slices the queue mix: %s', (_label, supportAssignment, snapshot, value, slices) => {
    const queue = analyticsCharts(overview({ snapshot }), supportAssignment)[2]
    expect(queue).toMatchObject({ id: 'queue-mix', kind: 'pie', value })
    expect(queue?.slices).toEqual(slices)
    expect(queue?.series).toEqual(slices.map(slice => slice.value))
  })

  /**
   * The rule the module exists to keep: `closed` may exceed `opened` when a team
   * works down a backlog, so the pair is not a whole and must never be drawn as
   * slices of one.
   */
  it('never draws opened against closed as a pie', () => {
    const backlog = analyticsCharts(overview({ resolution: { opened: 1, closed: 40 } }), true)[3]
    expect(backlog).toMatchObject({ id: 'resolution', kind: 'bar', value: '40' })
    expect(backlog?.slices).toBeUndefined()
    expect(backlog?.series).toEqual([1, 40])
  })
})

