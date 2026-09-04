import * as SQLite from 'expo-sqlite'

import {
  planEviction,
  RETAINED_MESSAGES_PER_THREAD,
  type StoredThread,
} from '@/lib/store-eviction'
import {
  fromConversationRows,
  fromMessageRows,
  fromOrganizationRows,
  messageOrder,
  toConversationRows,
  toMessageRows,
  toOrganizationRows,
  NOTHING_RESTORED,
  STORE_SCHEMA_VERSION,
  type RestoredStore,
  type ThreadPaging,
} from '@/lib/store-rows'
import type { Conversation, Message } from '@/lib/types'

/**
 * The Store on disk: the only file in this app that knows SQLite exists.
 *
 * Everything about *what* is written is next door in `lib/store-rows.ts`, which
 * imports nothing native and is table-tested without a mock. What is here is the
 * connection, the schema, the transaction and the queue — the parts that need a
 * device, and so the parts that are mocked at the `expo-sqlite` boundary the way
 * `lib/attachment-cache.test.ts` mocks `expo-file-system`. See ADR-0008.
 *
 * ## Nothing here can fail a screen
 *
 * Persistence is subordinate to the app working. A database that will not open,
 * a query that throws, a transaction that is rolled back: each of them is
 * swallowed. The in-memory Store is still correct, and the only cost is that the
 * next Restore is poorer. There is no error a person sees, because there is
 * nothing a person could do about one.
 *
 * ## Reads are synchronous, writes are not
 *
 * Restore is `getAllSync`, deliberately: a cold start reads the list *before*
 * the first screen renders, which is the whole point of it, and an await there
 * would put an empty frame in front of the thing this exists to avoid. It is one
 * indexed read of one small table, once per sign-in.
 *
 * Writes are the opposite. They happen on every state change, they must not be
 * on the render path, and nobody is waiting for them — so they are queued,
 * coalesced to the newest state per person, and run one transaction at a time.
 *
 * ## Two things are written, and they are written by different people
 *
 * The Conversation list is one unit and is replaced whole. A thread's Messages
 * are per thread and are added to, because a Message that has been confirmed
 * does not leave the thread it is in — what changes is its receipts, and an
 * upsert by id says exactly that. So the two have separate queues, separate
 * transactions and separate coalescing, and the only thing they share is the
 * `conversations` row that carries a thread's paging: written whole by the list
 * and one column at a time by the thread, which is why the paging is also held
 * in memory here. See `frontiers`.
 */

const DATABASE_NAME = 'enki-store.db'

/**
 * Created only on a database this build has just made. A database whose version
 * matches was created by this schema, so there is nothing here to run against
 * one, and a database whose version does not match is deleted rather than
 * altered — see `open`.
 */
const SCHEMA = `
  CREATE TABLE conversations (
    id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    has_more INTEGER NOT NULL DEFAULT 1,
    cursor TEXT,
    activity_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (owner_id, id)
  );
  CREATE TABLE organizations (
    id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (owner_id, id)
  );
  CREATE TABLE messages (
    id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (owner_id, conversation_id, id)
  );
  CREATE INDEX messages_by_thread
    ON messages (owner_id, conversation_id, created_at DESC, id DESC);
  PRAGMA user_version = ${STORE_SCHEMA_VERSION};
`

/**
 * The connection, or null when there is not going to be one.
 *
 * `undefined` is "not tried yet" and `null` is "tried and cannot" — a device
 * that refuses to open a database is not asked again on every state change.
 */
let connection: SQLite.SQLiteDatabase | null | undefined

function connect(): SQLite.SQLiteDatabase | null {
  if (connection !== undefined) return connection

  try {
    connection = open()
  } catch {
    connection = null
  }
  return connection
}

/**
 * The database, at the schema this build understands.
 *
 * Migration is discard, not transform. A version this build does not recognise —
 * older, because it predates a column, or newer, because a build after this one
 * wrote it — is deleted outright and made again empty. The whole file, not the
 * tables in it: a newer schema's tables are ones this build cannot name, and
 * dropping only the ones it can would leave them behind to be misread by the
 * next build that recognises the version stamped over them.
 *
 * The cost is one cold start's worth of Stale data. The alternative is a
 * migration path that can go wrong on a person's phone, for data that is a copy
 * of what the API will send again anyway.
 */
function open(): SQLite.SQLiteDatabase {
  const existing = SQLite.openDatabaseSync(DATABASE_NAME)
  if (schemaVersion(existing) === STORE_SCHEMA_VERSION) return existing

  existing.closeSync()
  SQLite.deleteDatabaseSync(DATABASE_NAME)

  const fresh = SQLite.openDatabaseSync(DATABASE_NAME)
  fresh.execSync(SCHEMA)
  return fresh
}

/** A database nobody has stamped answers 0, which is no version this build knows. */
function schemaVersion(database: SQLite.SQLiteDatabase): number {
  const row = database.getFirstSync<{ user_version: number }>('PRAGMA user_version')
  return typeof row?.user_version === 'number' ? row.user_version : 0
}

/**
 * A state of the Conversation list, as a write is given it.
 *
 * Organization names ride along rather than being written on their own, because
 * they change with the same fetch the list changes with — a Customer's load
 * answers with both — and writing them together is what keeps a Restored row's
 * title the title it had.
 */
export type StoreSnapshot = {
  conversations: readonly Conversation[]
  organizationNames: ReadonlyMap<string, string>
}

/** The newest state each person is waiting to have written. One entry, not a backlog. */
const queued = new Map<string, StoreSnapshot>()

/**
 * What is last known to be on disk for a person, by identity.
 *
 * Both halves, not the conversations alone: a state that changed only the
 * organization names — a Customer's second request answering after the first —
 * is still a state the disk does not have.
 */
const written = new Map<string, { conversations: unknown; organizationNames: unknown }>()

function alreadyWritten(ownerId: string, snapshot: StoreSnapshot): boolean {
  const last = written.get(ownerId)
  return (
    last?.conversations === snapshot.conversations &&
    last.organizationNames === snapshot.organizationNames
  )
}

function markWritten(ownerId: string, snapshot: StoreSnapshot): void {
  written.set(ownerId, {
    conversations: snapshot.conversations,
    organizationNames: snapshot.organizationNames,
  })
}

/**
 * How far back each thread has been read, by owner and then by conversation.
 *
 * The `conversations` row carries a thread's paging, and two different things
 * change it: the list, which replaces every row whole whenever the API answers
 * or the socket speaks, and the thread itself, which moves its own frontier when
 * somebody scrolls back through it. Without this, the first would put the
 * defaults back over the second every time a message arrived anywhere.
 *
 * Seeded by `restoreStore` from what is already on disk, so a list write that
 * happens before any thread is opened writes back the frontiers the last run
 * left rather than flattening them.
 */
const frontiers = new Map<string, Map<string, ThreadPaging>>()

const NO_PAGING: ReadonlyMap<string, ThreadPaging> = new Map()

function heldPaging(ownerId: string): ReadonlyMap<string, ThreadPaging> {
  return frontiers.get(ownerId) ?? NO_PAGING
}

function holdPaging(ownerId: string, paging: ReadonlyMap<string, ThreadPaging>): void {
  if (paging.size === 0) return
  const held = frontiers.get(ownerId) ?? new Map<string, ThreadPaging>()
  for (const [conversationId, thread] of paging) held.set(conversationId, thread)
  frontiers.set(ownerId, held)
}

/**
 * One thread's pending write.
 *
 * `replace` is what the screen says about the Messages it is handing over: that
 * they are the thread now, rather than more of it. A thread whose newest page
 * turned out not to continue what this device held has just thrown that history
 * off the screen, and it has to leave the disk with it — paging back into it
 * would otherwise read straight from what arrived into a fragment of what used
 * to be, with unfetched history between them and no way to ask for it.
 *
 * Coalesced per thread, so a burst of arriving messages costs one transaction:
 * the newest Messages replace the ones waiting, and `replace` survives the
 * coalescing because a drop that has been decided cannot be undecided by the
 * next message to land.
 */
type PendingThread = {
  ownerId: string
  conversationId: string
  messages: readonly Message[] | null
  replace: boolean
  paging: ThreadPaging | null
}

/** The newest state each thread is waiting to have written, by owner and conversation. */
const queuedThreads = new Map<string, PendingThread>()

function threadKey(ownerId: string, conversationId: string): string {
  return `${ownerId} ${conversationId}`
}

/**
 * The Messages last known to be on disk for a thread, by identity.
 *
 * By object rather than by id, because a Message changes: a receipt advances, a
 * reaction lands, and the merge that folds the newer copy in gives it a new
 * identity while leaving every unchanged Message the identity it had. So this
 * answers the only question a write needs — which of these rows is not the row
 * already there — and a socket message arriving in a thread of three hundred
 * costs one insert rather than three hundred.
 */
const writtenMessages = new Map<string, Map<string, Message>>()

function markThreadWritten(
  ownerId: string,
  conversationId: string,
  messages: readonly Message[],
): void {
  const key = threadKey(ownerId, conversationId)
  const already = writtenMessages.get(key) ?? new Map<string, Message>()
  for (const message of messages) already.set(message.id, message)
  writtenMessages.set(key, already)
}

/**
 * Threads the Store has taken history from and has not Restored since.
 *
 * A sweep leaves the disk holding one coherent run — a thread's newest fifty and
 * a frontier that reads back to the oldest of them. Memory is still holding
 * whatever it held, which for a thread somebody scrolled deep is more, and
 * further back. Patching that memory onto this disk is what would put a hole in
 * it: a page fetched below what memory holds lands under the fifty with the
 * evicted history missing in between, and nothing on the way back in could tell.
 *
 * So a swept thread stops accepting writes. The cost is that a Message arriving
 * in it before it is next opened is not persisted, which costs a request on some
 * later launch. The alternative is a thread that reads from today into last
 * month with no way to ask for what fell out.
 *
 * Cleared by `restoreThread`, which is the moment the two copies are the same
 * again, and by a `replace`, which rebuilds the thread whole rather than
 * patching it.
 */
const sweptThreads = new Set<string>()

let draining: Promise<void> | null = null

/**
 * The Conversations this device last knew about for this person.
 *
 * Scoped to the viewer, because a phone is shared: the next person to sign in
 * Restores nothing rather than somebody else's support history. A database that
 * is missing, unreadable, or written by a build with another schema Restores
 * nothing too, and none of the three is distinguishable from the outside — there
 * is one answer for "this device has nothing to draw", and it is an empty list.
 */
export function restoreStore(ownerId: string): RestoredStore {
  const database = connect()
  if (!database) return NOTHING_RESTORED

  try {
    const restored = fromConversationRows(
      database.getAllSync('SELECT * FROM conversations WHERE owner_id = ?', ownerId),
    )
    const organizationNames = fromOrganizationRows(
      database.getAllSync('SELECT * FROM organizations WHERE owner_id = ?', ownerId),
    )
    // What was just read is what is on disk, so writing it straight back would
    // spend a transaction at the busiest moment of a cold start to change
    // nothing. See `saveStore`.
    markWritten(ownerId, { ...restored, organizationNames })
    // The frontiers come back with the rows, so a list write that lands before
    // anybody opens a thread writes back how far each one had been read rather
    // than the defaults. See `frontiers`.
    holdPaging(ownerId, restored.paging)
    return { ...restored, organizationNames }
  } catch {
    // A database that cannot be read is not going to start being readable, and
    // every write after this would fail against it too — which would leave the
    // Store dead for the life of the install. Discarded and made again empty
    // instead, so the cost is this one Restore.
    discard()
    return NOTHING_RESTORED
  }
}

/**
 * A thread as this device last knew it: its newest Messages, and its frontier.
 *
 * `paging` is what the API had already said about how far back this thread
 * goes, so a restart picks the scroll back up where it stopped instead of
 * reading the whole thread again from the top. A row that has never recorded one
 * — every row written before this existed — falls back to the oldest Message
 * actually held, which is the same place by another route.
 *
 * Null when there is nothing here: no database, nothing stored for this thread,
 * or a read that failed. All three mean the same to a caller, which is that this
 * thread has to be fetched before it can be drawn.
 */
export type RestoredThread = { messages: Message[]; paging: ThreadPaging }

/**
 * The newest Messages this device holds for a thread, and how far back it read.
 *
 * Synchronous and bounded, for the same reason `restoreStore` is: the screen
 * reads this while it is deciding what to draw, and a thread that has been
 * scrolled back through for an hour must cost the same to open as one that has
 * not. `limit` is a page, not a thread — what is below it stays on disk and is
 * read by `restoreOlderMessages` when somebody scrolls into it.
 */
export function restoreThread(
  ownerId: string,
  conversationId: string,
  limit: number,
): RestoredThread | null {
  const database = connect()
  if (!database) return null

  try {
    // Reading the thread back is the moment memory and disk are the same run of
    // history again, so whatever a sweep took from it is no longer a reason to
    // refuse its writes. See `sweptThreads`.
    sweptThreads.delete(threadKey(ownerId, conversationId))
    const messages = fromMessageRows(
      database.getAllSync(
        `SELECT * FROM messages WHERE owner_id = ? AND conversation_id = ?
         ORDER BY created_at DESC, id DESC LIMIT ?`,
        ownerId,
        conversationId,
        limit,
      ),
    )
    if (messages.length === 0) return null

    const row = database.getFirstSync<{ has_more: number; cursor: string | null }>(
      'SELECT has_more, cursor FROM conversations WHERE owner_id = ? AND id = ?',
      ownerId,
      conversationId,
    )
    const paging = threadPaging(row, messages)
    // What was just read is what is on disk. Without this, opening a thread
    // would write its whole Restored page straight back at the busiest moment
    // there is. See `writtenMessages` and `frontiers`.
    markThreadWritten(ownerId, conversationId, messages)
    holdPaging(ownerId, new Map([[conversationId, paging]]))
    return { messages, paging }
  } catch {
    // Same rule as `restoreStore`: a database that cannot be read is discarded
    // rather than asked again on every scroll for the life of the install.
    discard()
    return null
  }
}

/**
 * What the row says about a thread's history, or what its Messages say instead.
 *
 * The fallback is the oldest Message held rather than nothing, because a cursor
 * of nothing means "ask from the top" — which on a thread this device is already
 * holding history for would fetch back down through every page it has.
 */
function threadPaging(
  row: { has_more: number; cursor: string | null } | null,
  messages: readonly Message[],
): ThreadPaging {
  return {
    hasMore: row?.has_more !== 0,
    cursor: typeof row?.cursor === 'string' ? row.cursor : messages[0]?.id,
  }
}

/**
 * The page of history this device holds before a Message it is already showing.
 *
 * What makes paging back off this phone a bounded query rather than a whole
 * thread deserialised: one indexed read of one page, ordered by the same two
 * columns the index is on. An empty answer is the whole answer — it means this
 * device holds nothing further back, and whatever comes next is the API's to
 * say.
 *
 * Ordered newest-first here and re-sorted on the way out by `fromMessageRows`,
 * because `LIMIT` has to take the page nearest the one on screen and the thread
 * has to be read oldest-first.
 */
export function restoreOlderMessages(
  ownerId: string,
  conversationId: string,
  before: Message,
  limit: number,
): Message[] {
  const database = connect()
  if (!database) return []

  const at = messageOrder(before.createdAt)
  try {
    return fromMessageRows(
      database.getAllSync(
        `SELECT * FROM messages
         WHERE owner_id = ? AND conversation_id = ?
           AND (created_at < ? OR (created_at = ? AND id < ?))
         ORDER BY created_at DESC, id DESC LIMIT ?`,
        ownerId,
        conversationId,
        at,
        at,
        before.id,
        limit,
      ),
    )
  } catch {
    discard()
    return []
  }
}

/**
 * Close the connection and remove the file. The next use opens a fresh one.
 *
 * What was believed to be on disk is forgotten with it — the new database has
 * none of it, and a state still matching the old belief would otherwise be
 * skipped as already written.
 */
function discard(): void {
  written.clear()
  writtenMessages.clear()
  frontiers.clear()
  sweptThreads.clear()
  try {
    connection?.closeSync()
    SQLite.deleteDatabaseSync(DATABASE_NAME)
  } catch {
    // A database that will not close or will not delete is one this app cannot
    // reach either; forgetting the connection is what matters.
  }
  connection = undefined
}

/**
 * Write this person's Conversations through, when the queue gets to it.
 *
 * Fire and forget: the promise is returned so a test can wait for the queue to
 * drain, and callers ignore it. Nothing on screen is waiting for a write, and
 * nothing on screen changes when one fails.
 *
 * Coalescing rather than queueing every state. A resync merging forty rows and
 * a socket event a moment later are two states, and only the second one is true
 * by the time the first would reach disk — so the newest state per person
 * replaces the one waiting, and a burst costs one transaction rather than a
 * transaction each.
 *
 * The serialisation matters as much as the coalescing: each write replaces
 * everything held for that person, so two of them interleaving could leave rows
 * from a state that has already been superseded.
 */
export function saveStore(ownerId: string, snapshot: StoreSnapshot): Promise<void> {
  if (alreadyWritten(ownerId, snapshot)) return draining ?? Promise.resolve()

  queued.set(ownerId, snapshot)
  draining ??= drain()
  return draining
}

/**
 * Write a thread's confirmed Messages through, when the queue gets to it.
 *
 * `replace` says these Messages are the thread rather than more of it — see
 * `PendingThread`. Everything else is an upsert by id, because a Message that
 * has been confirmed does not leave the thread it is in: what changes is its
 * receipts and its reactions, and replacing the row by id is exactly that.
 *
 * Same queue as the list, so the two cannot interleave inside one thread's
 * transaction, and same fire-and-forget: the promise exists for tests.
 */
export function saveMessages(
  ownerId: string,
  conversationId: string,
  messages: readonly Message[],
  mode: 'merge' | 'replace' = 'merge',
): Promise<void> {
  const key = threadKey(ownerId, conversationId)
  const pending = queuedThreads.get(key)

  queuedThreads.set(key, {
    ownerId,
    conversationId,
    messages,
    // A drop that has been decided cannot be undecided by the next state to
    // land on top of it before the queue is drained.
    replace: mode === 'replace' || pending?.replace === true,
    paging: pending?.paging ?? null,
  })

  draining ??= drain()
  return draining
}

/**
 * Record how far back a thread has been read.
 *
 * One column pair on the conversation's own row, updated in place rather than
 * through the list: the list is replaced whole and by somebody else, and a
 * thread that has just been scrolled back through is not a reason to rewrite
 * every row this person has. Held in memory as well, so the next full write of
 * the list carries it instead of flattening it. See `frontiers`.
 */
export function saveThreadPaging(
  ownerId: string,
  conversationId: string,
  paging: ThreadPaging,
): Promise<void> {
  const held = frontiers.get(ownerId)?.get(conversationId)
  if (held?.hasMore === paging.hasMore && held.cursor === paging.cursor) {
    return draining ?? Promise.resolve()
  }
  holdPaging(ownerId, new Map([[conversationId, paging]]))

  const key = threadKey(ownerId, conversationId)
  const pending = queuedThreads.get(key)
  queuedThreads.set(key, {
    ownerId,
    conversationId,
    messages: pending?.messages ?? null,
    replace: pending?.replace === true,
    paging,
  })

  draining ??= drain()
  return draining
}

async function drain(): Promise<void> {
  try {
    while (queued.size > 0 || queuedThreads.size > 0) {
      const lists = [...queued]
      queued.clear()
      for (const [ownerId, pending] of lists) await write(ownerId, pending)

      const threads = [...queuedThreads.values()]
      queuedThreads.clear()
      for (const pending of threads) await writeThread(pending)
    }
  } finally {
    draining = null
  }
}

/**
 * One thread's state change, one transaction.
 *
 * Only the Messages that are not already the rows on disk are written — by
 * object identity, which is what the merge in `lib/conversation-state` leaves
 * behind. See `writtenMessages`. A replace forgets all of that first, because
 * the rows it is about to remove are exactly the ones that belief is about.
 */
async function writeThread(pending: PendingThread): Promise<void> {
  const database = connect()
  if (!database) return

  const { ownerId, conversationId, messages, paging } = pending
  const key = threadKey(ownerId, conversationId)
  // A thread a sweep has taken history from takes nothing further until it is
  // Restored — except a replace, which rebuilds it whole and so cannot leave a
  // hole in it. See `sweptThreads`.
  if (sweptThreads.has(key)) {
    if (!pending.replace) return
    sweptThreads.delete(key)
  }
  if (pending.replace) writtenMessages.delete(key)

  const already = writtenMessages.get(key) ?? new Map<string, Message>()
  const changed = (messages ?? []).filter((message) => already.get(message.id) !== message)
  const rows = toMessageRows(ownerId, conversationId, changed)
  // Nothing to say. A thread that has just been Restored reaches this on its
  // first state change, and a transaction that writes the rows it read back
  // over themselves is the one cost this whole arrangement exists to avoid.
  if (rows.length === 0 && !paging && !pending.replace) return

  try {
    await database.withTransactionAsync(async () => {
      if (pending.replace) {
        await database.runAsync(
          'DELETE FROM messages WHERE owner_id = ? AND conversation_id = ?',
          ownerId,
          conversationId,
        )
      }

      for (const row of rows) {
        await database.runAsync(
          'INSERT OR REPLACE INTO messages (id, conversation_id, owner_id, created_at, payload) VALUES (?, ?, ?, ?, ?)',
          row.id,
          row.conversation_id,
          row.owner_id,
          row.created_at,
          row.payload,
        )
      }

      if (paging) {
        await database.runAsync(
          'UPDATE conversations SET has_more = ?, cursor = ? WHERE owner_id = ? AND id = ?',
          paging.hasMore ? 1 : 0,
          paging.cursor ?? null,
          ownerId,
          conversationId,
        )
      }
    })

    for (const message of messages ?? []) already.set(message.id, message)
    writtenMessages.set(key, already)
  } catch {
    // Swallowed, like every other write here. Nothing is recorded as written, so
    // the next state change writes these Messages again.
    return
  }

  // After the write that grew the table, and only then: a thread's Messages are
  // the one thing that makes it bigger, so this is where the growth is. A write
  // that only moved a frontier moved no rows.
  if (rows.length > 0) await evict(database, ownerId, conversationId)
}

/**
 * Bring the Store back inside its limits, after the write that grew it.
 *
 * Reads `messages` and the activity of the rows beside them, hands the counting
 * to `planEviction`, and applies what comes back. What is kept and what goes is
 * decided there, without a database — see `lib/store-eviction` for the rule and
 * the table it is tested against.
 *
 * Conversations are untouched by construction: a plan is a list of threads to
 * take Messages from, and the only statement here that reaches the
 * `conversations` table writes the paging of a thread this has just taken
 * Messages from.
 *
 * That paging is reset for every thread swept — the ones emptied and the ones
 * shortened alike — and it has to be for both. A cursor is where the next page
 * reads backwards *from*, so one left pointing past history this device no
 * longer holds would make the next scroll ask the API for the page before
 * something already gone, and read straight over everything between with no way
 * left to ask for it. A shortened thread is the case that is easy to miss: it
 * still has Messages, and its cursor is further back than the oldest of them.
 *
 * What was believed to be on disk is deliberately *not* forgotten. Those rows
 * were removed on purpose, and a write that put them straight back would be a
 * write that undoes itself — see `writtenMessages`, which answers "which of
 * these is not the row already there" and must keep answering no for a Message
 * this has just discarded.
 *
 * Nothing here throws. A count that will not read, a delete the database
 * refuses: each is swallowed, and the cost is a Store that stays larger than it
 * meant to until the next thread is written.
 */
async function evict(
  database: SQLite.SQLiteDatabase,
  ownerId: string,
  writtenTo: string,
): Promise<void> {
  try {
    const plan = planEviction(await storedThreads(database, ownerId), { spare: writtenTo })
    const swept = [...plan.drop, ...plan.shorten]
    if (swept.length === 0) return

    await database.withTransactionAsync(async () => {
      for (const conversationId of plan.drop) {
        await database.runAsync(
          'DELETE FROM messages WHERE owner_id = ? AND conversation_id = ?',
          ownerId,
          conversationId,
        )
      }

      for (const conversationId of plan.shorten) {
        await database.runAsync(
          `DELETE FROM messages WHERE owner_id = ? AND conversation_id = ? AND id NOT IN
             (SELECT id FROM messages WHERE owner_id = ? AND conversation_id = ?
              ORDER BY created_at DESC, id DESC LIMIT ?)`,
          ownerId,
          conversationId,
          ownerId,
          conversationId,
          RETAINED_MESSAGES_PER_THREAD,
        )
      }

      // The same statement a thread's own frontier is written with, given the
      // defaults `emptyThread` would hand a conversation nobody has opened.
      for (const conversationId of swept) {
        await database.runAsync(
          'UPDATE conversations SET has_more = ?, cursor = ? WHERE owner_id = ? AND id = ?',
          1,
          null,
          ownerId,
          conversationId,
        )
      }
    })

    for (const conversationId of swept) {
      // The frontier held in memory is the one a full write of the list would
      // otherwise carry back over the reset above. Forgetting it *is* the reset:
      // a thread with no frontier held is written with the defaults.
      frontiers.get(ownerId)?.delete(conversationId)
      sweptThreads.add(threadKey(ownerId, conversationId))
    }
  } catch {
    // The Store stays over its limits until the next thread is written.
  }
}

/**
 * Every thread this device holds Messages for, with the activity they are
 * ranked by.
 *
 * One grouped read over the index the thread pages already use. The activity is
 * the *conversation's* — the column `toConversationRows` writes — rather than
 * the newest Message held, because the two part company on exactly the threads
 * worth keeping. See `StoredThread`.
 *
 * Asynchronous, unlike every other read here. The synchronous ones are the two a
 * screen makes while it is deciding what to draw, and they are synchronous for
 * that reason alone — see this module's header. This one is the largest read it
 * has, it runs on the write path, and nobody is waiting for it.
 */
async function storedThreads(
  database: SQLite.SQLiteDatabase,
  ownerId: string,
): Promise<StoredThread[]> {
  const rows = await database.getAllAsync<{
    conversation_id: string
    message_count: number
    activity_at: number | null
  }>(
    `SELECT m.conversation_id AS conversation_id, COUNT(*) AS message_count,
            c.activity_at AS activity_at
     FROM messages m
     LEFT JOIN conversations c ON c.owner_id = m.owner_id AND c.id = m.conversation_id
     WHERE m.owner_id = ?
     GROUP BY m.conversation_id`,
    ownerId,
  )

  return rows.map((row) => ({
    conversationId: row.conversation_id,
    // A thread whose conversation has left the list is ranked as the oldest
    // thing there is. The list write removes its Messages anyway; this is only
    // what happens if it is still here when a sweep runs.
    activityAt: typeof row.activity_at === 'number' ? row.activity_at : 0,
    messageCount: row.message_count,
  }))
}

/**
 * One state change, one transaction.
 *
 * A replace rather than an upsert, because the list is the unit: a conversation
 * that has left it — deleted, or a membership revoked — has to leave the disk
 * with it, and reconciling row by row is how a list quietly keeps a row nothing
 * on screen still has.
 */
async function write(ownerId: string, snapshot: StoreSnapshot): Promise<void> {
  const database = connect()
  if (!database) return

  const { conversations, organizationNames } = snapshot
  const rows = toConversationRows(ownerId, conversations, heldPaging(ownerId))
  const organizations = toOrganizationRows(ownerId, organizationNames)

  try {
    await database.withTransactionAsync(async () => {
      await database.runAsync('DELETE FROM conversations WHERE owner_id = ?', ownerId)
      for (const row of rows) {
        await database.runAsync(
          'INSERT INTO conversations (id, owner_id, payload, has_more, cursor, activity_at) VALUES (?, ?, ?, ?, ?, ?)',
          row.id,
          row.owner_id,
          row.payload,
          row.has_more,
          row.cursor,
          row.activity_at,
        )
      }

      await database.runAsync('DELETE FROM organizations WHERE owner_id = ?', ownerId)
      for (const row of organizations) {
        await database.runAsync(
          'INSERT INTO organizations (id, owner_id, name) VALUES (?, ?, ?)',
          row.id,
          row.owner_id,
          row.name,
        )
      }

      // A conversation that has left the list takes its Messages with it. The
      // list is the unit and the rows have just been replaced from it, so what
      // is left over is a thread nothing on screen can reach — a deleted
      // conversation, or one a membership was revoked on. Left behind, it would
      // be readable by anything looking at this app's data directory long after
      // the thread it belongs to stopped being this person's to open.
      await database.runAsync(
        'DELETE FROM messages WHERE owner_id = ? AND conversation_id NOT IN (SELECT id FROM conversations WHERE owner_id = ?)',
        ownerId,
        ownerId,
      )
    })
    markWritten(ownerId, snapshot)
  } catch {
    // Swallowed. The Store in memory is still right; the next Restore is poorer.
    // Nothing is recorded as written, so the next state change writes again.
  }
}

/**
 * Destroy everything this device holds about anybody's Conversations.
 *
 * The file, not its rows: a Session that has ended should leave nothing behind
 * that a tool reading this app's data directory could find. Anything queued is
 * dropped first, so a write already on its way cannot put back what this is
 * removing.
 */
export async function wipeStore(): Promise<void> {
  queued.clear()
  queuedThreads.clear()
  // Nothing is left waiting, but a write already past the queue is still on its
  // way to the file this is about to remove.
  await draining?.catch(() => {})
  discard()
}
