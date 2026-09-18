import type { AnalyticsOverview, AnalyticsSeriesPoint, ChartMetric } from '@/lib/types'

/**
 * One analytics overview, as the cards the Admin Hub already draws.
 *
 * Pure, and a table of cases rather than something a running server has to
 * demonstrate — the same split `lib/wall-card` and `lib/store-eviction` are
 * built on. `ChartMetric` is unchanged: it is what `ChartCard`, `MetricChart`
 * and `ChartDetail` render, and the point of this module is that the API's shape
 * arrives in it rather than those three learning a second one.
 *
 * Five charts, not the six that were mocked. `Offer taps` is gone with the
 * Offers section it counted, and nothing in the API ever answered it. What is
 * left is only what `GET /analytics/overview` really carries:
 *
 * - two per-day series it sends outright, drawn over time;
 * - two counts that genuinely partition a whole, drawn as slices;
 * - one pair that does not partition anything, drawn as two bars.
 *
 * That last distinction is the one worth keeping. A pie is a claim that its
 * slices are the parts of something, so `opened` and `closed` must not be one:
 * the API's own schema says `closed` may exceed `opened` when a team works down
 * a backlog, and a pie of the two would draw a range that resolved more than
 * arrived as though something were missing.
 */

/** Days on each side of the week-over-week comparison. */
const COMPARISON_WINDOW_DAYS = 7

function total(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0)
}

/**
 * The most recent week against the one before it, in words.
 *
 * Computed from the series already fetched rather than from a second request for
 * the previous period: the range the Hub asks for is thirty days, so both weeks
 * are inside what already arrived. A range too short to hold both is not
 * compared at all — it says how much ground it covers instead, which is the
 * honest answer and reads as neutral on the card rather than as a rise or a fall.
 *
 * The sign is an ASCII hyphen, deliberately: `ChartCard` tints on
 * `startsWith('-')`, so a typographic minus would have drawn every decline in
 * the neutral grey — which is what the mocked `−2 vs last week` did.
 */
export function weekOverWeekDelta(values: readonly number[]): string {
  if (values.length < COMPARISON_WINDOW_DAYS * 2) {
    return `Last ${values.length} ${values.length === 1 ? 'day' : 'days'}`
  }

  const recent = total(values.slice(-COMPARISON_WINDOW_DAYS))
  const previous = total(values.slice(-COMPARISON_WINDOW_DAYS * 2, -COMPARISON_WINDOW_DAYS))
  const change = recent - previous

  if (change === 0) return 'Level vs last week'
  return `${change > 0 ? '+' : '-'}${Math.abs(change)} vs last week`
}

function conversationsOpened(series: readonly AnalyticsSeriesPoint[]): number[] {
  return series.map(point => point.conversationsOpened)
}

function messagesSent(series: readonly AnalyticsSeriesPoint[]): number[] {
  return series.map(point => point.messagesSent)
}

export function analyticsCharts(overview: AnalyticsOverview): ChartMetric[] {
  const { series, snapshot, resolution } = overview
  const opened = conversationsOpened(series)
  const messages = messagesSent(series)
  const { admin, agent, customer } = snapshot.users

  return [
    {
      id: 'conversations-opened',
      title: 'Conversations opened',
      hint: 'Every conversation started in this range, a day at a time.',
      value: String(total(opened)),
      deltaLabel: weekOverWeekDelta(opened),
      kind: 'bar',
      series: opened,
    },
    {
      id: 'messages-sent',
      title: 'Messages sent',
      hint: 'Every message written in this range, a day at a time.',
      value: String(total(messages)),
      deltaLabel: weekOverWeekDelta(messages),
      kind: 'line',
      series: messages,
    },
    {
      /*
       * Right now, not the range — `snapshot` is a current reading that happens
       * to travel in a ranged response (the API's own schema doc), and the hint
       * says so rather than letting the card inherit the range beside it.
       */
      id: 'queue-mix',
      title: 'Queue mix',
      hint: 'Support conversations right now, by where they stand.',
      value: String(snapshot.unassigned + snapshot.engaged + snapshot.closed),
      deltaLabel: `${snapshot.groups} ${snapshot.groups === 1 ? 'group' : 'groups'}`,
      kind: 'pie',
      series: [snapshot.unassigned, snapshot.engaged, snapshot.closed],
      slices: [
        { label: 'Unassigned', value: snapshot.unassigned },
        { label: 'Engaged', value: snapshot.engaged },
        { label: 'Closed', value: snapshot.closed },
      ],
    },
    {
      /*
       * Two bars rather than two slices. See the module doc: `closed` may exceed
       * `opened`, so the pair is not a whole and must not be drawn as one.
       */
      id: 'resolution',
      title: 'Opened vs closed',
      hint: 'What arrived in this range, against what was resolved in it. A team working down a backlog closes more than arrived.',
      value: String(resolution.closed),
      deltaLabel: `${resolution.opened} opened`,
      kind: 'bar',
      series: [resolution.opened, resolution.closed],
    },
    {
      id: 'people',
      title: 'People',
      hint: 'Every account on the product right now, by role.',
      value: String(admin + agent + customer),
      deltaLabel: `${agent} on the desk`,
      kind: 'donut',
      series: [admin, agent, customer],
      slices: [
        { label: 'Admins', value: admin },
        { label: 'Agents', value: agent },
        { label: 'Customers', value: customer },
      ],
    },
  ]
}

/**
 * One chart by id, for the detail screen a card opens.
 *
 * Takes the charts rather than the overview they came from, because that is what
 * the screen has: `lib/use-analytics` maps once on the way in, and re-mapping an
 * overview per lookup would build five charts to return one.
 */
export function analyticsChartById(
  charts: readonly ChartMetric[],
  id: string,
): ChartMetric | undefined {
  return charts.find(chart => chart.id === id)
}
