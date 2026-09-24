import { analyticsChartById, analyticsCharts, weekOverWeekDelta } from '@/lib/analytics-charts'
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
  it('says how much ground it covers when there are not two weeks to compare', () => {
    expect(weekOverWeekDelta([1, 2, 3])).toBe('Last 3 days')
    expect(weekOverWeekDelta([1])).toBe('Last 1 day')
    expect(weekOverWeekDelta([])).toBe('Last 0 days')
  })

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

  it('does not call an unchanged week a rise', () => {
    expect(weekOverWeekDelta(Array(14).fill(4))).toBe('Level vs last week')
  })

  it('ignores days before the two weeks it compares', () => {
    const ancient = Array(30).fill(99)
    const previous = Array(7).fill(1)
    const recent = Array(7).fill(1)
    expect(weekOverWeekDelta([...ancient, ...previous, ...recent])).toBe('Level vs last week')
  })
})

describe('analyticsCharts', () => {
  it('draws one card per thing the overview actually answers', () => {
    expect(analyticsCharts(overview(), true).map(chart => chart.id)).toEqual([
      'conversations-opened',
      'messages-sent',
      'queue-mix',
      'resolution',
      'people',
    ])
  })

  it('carries no Offer taps, which nothing in the API ever answered', () => {
    expect(analyticsCharts(overview(), true).map(chart => chart.id)).not.toContain('offers-taps')
  })

  it('totals each per-day series rather than showing its last point', () => {
    const charts = analyticsCharts(overview({ series: days([[1, 10], [2, 20], [3, 30]]) }), true)
    expect(charts[0]).toMatchObject({ id: 'conversations-opened', value: '6', series: [1, 2, 3] })
    expect(charts[1]).toMatchObject({ id: 'messages-sent', value: '60', series: [10, 20, 30] })
  })

  it('slices the queue only where the parts really make the whole', () => {
    const queue = analyticsCharts(overview(), true)[2]
    expect(queue).toMatchObject({ kind: 'pie', value: '16' })
    expect(queue?.slices).toEqual([
      { label: 'Unassigned', value: 2 },
      { label: 'Engaged', value: 5 },
      { label: 'Closed', value: 9 },
    ])
  })

  it('draws the same five cards in a Shared queue', () => {
    expect(analyticsCharts(overview(), false).map(chart => chart.id)).toEqual(
      analyticsCharts(overview(), true).map(chart => chart.id),
    )
  })

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
    ['assignment on, ignoring an open count it does not draw', true, { ...overview().snapshot, open: 40 }, '16', [
      { label: 'Unassigned', value: 2 },
      { label: 'Engaged', value: 5 },
      { label: 'Closed', value: 9 },
    ]],
    // Deliberately not unassigned + engaged, so the row shows which one was read.
    ['a Shared queue, Open against Closed from the count the API sent', false, { ...overview().snapshot, open: 8 }, '17', [
      { label: 'Open', value: 8 },
      { label: 'Closed', value: 9 },
    ]],
    ['a Shared queue on an API with no open count, which is the sum it replaced', false, { ...overview().snapshot, open: null }, '16', [
      { label: 'Open', value: 7 },
      { label: 'Closed', value: 9 },
    ]],
    ['a Shared queue keeping a zero the API really sent', false, { ...overview().snapshot, open: 0 }, '9', [
      { label: 'Open', value: 0 },
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

  it('counts every account for People and names the desk beside it', () => {
    expect(analyticsCharts(overview(), true)[4]).toMatchObject({
      id: 'people',
      kind: 'donut',
      value: '30',
      deltaLabel: '4 on the desk',
    })
  })

  it.each([true, false])('survives a range with nothing in it rather than drawing no cards (assignment %s)', supportAssignment => {
    const empty = analyticsCharts(
      overview({
        series: [],
        resolution: { opened: 0, closed: 0 },
        snapshot: {
          unassigned: 0,
          engaged: 0,
          closed: 0,
          open: 0,
          awaitingReply: 0,
          groups: 0,
          users: { admin: 0, agent: 0, customer: 0 },
        },
      }),
      supportAssignment,
    )
    expect(empty).toHaveLength(5)
    expect(empty.every(chart => chart.value === '0')).toBe(true)
  })

  it('says "1 group" rather than "1 groups"', () => {
    const one = analyticsCharts(overview({ snapshot: { ...overview().snapshot, groups: 1 } }), true)[2]
    expect(one?.deltaLabel).toBe('1 group')
  })
})

describe('analyticsChartById', () => {
  const charts = analyticsCharts(overview(), true)

  it('finds the chart a card opened', () => {
    expect(analyticsChartById(charts, 'people')?.title).toBe('People')
  })

  it('answers nothing for an id no overview produces', () => {
    expect(analyticsChartById(charts, 'offers-taps')).toBeUndefined()
    expect(analyticsChartById([], 'people')).toBeUndefined()
  })
})
