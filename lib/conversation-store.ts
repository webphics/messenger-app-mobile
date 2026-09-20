import * as SQLite from 'expo-sqlite'

import {
  fromCommunityGroupRows,
  fromCommunityRows,
  toCommunityGroupRows,
  toCommunityRows,
  NO_COMMUNITIES,
  type RestoredCommunities,
} from '@/lib/community-rows'
import {
  planEviction,
  RETAINED_MESSAGES_PER_THREAD,
  type StoredThread,
} from '@/lib/store-eviction'
import {
  fromConversationRows,
  fromMessageRows,
  fromOrganizationRows,
  fromOutboxRows,
  messageOrder,
  toConversationRows,
  toMessageRows,
  toOrganizationRows,
  toOutboxRows,
  NOTHING_RESTORED,
  STORE_SCHEMA_VERSION,
  type RestoredStore,
  type ThreadPaging,
} from '@/lib/store-rows'
import {
  emptyThread,
  threadContinues,
  visibleMessages,
  type ThreadState,
  type ThreadViewer,
  type UnsentMessage,
} from '@/lib/thread-state'
import type { Community, CommunityFeedRow, Conversation, Message } from '@/lib/types'

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
 * The Conversation list, by whoever holds the list; and a thread, by whoever
 * holds that thread. Two callers, two calls: `saveStore` and `saveThread`,
 * against `restoreStore` and `restoreThread`. Neither caller is told what a
 * table is.
 *
 * Underneath, a thread is three of them. Its Messages are added to, because a
 * Message that has been confirmed does not leave the thread it is in — what
 * changes is its receipts, and an upsert by id says exactly that. Its frontier
 * is a column pair on the `conversations` row, which is the one thing the list
 * and the thread share: written whole by the list and one column at a time by
 * the thread, which is why the paging is also held in memory here — see
 * `frontiers`. Its Outbox is neither, because a row there is this device's word
 * rather than the server's and it leaves when the message it stands for is
 * confirmed; it is untouched by every rule the Messages have, a sweep never
 * names it, and a thread a sweep has taken history from still writes it. See
 * `queueOutbox`.
 *
 * Each of the three keeps its own queue, transaction and coalescing, and each is
 * skipped when the state handed to `saveThread` did not move it.
 *
 * ## And the Communities, by whoever holds the tab
 *
 * A third caller with the same contract: `saveCommunities` and
 * `saveCommunityFeed` against `restoreCommunities` and `restoreCommunityFeed`.
 * They are here rather than in a store of their own because this file is the one
 * that knows SQLite exists, and a second one would mean a second connection to
 * the same file; what they are *about* is next door in `lib/community-rows.ts`,
 * which imports nothing native, exactly as `store-rows` is for the list.
 *
 * Both are replaced whole rather than reconciled, because a Community somebody
 * has left and a Group that was unlinked both have to leave the disk, and a
 * delta cannot say so. The expansion travels on the Community's own row, so a
 * tab that was open comes back open with no write of its own.
 */

const DATABASE_NAME = 'joychat-store.db'

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
  CREATE TABLE outbox (
    id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (owner_id, conversation_id, id)
  );
  CREATE TABLE communities (
    id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    expanded INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (owner_id, id)
  );
  CREATE TABLE community_groups (
    id TEXT NOT NULL,
    community_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (owner_id, community_id, id)
  );
  CREATE INDEX community_groups_by_community
    ON community_groups (owner_id, community_id, position);
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

/**
 * The Map key for one thread: an owner and a conversation, joined.
 *
 * Both halves are ids — a UUID from the API, or a `local-` id from
 * `lib/thread-state` — and neither can contain a `|`, so the join is
 * unambiguous. In memory only: no key here is ever written to disk.
 */
function threadKey(ownerId: string, conversationId: string): string {
  return `${ownerId}|${conversationId}`
}

/** The two halves back. The delimiter is written and read in one place, here. */
function fromThreadKey(key: string): { ownerId: string; conversationId: string } {
  const at = key.indexOf('|')
  return { ownerId: key.slice(0, at), conversationId: key.slice(at + 1) }
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

/**
 * The last state of each thread this was handed, by thread.
 *
 * Not a claim about the disk — `writtenMessages` is that. This answers one
 * question and only one: whether the Messages arriving now are more of the run
 * of history that arrived last time, or a different run of it with something
 * nobody fetched in between. See `saveThread`, which is the only reader.
 *
 * Per thread rather than one slot, which is what the screen used to keep: a
 * person who opens one thread, then another, then the first again is asking the
 * same question about the first thread both times, and the answer does not
 * depend on where they went in between.
 */
const lastThreads = new Map<string, ThreadState>()

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
 * One thread's pending Outbox write: the Unsent Messages it is holding, whole.
 *
 * Whole rather than a delta, because the Outbox is small — what somebody typed
 * and has not got away — and because the interesting change is a removal. A
 * message that was confirmed, or one the person gave up on, leaves the list, and
 * a delta of "here is what is unsent" cannot say that.
 */
type PendingOutbox = {
  ownerId: string
  conversationId: string
  messages: readonly Message[]
}

/** The newest Outbox state each thread is waiting to have written. */
const queuedOutbox = new Map<string, PendingOutbox>()

/**
 * The Unsent Messages last known to be on disk for a thread, by identity.
 *
 * The same trick `writtenMessages` uses, and for the same reason: a state change
 * anywhere in a thread hands this the whole Outbox again, and almost none of it
 * has moved. What is here answers the two questions a write needs — which of
 * these is not already the row on disk, and which row on disk is no longer one
 * of these — so a message failing in a thread holding two others costs one
 * insert rather than three.
 *
 * Seeded by `restoreOutbox`, so a thread opening on what this device holds does
 * not write its own Restored Outbox straight back.
 */
const writtenOutbox = new Map<string, Map<string, Message>>()

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

/**
 * Everyone the Store has served since the last Wipe, and everyone a Wipe took
 * it from who has not Restored since.
 *
 * The two together are what make a Wipe stick. A Session expiry discards the
 * credential while the screens still believe they are signed in — they are told
 * a moment later, and a moment is what this is about — so a socket event landing
 * in between would queue the Conversation list of the person who has just been
 * signed out, and the drain would open a fresh database and write it. The
 * support history would be back on the disk, put there by the thing that was
 * told to remove it.
 *
 * So a Wipe bars the people it took the Store from, and `restoreStore` is what
 * lets one back in — the same shape as `sweptThreads` above, one person rather
 * than one thread. Nobody is locked out by it: every screen that writes sits
 * under the provider that Restores first, so the next person to sign in is
 * admitted on the way in, and so is the same person signing back in.
 *
 * Only a Wipe bars anybody. `discard` does not, because it runs on a database
 * this build cannot read — a reason to begin the file again, and not a reason to
 * stop persisting for somebody who is still signed in.
 */
const activeOwners = new Set<string>()
const barredOwners = new Set<string>()

/** Whether this person's Store may be written at all. See `barredOwners`. */
function mayWrite(ownerId: string): boolean {
  if (barredOwners.has(ownerId)) return false
  activeOwners.add(ownerId)
  return true
}

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
  // Before the read rather than after it, so the two outcomes that Restore
  // nothing — no database, and one that would not read — still readmit somebody
  // a Wipe barred. Restoring nothing is the normal state of a first sign-in.
  barredOwners.delete(ownerId)
  activeOwners.add(ownerId)

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
 * What one read of the `messages` table found: the page, and the frontier.
 *
 * `paging` is what the API had already said about how far back this thread
 * goes, so a restart picks the scroll back up where it stopped instead of
 * reading the whole thread again from the top. A row that has never recorded one
 * — every row written before this existed — falls back to the oldest Message
 * actually held, which is the same place by another route.
 */
type RestoredThread = { messages: Message[]; paging: ThreadPaging }

/**
 * A thread as this device last knew it, ready to draw.
 *
 * One call for everything a thread opens on, because to the screen it is one
 * question: the Messages, the frontier they were read to, and the ones that were
 * typed here and never got away. Three tables and one answer — a screen deciding
 * what to draw has no use for them apart, and asking separately only invites
 * drawing one without the others.
 *
 * Synchronous and bounded, for the same reason `restoreStore` is: the screen
 * reads this while it is deciding what to draw, and a thread that has been
 * scrolled back through for an hour must cost the same to open as one that has
 * not. `limit` is a page, not a thread — what is below it stays on disk and is
 * read by `restoreOlderMessages` when somebody scrolls into it.
 *
 * Filtered on the way out, exactly as a page from the API is. The Store holds
 * what was already visible — nothing withheld was ever written — but the rule
 * that decides what a viewer may see is not one to hold in a single place and
 * hope, and a database is the one input to this app that an older build of it
 * wrote. Here rather than at the screen because this is the boundary the
 * untrusted rows cross. See `isMessageVisibleTo`.
 *
 * A thread this device holds nothing for comes back empty rather than absent:
 * an empty thread is what the screen would have made of a null anyway, and the
 * Outbox is read whether or not there is history to draw it into — a thread
 * whose first message never got away has nothing else on this device, and it is
 * the one this feature is most obviously for.
 */
export function restoreThread(
  ownerId: string,
  conversationId: string,
  viewer: ThreadViewer,
  limit: number,
): ThreadState {
  const unsent = restoreOutbox(ownerId, conversationId)
  const held = restoreMessages(ownerId, conversationId, limit)
  if (!held) return { ...emptyThread(), unsent }

  return {
    ...emptyThread(),
    messages: visibleMessages(viewer.role, viewer.conversationType, held.messages),
    unsent,
    hasMore: held.paging.hasMore,
    cursor: held.paging.cursor,
  }
}

/**
 * The newest Messages this device holds for a thread, and how far back it read.
 *
 * Null when there is nothing here: no database, nothing stored for this thread,
 * or a read that failed. All three mean the same to `restoreThread`, which is
 * that this thread has to be fetched before it can be drawn.
 */
function restoreMessages(
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
 * The Outbox of one thread: what was typed here and never confirmed.
 *
 * Every entry comes back *failed*, and none of them is sent by reading them —
 * that is the whole difference between an Outbox and a send queue. A message
 * abandoned on Tuesday must not leave on Thursday because a phone was unlocked;
 * it comes back where it was written, marked, offering to go again, and it goes
 * when somebody taps it.
 *
 * Synchronous and unbounded, unlike `restoreThread`. Unbounded because there is
 * no page here to take: the Outbox is what one person failed to send in one
 * thread, a thread with more than a handful in it is a thread with a problem,
 * and dropping the oldest would be dropping the message they have been carrying
 * longest. Synchronous for the same reason the thread is — the screen reads this
 * while it is deciding what to draw.
 *
 * Empty when there is nothing here: no database, nothing stored for this thread,
 * or a read that failed. All three mean the same to `restoreThread`.
 */
function restoreOutbox(ownerId: string, conversationId: string): UnsentMessage[] {
  const database = connect()
  if (!database) return []

  try {
    const unsent = fromOutboxRows(
      database.getAllSync(
        `SELECT * FROM outbox WHERE owner_id = ? AND conversation_id = ?
         ORDER BY created_at ASC, id ASC`,
        ownerId,
        conversationId,
      ),
    )
    // What was just read is what is on disk. Without this, opening a thread
    // would write its whole Restored Outbox straight back. See `writtenOutbox`.
    markOutboxWritten(
      ownerId,
      conversationId,
      unsent.map((entry) => entry.message),
    )
    return unsent
  } catch {
    // Same rule as `restoreStore`: a database that cannot be read is discarded
    // rather than asked again for the life of the install.
    discard()
    return []
  }
}

/**
 * Record what this thread's Outbox is believed to hold.
 *
 * A replacement rather than an addition, unlike `markThreadWritten`: the Outbox
 * is read and written whole, so what is not in the list handed over is not on
 * disk either. A belief that only grew would answer "already written" for a
 * message that has since been confirmed and removed.
 */
function markOutboxWritten(
  ownerId: string,
  conversationId: string,
  messages: readonly Message[],
): void {
  writtenOutbox.set(
    threadKey(ownerId, conversationId),
    new Map(messages.map((message) => [message.id, message])),
  )
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
  writtenCommunities.clear()
  writtenMessages.clear()
  lastThreads.clear()
  writtenOutbox.clear()
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
  if (!mayWrite(ownerId)) return draining ?? Promise.resolve()
  if (alreadyWritten(ownerId, snapshot)) return draining ?? Promise.resolve()

  queued.set(ownerId, snapshot)
  draining ??= drain()
  return draining
}

/**
 * Write a thread through, when the queue gets to it.
 *
 * The mirror of `restoreThread`, and one call for the same reason: a thread's
 * confirmed Messages, its frontier and its Outbox are three tables but one
 * state, and the screen holding that state has no business splitting it up. A
 * fetched page, a page read back off the disk, a socket event, a send that was
 * just confirmed, a reaction and a send that failed all end up in this one
 * value, so handing it over persists all six — and the seventh, added by
 * somebody who would have had no idea there were three writers to call.
 *
 * Nothing that did not change is written. Each half is compared by identity
 * against the state handed over last time, which is what the reducers in
 * `lib/thread-state` leave behind: a thread whose Messages changed queues
 * no Outbox write, and a thread that only failed a send queues no Messages. The
 * frontier has a guard of its own — see `queueThreadPaging`.
 *
 * Fire and forget: the promise is returned so a test can wait for the queue to
 * drain, and callers ignore it. Nothing on screen is waiting for a write.
 *
 * ## Whether this is more of the thread, or a different run of it
 *
 * The one decision here rather than at the caller. Messages are an upsert by id
 * — a Message that has been confirmed does not leave the thread it is in; what
 * changes is its receipts and its reactions — except when the newest page turns
 * out not to continue what was held, because enough was said while this phone
 * was away. Then what left the screen has to leave the disk with it, or the next
 * scroll back reads straight into a fragment with unfetched history in the
 * middle of it.
 *
 * `threadContinues` answers that, against `lastThreads`. It used to be answered
 * by the screen, which had to keep its own copy of what it last wrote to do it —
 * a shadow of a record this module already keeps. A thread handed over for the
 * first time is more of nothing, and merges.
 */
export function saveThread(
  ownerId: string,
  conversationId: string,
  thread: ThreadState,
): Promise<void> {
  if (!mayWrite(ownerId)) return draining ?? Promise.resolve()

  const key = threadKey(ownerId, conversationId)
  const last = lastThreads.get(key)
  lastThreads.set(key, thread)

  if (last?.messages !== thread.messages) {
    const continues = last === undefined || threadContinues(last.messages, thread.messages)
    queueMessages(ownerId, conversationId, thread.messages, continues ? 'merge' : 'replace')
  }

  if (last?.unsent !== thread.unsent) {
    queueOutbox(
      ownerId,
      conversationId,
      thread.unsent.map((entry) => entry.message),
    )
  }

  queueThreadPaging(ownerId, conversationId, {
    hasMore: thread.hasMore,
    cursor: thread.cursor,
  })

  // After all three, never between them. `drain` runs as far as its first await
  // the moment it is called, which would take the Messages out of the queue
  // before the frontier that moved with them had been put in — and one state
  // change would cost two transactions instead of the one it is.
  draining ??= drain()
  return draining
}

/**
 * Write a thread's confirmed Messages through, when the queue gets to it.
 *
 * `replace` says these Messages are the thread rather than more of it — see
 * `PendingThread` and `saveThread`, which decides which of the two this is.
 * Everything else is an upsert by id.
 *
 * Same queue as the list, so the two cannot interleave inside one thread's
 * transaction.
 */
function queueMessages(
  ownerId: string,
  conversationId: string,
  messages: readonly Message[],
  mode: 'merge' | 'replace',
): void {
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
function queueThreadPaging(
  ownerId: string,
  conversationId: string,
  paging: ThreadPaging,
): void {
  const held = frontiers.get(ownerId)?.get(conversationId)
  if (held?.hasMore === paging.hasMore && held.cursor === paging.cursor) return
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
}

/**
 * Write a thread's Unsent Messages through, when the queue gets to it.
 *
 * The list is the unit: what is handed over is the Outbox, and a row on disk
 * that is not in it is a message that has left — confirmed by the API, or
 * dropped. So this is the one write here that removes rows nobody asked it to.
 *
 * Every Unsent Message, whatever its Delivery state. A send in flight is written
 * exactly like one that has already failed, because the case this exists for is
 * the process dying with the request out: the row is what makes that message
 * come back at all, and it comes back failed either way. See `OutboxRow`.
 *
 * Same queue as the list and the Messages. A thread a sweep has taken history
 * from writes this regardless — `sweptThreads` is about a hole in *history*, and
 * the Outbox has none to put one in.
 */
function queueOutbox(
  ownerId: string,
  conversationId: string,
  messages: readonly Message[],
): void {
  queuedOutbox.set(threadKey(ownerId, conversationId), {
    ownerId,
    conversationId,
    messages,
  })
}

async function drain(): Promise<void> {
  try {
    while (
      queued.size > 0 ||
      queuedThreads.size > 0 ||
      queuedOutbox.size > 0 ||
      queuedCommunities.size > 0 ||
      queuedFeeds.size > 0
    ) {
      const lists = [...queued]
      queued.clear()
      for (const [ownerId, pending] of lists) await write(ownerId, pending)

      const threads = [...queuedThreads.values()]
      queuedThreads.clear()
      for (const pending of threads) await writeThread(pending)

      const outboxes = [...queuedOutbox.values()]
      queuedOutbox.clear()
      for (const pending of outboxes) await writeOutbox(pending)

      const communities = [...queuedCommunities]
      queuedCommunities.clear()
      for (const [ownerId, pending] of communities) await writeCommunities(ownerId, pending)

      const feeds = [...queuedFeeds.values()]
      queuedFeeds.clear()
      for (const pending of feeds) await writeCommunityFeed(pending)
    }
  } finally {
    draining = null
  }
}

/**
 * One thread's state change, one transaction.
 *
 * Only the Messages that are not already the rows on disk are written — by
 * object identity, which is what the merge in `lib/thread-state` leaves
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
 * One thread's Outbox, one transaction.
 *
 * Two statements, and the removal is the one that matters: a message the API
 * confirmed has left the Outbox in memory, and a row left behind for it would
 * restore a message the person watched succeed. So what is on disk and no longer
 * in the list handed over is deleted by id, and what is in the list and not
 * already the row there is written.
 *
 * No eviction follows, unlike a thread's Messages. The Outbox is bounded by what
 * one person managed to type without a connection, and every row in it is
 * something they wrote and nothing else holds — there is no copy on a server to
 * fetch it back from, which is exactly what a sweep assumes.
 */
async function writeOutbox(pending: PendingOutbox): Promise<void> {
  const database = connect()
  if (!database) return

  const { ownerId, conversationId, messages } = pending
  const key = threadKey(ownerId, conversationId)
  const already = writtenOutbox.get(key)

  const rows = toOutboxRows(
    ownerId,
    conversationId,
    messages.filter((message) => already?.get(message.id) !== message),
  )
  const kept = new Set(messages.map((message) => message.id))
  const gone = [...(already?.keys() ?? [])].filter((id) => !kept.has(id))
  // Nothing to say. A thread that has just been Restored reaches this on its
  // first state change, and every state change in a thread with a settled
  // Outbox reaches it after that.
  if (rows.length === 0 && gone.length === 0) return

  try {
    await database.withTransactionAsync(async () => {
      for (const id of gone) {
        await database.runAsync(
          'DELETE FROM outbox WHERE owner_id = ? AND conversation_id = ? AND id = ?',
          ownerId,
          conversationId,
          id,
        )
      }

      for (const row of rows) {
        await database.runAsync(
          'INSERT OR REPLACE INTO outbox (id, conversation_id, owner_id, created_at, payload) VALUES (?, ?, ?, ?, ?)',
          row.id,
          row.conversation_id,
          row.owner_id,
          row.created_at,
          row.payload,
        )
      }
    })

    markOutboxWritten(ownerId, conversationId, messages)
  } catch {
    // Swallowed, like every other write here. Nothing is recorded, so the next
    // state change writes these Messages again.
  }
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

      // And its Outbox, for the same reason and one more. A message waiting to
      // be sent into a conversation this person can no longer open is one the
      // retry it offers could only fail at, so restoring it would put a bubble
      // and a *Try again* in front of somebody with nowhere to send it.
      await database.runAsync(
        'DELETE FROM outbox WHERE owner_id = ? AND conversation_id NOT IN (SELECT id FROM conversations WHERE owner_id = ?)',
        ownerId,
        ownerId,
      )
    })
    markWritten(ownerId, snapshot)
    forgetOutboxOf(ownerId, new Set(rows.map((row) => row.id)))
  } catch {
    // Swallowed. The Store in memory is still right; the next Restore is poorer.
    // Nothing is recorded as written, so the next state change writes again.
  }
}

/**
 * Forget what the Outbox of a departed conversation held.
 *
 * The rows have just gone with the conversation, and a belief that outlived them
 * would answer "already written" for a message this device no longer has — so a
 * conversation that came back would come back without the message that was
 * waiting in it.
 */
function forgetOutboxOf(ownerId: string, kept: ReadonlySet<string>): void {
  for (const key of writtenOutbox.keys()) {
    const held = fromThreadKey(key)
    if (held.ownerId === ownerId && !kept.has(held.conversationId)) writtenOutbox.delete(key)
  }
}

/**
 * The Communities this device last knew this person was in, and which of them
 * were open.
 *
 * Scoped to the viewer and read synchronously, for the reasons `restoreStore` is
 * both: the next person to sign in on this phone Restores nothing rather than
 * somebody else's rooms, and the tab reads this while it is deciding what to
 * draw. A database that is missing, unreadable, or written by a build with
 * another schema Restores nothing, and none of the three is distinguishable from
 * the outside.
 *
 * Only Communities the viewer is in are ever written — the narrowing happens in
 * `lib/community-list` before this is called — so nothing here can hand a screen
 * a Community somebody was never in.
 */
export function restoreCommunities(ownerId: string): RestoredCommunities {
  if (barredOwners.has(ownerId)) return NO_COMMUNITIES

  const database = connect()
  if (!database) return NO_COMMUNITIES

  try {
    const restored = fromCommunityRows(
      database.getAllSync('SELECT * FROM communities WHERE owner_id = ?', ownerId),
    )
    // What was just read is what is on disk, so writing it straight back would
    // spend a transaction to change nothing. See `saveCommunities`.
    writtenCommunities.set(ownerId, communityFingerprint(restored.communities, restored.expanded))
    return restored
  } catch {
    // Same rule as `restoreStore`: a database that cannot be read is discarded
    // rather than asked again for the life of the install.
    discard()
    return NO_COMMUNITIES
  }
}

/**
 * One Community's feed as this device last knew it.
 *
 * The same shape of answer the Communities themselves get, and read the same
 * way: synchronously, because an expanded Community draws its rows in the frame
 * it is expanded in, and emptily when there is nothing here rather than with any
 * distinction between the ways there can be nothing.
 */
export function restoreCommunityFeed(
  ownerId: string,
  communityId: string,
): CommunityFeedRow[] {
  if (barredOwners.has(ownerId)) return []

  const database = connect()
  if (!database) return []

  try {
    return fromCommunityGroupRows(
      database.getAllSync(
        'SELECT * FROM community_groups WHERE owner_id = ? AND community_id = ? ORDER BY position ASC',
        ownerId,
        communityId,
      ),
    )
  } catch {
    discard()
    return []
  }
}

/**
 * What is last known to be on disk for a person's Communities.
 *
 * A fingerprint rather than the identity trick `written` uses, because the
 * expanded set is rebuilt on every toggle and the list beside it is not: two
 * states differing only in which rooms are open have to compare unequal, and two
 * differing in nothing have to compare equal however they were built.
 */
const writtenCommunities = new Map<string, string>()

function communityFingerprint(
  communities: readonly Community[],
  expanded: ReadonlySet<string>,
): string {
  return communities
    .map((community) => `${community.id}:${expanded.has(community.id) ? 1 : 0}:${community.name}`)
    .join('|')
}

/** The newest state each person's Communities are waiting to have written. */
const queuedCommunities = new Map<string, CommunitySnapshot>()

/** One Community's feed, waiting to be written. Keyed by owner and Community. */
const queuedFeeds = new Map<string, PendingFeed>()

type PendingFeed = {
  ownerId: string
  communityId: string
  rows: readonly CommunityFeedRow[]
}

export type CommunitySnapshot = {
  communities: readonly Community[]
  expanded: ReadonlySet<string>
}

/**
 * Write this person's Communities through, when the queue gets to it.
 *
 * The same contract `saveStore` has: fire and forget, coalesced to the newest
 * state per person, and skipped when nothing moved. The expansion travels with
 * the list rather than on its own, because it is a column on these rows and a
 * toggle is one more state of the same thing — which is what makes an expansion
 * survive a relaunch without a write of its own.
 */
export function saveCommunities(ownerId: string, snapshot: CommunitySnapshot): Promise<void> {
  if (!mayWrite(ownerId)) return draining ?? Promise.resolve()

  const fingerprint = communityFingerprint(snapshot.communities, snapshot.expanded)
  if (writtenCommunities.get(ownerId) === fingerprint) return draining ?? Promise.resolve()

  queuedCommunities.set(ownerId, snapshot)
  draining ??= drain()
  return draining
}

/**
 * Write one Community's feed through, when the queue gets to it.
 *
 * Replaced whole rather than reconciled, like the Conversation list and for the
 * same reason: the feed is the unit, and a Group that has left it — unlinked, or
 * one the viewer was removed from — has to leave the disk with it.
 */
export function saveCommunityFeed(
  ownerId: string,
  communityId: string,
  rows: readonly CommunityFeedRow[],
): Promise<void> {
  if (!mayWrite(ownerId)) return draining ?? Promise.resolve()

  queuedFeeds.set(threadKey(ownerId, communityId), { ownerId, communityId, rows })
  draining ??= drain()
  return draining
}

/**
 * One person's Communities, one transaction.
 *
 * A replace rather than an upsert, because the list is the unit: a Community
 * somebody has left — or one an Admin deleted — has to leave the disk with it,
 * and the feed it held goes in the same statement. Left behind, that feed would
 * be readable by anything looking at this app's data directory long after the
 * rooms in it stopped being this person's to open.
 */
async function writeCommunities(ownerId: string, snapshot: CommunitySnapshot): Promise<void> {
  const database = connect()
  if (!database) return

  const rows = toCommunityRows(ownerId, snapshot.communities, snapshot.expanded)

  try {
    await database.withTransactionAsync(async () => {
      await database.runAsync('DELETE FROM communities WHERE owner_id = ?', ownerId)
      for (const row of rows) {
        await database.runAsync(
          'INSERT INTO communities (id, owner_id, payload, expanded) VALUES (?, ?, ?, ?)',
          row.id,
          row.owner_id,
          row.payload,
          row.expanded,
        )
      }

      await database.runAsync(
        'DELETE FROM community_groups WHERE owner_id = ? AND community_id NOT IN (SELECT id FROM communities WHERE owner_id = ?)',
        ownerId,
        ownerId,
      )
    })
    writtenCommunities.set(ownerId, communityFingerprint(snapshot.communities, snapshot.expanded))
  } catch {
    // Swallowed. The tab in memory is still right; the next Restore is poorer.
  }
}

/** One Community's feed, one transaction. See `saveCommunityFeed`. */
async function writeCommunityFeed(pending: PendingFeed): Promise<void> {
  const database = connect()
  if (!database) return

  const { ownerId, communityId, rows } = pending
  const feed = toCommunityGroupRows(ownerId, communityId, rows)

  try {
    await database.withTransactionAsync(async () => {
      await database.runAsync(
        'DELETE FROM community_groups WHERE owner_id = ? AND community_id = ?',
        ownerId,
        communityId,
      )
      for (const row of feed) {
        await database.runAsync(
          'INSERT INTO community_groups (id, community_id, owner_id, position, payload) VALUES (?, ?, ?, ?, ?)',
          row.id,
          row.community_id,
          row.owner_id,
          row.position,
          row.payload,
        )
      }
    })
  } catch {
    // Swallowed, like every other write here.
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
  // First, so that anything queueing a write while the drain below is awaited
  // is refused rather than admitted into the database this is about to remove.
  for (const ownerId of activeOwners) barredOwners.add(ownerId)
  activeOwners.clear()
  queued.clear()
  queuedThreads.clear()
  queuedOutbox.clear()
  queuedCommunities.clear()
  queuedFeeds.clear()
  // Nothing is left waiting, but a write already past the queue is still on its
  // way to the file this is about to remove.
  await draining?.catch(() => {})
  discard()
}
