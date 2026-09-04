/**
 * What the Store is allowed to keep, and which threads lose history when it
 * keeps too much.
 *
 * Pure, and deliberately on this side of the native boundary: nothing here
 * imports `expo-sqlite`, so the rule that decides which threads a phone still
 * holds a history for is a table of cases rather than something only a device
 * can demonstrate. What is on the other side — the query that counts, the
 * transaction that deletes — is `lib/conversation-store.ts`, the same split
 * `attachment-budget` and `attachment-cache` make for the filesystem.
 *
 * ## The rule is asymmetric on purpose
 *
 * Every Conversation row is kept, always. A partial list is a list that lies
 * about which conversations exist, and the list is cheap — a row per thread and
 * no history in it. So nothing here can name a conversation: a plan is threads
 * to take Messages *from*, and a thread that has none is not in it at all.
 *
 * Messages are the opposite. A phone used for support accumulates every thread
 * anybody ever opened, and the API load this exists to remove comes from the
 * handful of threads people actually revisit — so those keep deep history and
 * the rest keep none. A thread whose Messages went still appears in the list;
 * opening it fetches, the same as a thread never opened.
 *
 * Discarding is always safe, and that is the whole reason this rule may be as
 * blunt as it is. Everything it can reach is a copy of something the API will
 * send again, so a thread that was emptied costs a request and never a message.
 * The Outbox is the one thing in the Store that is *not* a copy — a message this
 * device is still carrying that the server may never have heard — and it is out
 * of reach here by construction: a plan names threads in the `messages` table,
 * which holds confirmed Messages and nothing else, and the Outbox is a table of
 * its own. Nothing needs to exempt it, the way nothing needs to exempt a
 * Conversation.
 */

/**
 * How many threads keep a history: the handful anybody revisits, with room to
 * spare. A support phone touches far more conversations than this in a week and
 * re-reads almost none of them.
 */
export const RETAINED_THREADS = 20

/**
 * How deep each of those goes. One `MESSAGE_PAGE_LIMIT`, which is the page a
 * thread opens on — so a thread that has been read and not scrolled is kept
 * exactly as it was read, and only a thread somebody paged back through is ever
 * shortened at all.
 */
export const RETAINED_MESSAGES_PER_THREAD = 50

/** One thread's Messages, as the accounting sees them. */
export type StoredThread = {
  conversationId: string
  /**
   * When the *conversation* was last active, in epoch milliseconds — the row's
   * `lastMessageAt`, not the newest Message this device happens to hold. The two
   * part company on exactly the threads worth keeping: one that has been busy
   * all morning while the person was reading something else holds Messages from
   * yesterday and is the next thread they will open.
   *
   * A conversation nobody has written in yet reports 0, which sorts last — the
   * same place `sortConversations` puts it.
   */
  activityAt: number
  /** How many Messages this device holds for it. Never negative, often zero. */
  messageCount: number
}

/** Which threads lose history, and how much of it. Empty means nothing to do. */
export type EvictionPlan = {
  /** Threads that lose every Message they hold. */
  drop: string[]
  /** Threads that keep their newest `keepMessages` and lose the rest. */
  shorten: string[]
}

export type EvictionOptions = {
  /**
   * A thread that must not be chosen, whatever its activity — the one whose
   * write this plan follows.
   *
   * It is the thread on screen: memory is still holding its Messages, its
   * frontier is still moving, and the next state change would write back
   * everything taken from it. Evicting it would be a write that undoes itself.
   * It is collected by the next write of some other thread, which is what
   * navigating away from it does.
   *
   * Spared from being chosen, not from being counted: it holds its place in the
   * ranking, so sparing it never lets a twenty-first thread keep its history.
   */
  spare?: string
  keepThreads?: number
  keepMessages?: number
}

const NOTHING: EvictionPlan = { drop: [], shorten: [] }

/**
 * Which threads lose history so the Store stays inside its limits.
 *
 * Ranked by conversation activity, newest first, with the id breaking a tie so
 * one Store is always evicted one way. The first `keepThreads` keep a history
 * and are shortened to `keepMessages`; everything behind them keeps none.
 *
 * Answers rather than acts, like `keysToEvict` next door: the list handed in is
 * left in the order it arrived, and what comes back is a plan for somebody else
 * to apply.
 */
export function planEviction(
  threads: readonly StoredThread[],
  options: EvictionOptions = {},
): EvictionPlan {
  const {
    spare,
    keepThreads = RETAINED_THREADS,
    keepMessages = RETAINED_MESSAGES_PER_THREAD,
  } = options

  // A thread holding nothing is not a thread this can do anything about, and
  // counting it would let an emptied row hold a place a real history wants.
  const held = threads.filter((one) => one.messageCount > 0)
  if (held.length === 0) return NOTHING

  // Copied before sorting: the caller's list is a query's answer, and reordering
  // it under them would be a surprise from a function that only reports.
  const ranked = held
    .slice()
    .sort((a, b) => b.activityAt - a.activityAt || a.conversationId.localeCompare(b.conversationId))

  const plan: EvictionPlan = { drop: [], shorten: [] }
  for (const [rank, one] of ranked.entries()) {
    if (one.conversationId === spare) continue
    if (rank >= keepThreads) plan.drop.push(one.conversationId)
    else if (one.messageCount > keepMessages) plan.shorten.push(one.conversationId)
  }
  return plan
}
