import { isOutgoing, isSystemMessage, messageSenderName } from '@/lib/thread-state'
import { formatDayLabel, shouldShowDayDivider } from '@/lib/message-day'
import type { Message } from '@/lib/types'

/**
 * What a thread draws, in the order an inverted list wants it.
 *
 * Pure, and separate from the screen, because the decisions in it are worth
 * stating once and testing as a table: where a day divider goes, whose name sits
 * above a bubble, and which messages are not bubbles at all.
 *
 * The rows come back newest first. `ThreadScreen`'s list is inverted — the
 * newest message is at offset 0 and scrolling *up* is scrolling towards the end
 * of the data — so the reversal belongs with the rows rather than at the
 * FlatList, where it would have to be undone to reason about anything.
 */

export type ThreadRow =
  | { type: 'day'; id: string; label: string }
  /** An Engage, Takeover or Transfer notice. A statement about the thread, not a message in it. */
  | { type: 'system'; id: string; message: Message }
  | { type: 'message'; id: string; message: Message; senderName?: string }

export type ThreadRowOptions = {
  viewerId: string
  /** Whether an incoming bubble is captioned with who sent it. Groups do; two-sided threads do not. */
  namesSenders: boolean
}

/**
 * The rows for a thread, newest first.
 *
 * A `system` message becomes its own row rather than a bubble with different
 * paint. It is the company's record of an assignment — engaged, taken over,
 * transferred — and it belongs to the thread rather than to either side of it,
 * so it carries no sender, no side and no receipt. A Customer never sees one at
 * all: `visibleMessages` has already dropped them by the time a thread gets
 * here, and the API withheld them before that.
 *
 * A day divider still precedes one. The notice happened on a day like anything
 * else, and skipping the divider for it would put a message under yesterday's
 * heading.
 */
export function buildThreadRows(
  messages: Message[],
  { viewerId, namesSenders }: ThreadRowOptions,
): ThreadRow[] {
  const rows: ThreadRow[] = []

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]!
    const previous = messages[i - 1]

    if (shouldShowDayDivider(message.createdAt, previous?.createdAt)) {
      rows.push({ type: 'day', id: `day-${message.id}`, label: formatDayLabel(message.createdAt) })
    }

    if (isSystemMessage(message)) {
      rows.push({ type: 'system', id: message.id, message })
      continue
    }

    rows.push({
      type: 'message',
      id: message.id,
      message,
      senderName:
        namesSenders && !isOutgoing(message, viewerId) ? messageSenderName(message) : undefined,
    })
  }

  return rows.reverse()
}

/** The day a row belongs to, and the row that begins it. */
export type ThreadDayMark = { label: string; dividerIndex: number }

/**
 * For every row, which day it is in and where that day starts.
 *
 * The floating day pill needs two things from a scroll position: what to say,
 * and where to go when it is tapped. Both are a property of the rows rather than
 * of the list drawing them, so they are worked out here once instead of being
 * rediscovered on every scroll frame.
 *
 * `rows` is newest-first and a day's divider is pushed before its messages, so
 * after the reversal the divider sits *after* them — which is why this scans
 * forward from each row rather than back. A row with no divider ahead of it
 * cannot occur in rows built by `buildThreadRows`, since every run of messages
 * begins with one; it is answered with the row's own index and an empty label
 * rather than a gap, so a caller indexing this array never reads undefined.
 */
export function threadDayMarks(rows: ThreadRow[]): ThreadDayMark[] {
  const marks = new Array<ThreadDayMark>(rows.length)
  let ahead: ThreadDayMark | null = null

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]!
    if (row.type === 'day') ahead = { label: row.label, dividerIndex: i }
    marks[i] = ahead ?? { label: '', dividerIndex: i }
  }

  return marks
}
