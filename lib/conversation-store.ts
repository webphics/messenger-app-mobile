import * as SQLite from 'expo-sqlite'

import {
  fromConversationRows,
  fromOrganizationRows,
  toConversationRows,
  toOrganizationRows,
  NOTHING_RESTORED,
  STORE_SCHEMA_VERSION,
  type RestoredStore,
  type ThreadPaging,
} from '@/lib/store-rows'
import type { Conversation } from '@/lib/types'

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
    PRIMARY KEY (owner_id, id)
  );
  CREATE TABLE organizations (
    id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (owner_id, id)
  );
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
  /** What the threads know about their own history. Nothing writes it yet. */
  paging?: ReadonlyMap<string, ThreadPaging>
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
 * Close the connection and remove the file. The next use opens a fresh one.
 *
 * What was believed to be on disk is forgotten with it — the new database has
 * none of it, and a state still matching the old belief would otherwise be
 * skipped as already written.
 */
function discard(): void {
  written.clear()
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

async function drain(): Promise<void> {
  try {
    while (queued.size > 0) {
      const batch = [...queued]
      queued.clear()
      for (const [ownerId, pending] of batch) await write(ownerId, pending)
    }
  } finally {
    draining = null
  }
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
  const rows = toConversationRows(ownerId, conversations, snapshot.paging)
  const organizations = toOrganizationRows(ownerId, organizationNames)

  try {
    await database.withTransactionAsync(async () => {
      await database.runAsync('DELETE FROM conversations WHERE owner_id = ?', ownerId)
      for (const row of rows) {
        await database.runAsync(
          'INSERT INTO conversations (id, owner_id, payload, has_more, cursor) VALUES (?, ?, ?, ?, ?)',
          row.id,
          row.owner_id,
          row.payload,
          row.has_more,
          row.cursor,
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
  // Nothing is left waiting, but a write already past the queue is still on its
  // way to the file this is about to remove.
  await draining?.catch(() => {})
  discard()
}
