import {
  emptyThread,
  type ThreadState,
  type ThreadViewer,
  type UnsentMessage,
} from '@/lib/thread-state'
import { messageOrder, STORE_SCHEMA_VERSION } from '@/lib/store-rows'
import type { Conversation, CustomerMessage, Message } from '@/lib/types'

/**
 * The database as a device would hold it: a file per name, a schema version
 * stamped on it, and rows.
 *
 * Hand-written rather than a real SQLite, following `lib/attachment-cache.test`:
 * what is worth being sure about here is the discard-on-version-mismatch, the
 * scoping by viewer, the one-transaction-per-state-change and the swallowing —
 * none of which need a query planner to demonstrate, and all of which would be
 * hidden behind one if the test had to set up a real database to see them.
 */
type MockRow = {
  id: string
  owner_id: string
  payload: string
  has_more: number
  cursor: string | null
  activity_at: number
}

type MockOrganizationRow = { id: string; owner_id: string; name: string }

type MockMessageRow = {
  id: string
  conversation_id: string
  owner_id: string
  created_at: number
  payload: string
}

/** Same columns as a Message row; a different table, and a different claim. */
type MockOutboxRow = MockMessageRow

type MockFile = {
  userVersion: number
  rows: MockRow[]
  organizations: MockOrganizationRow[]
  messages: MockMessageRow[]
  outbox: MockOutboxRow[]
}

const mockFiles = new Map<string, MockFile>()
const mockStatements: string[] = []
const mockDeleted: string[] = []
const mockFails = { open: false, read: false, write: false }
const mockCounts = { transactions: 0 }

jest.mock('expo-sqlite', () => {
  class MockDatabase {
    name: string

    constructor(name: string) {
      this.name = name
    }

    private get file(): MockFile {
      const file = mockFiles.get(this.name)
      if (!file) throw new Error(`database ${this.name} is gone`)
      return file
    }

    closeSync() {}

    execSync(source: string) {
      mockStatements.push(source)
      if (source.includes('CREATE TABLE conversations')) this.file.rows = []
      if (source.includes('CREATE TABLE organizations')) this.file.organizations = []
      if (source.includes('CREATE TABLE messages')) this.file.messages = []
      if (source.includes('CREATE TABLE outbox')) this.file.outbox = []
      const stamped = /PRAGMA user_version = (\d+)/.exec(source)
      if (stamped) this.file.userVersion = Number(stamped[1])
    }

    getFirstSync(source: string, ...params: unknown[]) {
      if (source.trim() === 'PRAGMA user_version') {
        return { user_version: this.file.userVersion }
      }
      if (mockFails.read) throw new Error('database disk image is malformed')
      mockStatements.push(source)
      if (source.startsWith('SELECT has_more, cursor FROM conversations')) {
        const row = this.file.rows.find(
          (each) => each.owner_id === params[0] && each.id === params[1],
        )
        return row ? { has_more: row.has_more, cursor: row.cursor } : null
      }
      return null
    }

    /** The one read on the write path — see `storedThreads`. Same rows either way. */
    async getAllAsync(source: string, ...params: unknown[]) {
      return this.getAllSync(source, ...params)
    }

    getAllSync(source: string, ...params: unknown[]) {
      if (mockFails.read) throw new Error('database disk image is malformed')
      mockStatements.push(source)
      if (source.includes('GROUP BY m.conversation_id')) return this.storedThreads(params)
      if (source.includes('FROM outbox')) return this.outboxRows(params)
      if (source.includes('FROM messages')) return this.messagePage(source, params)
      const table = source.includes('FROM organizations') ? this.file.organizations : this.file.rows
      return table.filter((row) => row.owner_id === params[0])
    }

    /**
     * What a sweep counts: one entry per thread holding Messages, joined to the
     * activity its conversation row carries. A thread whose row has gone joins
     * to nothing, which is the null the real `LEFT JOIN` answers with.
     */
    private storedThreads(params: unknown[]) {
      const [ownerId] = params as [string]
      const counts = new Map<string, number>()
      for (const row of this.file.messages) {
        if (row.owner_id !== ownerId) continue
        counts.set(row.conversation_id, (counts.get(row.conversation_id) ?? 0) + 1)
      }

      return [...counts].map(([conversation_id, message_count]) => ({
        conversation_id,
        message_count,
        activity_at:
          this.file.rows.find((row) => row.owner_id === ownerId && row.id === conversation_id)
            ?.activity_at ?? null,
      }))
    }

    /**
     * The two reads a thread makes, in the order and with the bound the real
     * index gives them: newest first, so `LIMIT` takes the page nearest the one
     * on screen, and — when a Message is named — strictly before it.
     */
    private messagePage(source: string, params: unknown[]) {
      const [ownerId, conversationId] = params as [string, string]
      const held = this.file.messages
        .filter((row) => row.owner_id === ownerId && row.conversation_id === conversationId)
        .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id))

      if (!source.includes('created_at <')) {
        return held.slice(0, params[2] as number)
      }

      const [, , at, , id, limit] = params as [string, string, number, number, string, number]
      return held
        .filter((row) => row.created_at < at || (row.created_at === at && row.id < id))
        .slice(0, limit)
    }

    /** One thread's Outbox, oldest first — the order the real query asks for. */
    private outboxRows(params: unknown[]) {
      const [ownerId, conversationId] = params as [string, string]
      return this.file.outbox
        .filter((row) => row.owner_id === ownerId && row.conversation_id === conversationId)
        .sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id))
    }

    async runAsync(source: string, ...params: unknown[]) {
      if (mockFails.write) throw new Error('database is locked')
      mockStatements.push(source)

      if (source.startsWith('DELETE FROM conversations WHERE owner_id')) {
        this.file.rows = this.file.rows.filter((row) => row.owner_id !== params[0])
      }
      if (source.startsWith('INSERT INTO conversations')) {
        const [id, owner_id, payload, has_more, cursor, activity_at] = params as [
          string,
          string,
          string,
          number,
          string | null,
          number,
        ]
        this.file.rows.push({ id, owner_id, payload, has_more, cursor, activity_at })
      }
      if (source.startsWith('DELETE FROM organizations WHERE owner_id')) {
        this.file.organizations = this.file.organizations.filter(
          (row) => row.owner_id !== params[0],
        )
      }
      if (source.startsWith('INSERT INTO organizations')) {
        const [id, owner_id, name] = params as [string, string, string]
        this.file.organizations.push({ id, owner_id, name })
      }

      if (source.startsWith('DELETE FROM messages') && source.includes('conversation_id NOT IN')) {
        const [owner_id] = params as [string]
        const kept = new Set(
          this.file.rows.filter((row) => row.owner_id === owner_id).map((row) => row.id),
        )
        this.file.messages = this.file.messages.filter(
          (row) => row.owner_id !== owner_id || kept.has(row.conversation_id),
        )
      } else if (source.startsWith('DELETE FROM messages') && source.includes('id NOT IN')) {
        // The shortening: all but a thread's newest `limit`, ordered by
        // the same two columns the index is on.
        const [owner_id, conversation_id, , , limit] = params as [
          string,
          string,
          string,
          string,
          number,
        ]
        const kept = new Set(
          this.file.messages
            .filter((row) => row.owner_id === owner_id && row.conversation_id === conversation_id)
            .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id))
            .slice(0, limit)
            .map((row) => row.id),
        )
        this.file.messages = this.file.messages.filter(
          (row) =>
            row.owner_id !== owner_id ||
            row.conversation_id !== conversation_id ||
            kept.has(row.id),
        )
      } else if (source.startsWith('DELETE FROM messages')) {
        const [owner_id, conversation_id] = params as [string, string]
        this.file.messages = this.file.messages.filter(
          (row) => row.owner_id !== owner_id || row.conversation_id !== conversation_id,
        )
      }
      if (source.startsWith('INSERT OR REPLACE INTO messages')) {
        const [id, conversation_id, owner_id, created_at, payload] = params as [
          string,
          string,
          string,
          number,
          string,
        ]
        this.file.messages = this.file.messages.filter(
          (row) =>
            row.owner_id !== owner_id ||
            row.conversation_id !== conversation_id ||
            row.id !== id,
        )
        this.file.messages.push({ id, conversation_id, owner_id, created_at, payload })
      }
      if (source.startsWith('DELETE FROM outbox') && source.includes('conversation_id NOT IN')) {
        const [owner_id] = params as [string]
        const kept = new Set(
          this.file.rows.filter((row) => row.owner_id === owner_id).map((row) => row.id),
        )
        this.file.outbox = this.file.outbox.filter(
          (row) => row.owner_id !== owner_id || kept.has(row.conversation_id),
        )
      } else if (source.startsWith('DELETE FROM outbox')) {
        const [owner_id, conversation_id, id] = params as [string, string, string]
        this.file.outbox = this.file.outbox.filter(
          (row) =>
            row.owner_id !== owner_id ||
            row.conversation_id !== conversation_id ||
            row.id !== id,
        )
      }
      if (source.startsWith('INSERT OR REPLACE INTO outbox')) {
        const [id, conversation_id, owner_id, created_at, payload] = params as [
          string,
          string,
          string,
          number,
          string,
        ]
        this.file.outbox = this.file.outbox.filter(
          (row) =>
            row.owner_id !== owner_id ||
            row.conversation_id !== conversation_id ||
            row.id !== id,
        )
        this.file.outbox.push({ id, conversation_id, owner_id, created_at, payload })
      }
      if (source.startsWith('UPDATE conversations SET has_more')) {
        const [has_more, cursor, owner_id, id] = params as [number, string | null, string, string]
        const row = this.file.rows.find((each) => each.owner_id === owner_id && each.id === id)
        if (row) {
          row.has_more = has_more
          row.cursor = cursor
        }
      }
      return { lastInsertRowId: 0, changes: 1 }
    }

    // Rolled back on a throw, the way a real transaction is: a half-written list
    // is the one outcome a replace-everything write must never leave behind.
    async withTransactionAsync(task: () => Promise<void>) {
      mockCounts.transactions += 1
      const conversations = this.file.rows.map((row) => ({ ...row }))
      const organizations = [...this.file.organizations]
      const messages = [...this.file.messages]
      const outbox = [...this.file.outbox]
      try {
        await task()
      } catch (error) {
        this.file.rows = conversations
        this.file.organizations = organizations
        this.file.messages = messages
        this.file.outbox = outbox
        throw error
      }
    }
  }

  return {
    openDatabaseSync(name: string) {
      if (mockFails.open) throw new Error('unable to open database file')
      if (!mockFiles.has(name)) {
        mockFiles.set(name, {
          userVersion: 0,
          rows: [],
          organizations: [],
          messages: [],
          outbox: [],
        })
      }
      return new MockDatabase(name)
    },
    deleteDatabaseSync(name: string) {
      mockDeleted.push(name)
      mockFiles.delete(name)
    },
  }
})

type Store = typeof import('@/lib/conversation-store')

/**
 * A fresh module for every test: the connection, the queue and the record of
 * what is already on disk are all module state, which is what a cold start
 * resets and a test has to as well.
 */
function loadStore(): Store {
  jest.resetModules()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/lib/conversation-store') as Store
}

const DATABASE_NAME = 'joychat-store.db'

function conversation(id: string, overrides: Partial<Conversation> = {}): Conversation {
  return {
    id,
    organizationId: 'org-1',
    // Supplied by the round trip through `parseConversation`, so a fixture
    // compared against what came back off the disk has to carry it too.
    communityId: null,
    type: 'support_dm',
    lastMessageAt: '2026-08-13T08:00:00.000Z',
    lastMessagePreview: 'Hello',
    lastMessageMine: false,
    lastMessageReceiptStatus: null,
    lastMessageRead: true,
    unreadCount: 0,
    ...overrides,
  } as Conversation
}

/** A database some other build left behind, with rows in it. */
function seed(
  userVersion: number,
  rows: MockRow[] = [],
  organizations: MockOrganizationRow[] = [],
  messages: MockMessageRow[] = [],
  outbox: MockOutboxRow[] = [],
) {
  mockFiles.set(DATABASE_NAME, { userVersion, rows, organizations, messages, outbox })
}

const NO_NAMES: ReadonlyMap<string, string> = new Map()

/** The one call every test below makes, without the fields it is not about. */
function save(
  store: Store,
  ownerId: string,
  conversations: readonly Conversation[],
  organizationNames: ReadonlyMap<string, string> = NO_NAMES,
): Promise<void> {
  return store.saveStore(ownerId, { conversations, organizationNames })
}

function rowFor(ownerId: string, value: Conversation): MockRow {
  return {
    id: value.id,
    owner_id: ownerId,
    payload: JSON.stringify(value),
    has_more: 1,
    cursor: null,
    activity_at: value.lastMessageAt ? Date.parse(value.lastMessageAt) : 0,
  }
}

function schemaCreations(): number {
  return mockStatements.filter((source) => source.includes('CREATE TABLE conversations')).length
}

beforeEach(() => {
  mockFiles.clear()
  mockStatements.length = 0
  mockDeleted.length = 0
  mockFails.open = false
  mockFails.read = false
  mockFails.write = false
  mockCounts.transactions = 0
})

describe('the schema', () => {
  it('creates the table and stamps the version on a device that has none', async () => {
    const store = loadStore()

    expect(store.restoreStore('viewer-1').conversations).toEqual([])
    expect(schemaCreations()).toBe(1)
    expect(mockFiles.get(DATABASE_NAME)?.userVersion).toBe(STORE_SCHEMA_VERSION)
  })

  /**
   * Migration is discard, not transform — and the file rather than its tables,
   * because a newer schema's tables are ones this build cannot even name.
   */
  it.each([
    ['older', STORE_SCHEMA_VERSION - 1],
    ['newer', STORE_SCHEMA_VERSION + 1],
  ])('deletes a database written at a %s version', async (_label, version) => {
    seed(version, [rowFor('viewer-1', conversation('conv-1'))])
    const store = loadStore()

    expect(store.restoreStore('viewer-1').conversations).toEqual([])
    expect(mockDeleted).toEqual([DATABASE_NAME])
    expect(mockFiles.get(DATABASE_NAME)?.userVersion).toBe(STORE_SCHEMA_VERSION)
  })

  it('leaves a database at this version where it is', async () => {
    seed(STORE_SCHEMA_VERSION, [rowFor('viewer-1', conversation('conv-1'))])
    const store = loadStore()

    expect(store.restoreStore('viewer-1').conversations).toHaveLength(1)
    expect(mockDeleted).toEqual([])
    expect(schemaCreations()).toBe(0)
  })

  it('opens once, however many times it is asked', async () => {
    const store = loadStore()

    store.restoreStore('viewer-1')
    await save(store, 'viewer-1', [conversation('conv-1')])

    expect(schemaCreations()).toBe(1)
  })
})

describe('restoreStore', () => {
  it('gives back what was written, for the person it was written for', async () => {
    const store = loadStore()
    const mine = [conversation('conv-1'), conversation('conv-2')]

    await save(store, 'viewer-1', mine)
    await save(store, 'viewer-2', [conversation('conv-9')])

    expect(store.restoreStore('viewer-1').conversations).toEqual(mine)
    expect(
      store.restoreStore('viewer-2').conversations.map((each) => each.id),
    ).toEqual(['conv-9'])
  })

  /** A phone is shared. Somebody else's support history is not this person's to see. */
  it('gives back nothing for a person this device has never held rows for', async () => {
    const store = loadStore()
    await save(store, 'viewer-1', [conversation('conv-1')])

    expect(store.restoreStore('viewer-2').conversations).toEqual([])
  })

  it('gives back nothing rather than throwing when the database will not open', async () => {
    mockFails.open = true
    const store = loadStore()

    expect(store.restoreStore('viewer-1').conversations).toEqual([])
  })

  it('gives back nothing rather than throwing when the read fails', () => {
    const store = loadStore()
    mockFails.read = true

    expect(store.restoreStore('viewer-1').conversations).toEqual([])
  })

  /**
   * Every write after an unreadable read would fail against the same database,
   * which would leave the Store dead for the life of the install rather than for
   * one launch.
   */
  it('discards a database it could not read, so the next write still lands', async () => {
    const store = loadStore()
    mockFails.read = true
    store.restoreStore('viewer-1')
    expect(mockDeleted).toContain(DATABASE_NAME)

    mockFails.read = false
    await save(store, 'viewer-1', [conversation('conv-1')])

    expect(store.restoreStore('viewer-1').conversations).toHaveLength(1)
  })

  it('carries the Unread count a badge is drawn from', async () => {
    const store = loadStore()
    await save(store, 'viewer-1', [
      conversation('conv-1', { unreadCount: 4, lastMessageRead: false }),
    ])

    expect(store.restoreStore('viewer-1').conversations[0]).toMatchObject({
      unreadCount: 4,
      lastMessageRead: false,
    })
  })
})

describe('saveStore', () => {
  it('replaces the list rather than adding to it', async () => {
    const store = loadStore()

    await save(store, 'viewer-1', [conversation('conv-1'), conversation('conv-2')])
    await save(store, 'viewer-1', [conversation('conv-1')])

    expect(
      store.restoreStore('viewer-1').conversations.map((each) => each.id),
    ).toEqual(['conv-1'])
  })

  it("leaves another person's rows where they are", async () => {
    const store = loadStore()

    await save(store, 'viewer-2', [conversation('conv-9')])
    await save(store, 'viewer-1', [conversation('conv-1')])

    expect(store.restoreStore('viewer-2').conversations).toHaveLength(1)
  })

  it('writes one transaction per state change', async () => {
    const store = loadStore()

    await save(store, 'viewer-1', [conversation('conv-1'), conversation('conv-2')])

    expect(mockCounts.transactions).toBe(1)
  })

  /**
   * A burst — a resync merging forty rows, then a socket event a moment later —
   * costs the transaction already under way plus one for the state that is
   * finally true, rather than one each. What lands on disk is the newest.
   */
  it('coalesces a burst to the state that is true when it gets there', async () => {
    const store = loadStore()

    void save(store, 'viewer-1', [conversation('conv-1')])
    void save(store, 'viewer-1', [conversation('conv-2')])
    await save(store, 'viewer-1', [conversation('conv-3')])

    expect(mockCounts.transactions).toBe(2)
    expect(
      store.restoreStore('viewer-1').conversations.map((each) => each.id),
    ).toEqual(['conv-3'])
  })

  /** Persistence is subordinate to the app working: a failed write is not a failure. */
  it('swallows a write that failed', async () => {
    const store = loadStore()
    mockFails.write = true

    await expect(save(store, 'viewer-1', [conversation('conv-1')])).resolves
      .toBeUndefined()
  })

  it('leaves the rows it already had when a write fails half way', async () => {
    const store = loadStore()
    await save(store, 'viewer-1', [conversation('conv-1')])

    mockFails.write = true
    await save(store, 'viewer-1', [conversation('conv-2')])
    mockFails.write = false

    expect(
      store.restoreStore('viewer-1').conversations.map((each) => each.id),
    ).toEqual(['conv-1'])
  })

  it('writes again after a failure rather than believing the failed write landed', async () => {
    const store = loadStore()
    mockFails.write = true
    await save(store, 'viewer-1', [conversation('conv-1')])

    mockFails.write = false
    await save(store, 'viewer-1', [conversation('conv-1')])

    expect(store.restoreStore('viewer-1').conversations).toHaveLength(1)
  })

  /**
   * A cold start Restores and then renders, and rendering is what triggers the
   * write-through. Writing back the very list that was just read would spend a
   * transaction at the busiest moment of a launch to change nothing.
   */
  it('does not write back the list it just restored', async () => {
    seed(STORE_SCHEMA_VERSION, [rowFor('viewer-1', conversation('conv-1'))])
    const store = loadStore()

    const restored = store.restoreStore('viewer-1')
    await save(store, 'viewer-1', restored.conversations, restored.organizationNames)

    expect(mockCounts.transactions).toBe(0)
  })

  /**
   * The skip above is about a state the disk already holds, and the names are
   * half of that state: a Customer's second request answering after the first
   * changes the titles without changing the rows.
   */
  it('writes a state that changed only the organization names', async () => {
    seed(STORE_SCHEMA_VERSION, [rowFor('viewer-1', conversation('conv-1'))])
    const store = loadStore()

    const restored = store.restoreStore('viewer-1')
    await save(store, 'viewer-1', restored.conversations, new Map([['org-1', 'Acme Corp']]))

    expect(mockCounts.transactions).toBe(1)
    expect(store.restoreStore('viewer-1').organizationNames.get('org-1')).toBe('Acme Corp')
  })

  it('writes the next state after a restore', async () => {
    seed(STORE_SCHEMA_VERSION, [rowFor('viewer-1', conversation('conv-1'))])
    const store = loadStore()

    const restored = store.restoreStore('viewer-1')
    await save(store, 'viewer-1', [...restored.conversations, conversation('conv-2')])

    expect(mockCounts.transactions).toBe(1)
    expect(store.restoreStore('viewer-1').conversations).toHaveLength(2)
  })

  it('writes nothing anywhere when the database will not open', async () => {
    mockFails.open = true
    const store = loadStore()

    await expect(save(store, 'viewer-1', [conversation('conv-1')])).resolves
      .toBeUndefined()
  })
})

/**
 * A conversation carries an organization id and no name, and the name is what a
 * Customer's Support DM is titled with. Restoring the rows without them would
 * draw every support thread as `Support` and then rename it a second later.
 */
describe('organization names', () => {
  const acme = new Map([['org-1', 'Acme Corp']])

  it('come back with the conversations they title', async () => {
    const store = loadStore()

    await save(store, 'viewer-1', [conversation('conv-1')], acme)

    expect(store.restoreStore('viewer-1').organizationNames.get('org-1')).toBe('Acme Corp')
  })

  it('are written in the same transaction as the rows', async () => {
    const store = loadStore()

    await save(store, 'viewer-1', [conversation('conv-1')], acme)

    expect(mockCounts.transactions).toBe(1)
  })

  it('are replaced rather than added to, like the rows', async () => {
    const store = loadStore()

    await save(store, 'viewer-1', [conversation('conv-1')], acme)
    await save(store, 'viewer-1', [conversation('conv-1')], new Map([['org-2', 'Other Ltd']]))

    const { organizationNames } = store.restoreStore('viewer-1')
    expect([...organizationNames]).toEqual([['org-2', 'Other Ltd']])
  })

  it('belong to the person they were fetched for', async () => {
    const store = loadStore()

    await save(store, 'viewer-1', [conversation('conv-1')], acme)

    expect(store.restoreStore('viewer-2').organizationNames.size).toBe(0)
  })

  it('are empty for a staff member, who has none to title anything with', async () => {
    const store = loadStore()

    await save(store, 'viewer-1', [conversation('conv-1')])

    expect(store.restoreStore('viewer-1').organizationNames.size).toBe(0)
  })
})

describe('wipeStore', () => {
  it('destroys the database, whoever the rows belonged to', async () => {
    const store = loadStore()
    await save(store, 'viewer-1', [conversation('conv-1')])
    await save(store, 'viewer-2', [conversation('conv-9')])

    await store.wipeStore()

    expect(mockDeleted).toContain(DATABASE_NAME)
    expect(store.restoreStore('viewer-1').conversations).toEqual([])
    expect(store.restoreStore('viewer-2').conversations).toEqual([])
  })

  it('does not let a write already on its way put back what it removed', async () => {
    const store = loadStore()

    void save(store, 'viewer-1', [conversation('conv-1')])
    await store.wipeStore()

    expect(store.restoreStore('viewer-1').conversations).toEqual([])
  })

  it('leaves a usable database behind', async () => {
    const store = loadStore()
    await store.wipeStore()

    await save(store, 'viewer-1', [conversation('conv-1')])

    expect(store.restoreStore('viewer-1').conversations).toHaveLength(1)
  })
})

/**
 * The half of a Wipe that is not the delete: that what it removed stays removed.
 *
 * A Session expiry discards the credential before the screens are told, so for a
 * moment something still believing it is signed in can queue a write. These are
 * about that moment.
 */
describe('a Wipe bars the people it took the Store from', () => {
  it('refuses a write queued after it by somebody it just wiped', async () => {
    const store = loadStore()
    store.restoreStore('viewer-1')
    await save(store, 'viewer-1', [conversation('conv-1')])

    await store.wipeStore()
    await save(store, 'viewer-1', [conversation('conv-1')])

    expect(store.restoreStore('viewer-1').conversations).toEqual([])
  })

  it('refuses their Messages too, which is where the words actually are', async () => {
    const store = loadStore()
    store.restoreStore('viewer-1')
    await saveThread(store, 'viewer-1', 'conv-1', { messages: thread(3) })

    await store.wipeStore()
    await saveThread(store, 'viewer-1', 'conv-1', { messages: thread(3) })

    expect(restored(store, 'viewer-1', 'conv-1', 50).messages).toEqual([])
  })

  it('refuses a frontier, so nothing of the thread is recorded either', async () => {
    const store = loadStore()
    store.restoreStore('viewer-1')
    await save(store, 'viewer-1', [conversation('conv-1')])
    await store.wipeStore()

    await saveThread(store, 'viewer-1', 'conv-1', { hasMore: false, cursor: 'c' })

    expect(restored(store, 'viewer-1', 'conv-1', 50).messages).toEqual([])
  })

  // The bar is a Wipe's, not a permanent verdict: signing back in Restores, and
  // Restoring is the moment the disk and this person are the same again.
  it('lets somebody back in the moment they Restore', async () => {
    const store = loadStore()
    store.restoreStore('viewer-1')
    await store.wipeStore()

    // A sign-in Restores before anything writes — see `lib/conversation-inbox`.
    store.restoreStore('viewer-1')
    await save(store, 'viewer-1', [conversation('conv-1')])

    expect(store.restoreStore('viewer-1').conversations).toHaveLength(1)
  })

  it('bars every person it wiped, not only the one who was on screen', async () => {
    const store = loadStore()
    store.restoreStore('viewer-1')
    store.restoreStore('viewer-2')
    await store.wipeStore()

    await save(store, 'viewer-1', [conversation('conv-1')])
    await save(store, 'viewer-2', [conversation('conv-9')])

    expect(store.restoreStore('viewer-1').conversations).toEqual([])
    expect(store.restoreStore('viewer-2').conversations).toEqual([])
  })

  // Nobody a Wipe never served can be somebody whose data it removed, so the bar
  // has nothing to say about them.
  it('says nothing about a person it never held anything for', async () => {
    const store = loadStore()
    store.restoreStore('viewer-1')
    await store.wipeStore()

    await save(store, 'viewer-2', [conversation('conv-9')])

    expect(store.restoreStore('viewer-2').conversations).toHaveLength(1)
  })

  // The database this build cannot read is discarded and begun again, which is a
  // reason to Restore nothing and never a reason to stop writing.
  it('is not raised by a Restore that had to discard an unreadable database', async () => {
    const store = loadStore()
    mockFails.read = true
    store.restoreStore('viewer-1')
    mockFails.read = false

    await save(store, 'viewer-1', [conversation('conv-1')])

    expect(store.restoreStore('viewer-1').conversations).toHaveLength(1)
  })
})

const THREAD_BEGAN = Date.parse('2026-08-13T08:00:00.000Z')

function message(id: string, minute: number, overrides: Partial<CustomerMessage> = {}): Message {
  const at = new Date(THREAD_BEGAN + minute * 60_000).toISOString()
  return {
    id,
    body: id,
    messageType: 'text',
    createdAt: at,
    editedAt: null,
    replyTo: null,
    reactions: [],
    attachments: [],
    receiptStatus: 'sent',
    fromCompany: true,
    ...overrides,
  }
}

/** A run of Messages, oldest first, the way a thread holds them. */
function thread(count: number, from = 1): Message[] {
  return Array.from({ length: count }, (_, index) => message(`msg-${from + index}`, from + index))
}

function ids(messages: readonly Message[]): string[] {
  return messages.map((each) => each.id)
}

/**
 * Whoever is reading. Staff, so that nothing a Customer would be spared is
 * filtered on the way out and every test below is about the disk rather than
 * about `visibleMessages`, which is tested where it lives.
 */
const VIEWER: ThreadViewer = { id: 'viewer-1', role: 'agent', conversationType: 'support_dm' }

/**
 * The one call every thread test below makes, without the fields it is not
 * about.
 *
 * The two halves it is not given keep their identity between calls, the way the
 * reducers in `lib/thread-state` leave them: a test about the Outbox must
 * not also be writing Messages, and a state that did not move is exactly how
 * `saveThread` is told so.
 */
const NO_MESSAGES: Message[] = []
const NO_UNSENT: UnsentMessage[] = []

function saveThread(
  store: Store,
  ownerId: string,
  conversationId: string,
  state: Partial<ThreadState> = {},
): Promise<void> {
  return store.saveThread(ownerId, conversationId, {
    ...emptyThread(),
    messages: NO_MESSAGES,
    unsent: NO_UNSENT,
    ...state,
  })
}

/** And the one read: what the screen would draw for a thread. */
function restored(
  store: Store,
  ownerId: string,
  conversationId: string,
  limit = 50,
): ThreadState {
  return store.restoreThread(ownerId, conversationId, VIEWER, limit)
}

/**
 * An Outbox as a thread carries one.
 *
 * Written *sending*, because that is the state that matters: a send in flight
 * when the process died is the case the Outbox exists for, and it must come back
 * failed like every other. See `fromOutboxRows`.
 */
function outbox(messages: readonly Message[]): UnsentMessage[] {
  return messages.map((message) => ({ message, state: 'sending' as const }))
}

function statementsFor(fragment: string): number {
  return mockStatements.filter((source) => source.includes(fragment)).length
}

describe('restoreThread', () => {
  it('has nothing for a thread this device has never held', async () => {
    const store = loadStore()

    expect(restored(store, 'viewer-1', 'conv-1', 50).messages).toEqual([])
  })

  it('gives back the Messages that were written', async () => {
    const store = loadStore()
    const written = thread(3)

    await saveThread(store, 'viewer-1', 'conv-1', { messages: written })

    expect(ids(restored(store, 'viewer-1', 'conv-1', 50).messages)).toEqual(ids(written))
  })

  /**
   * A page, not a thread. What is below it stays on the disk and is read by
   * `restoreOlderMessages` when somebody scrolls into it — which is what keeps
   * opening a thread that has been read for an hour as cheap as opening one
   * that has not.
   */
  it('reads back the newest page and no more', async () => {
    const store = loadStore()

    await saveThread(store, 'viewer-1', 'conv-1', { messages: thread(10) })

    expect(ids(restored(store, 'viewer-1', 'conv-1', 3).messages)).toEqual([
      'msg-8',
      'msg-9',
      'msg-10',
    ])
  })

  it('holds one viewer thread apart from another', async () => {
    const store = loadStore()

    await saveThread(store, 'viewer-1', 'conv-1', { messages: thread(2) })

    expect(restored(store, 'viewer-2', 'conv-1', 50).messages).toEqual([])
  })

  it('holds one thread apart from another', async () => {
    const store = loadStore()

    await saveThread(store, 'viewer-1', 'conv-1', { messages: thread(2) })

    expect(restored(store, 'viewer-1', 'conv-2', 50).messages).toEqual([])
  })

  it('gives back the frontier the thread recorded', async () => {
    const store = loadStore()

    const messages = thread(2)
    await save(store, 'viewer-1', [conversation('conv-1')])
    await saveThread(store, 'viewer-1', 'conv-1', { messages })
    await saveThread(store, 'viewer-1', 'conv-1', { messages, hasMore: false, cursor: 'msg-1' })

    expect(restored(store, 'viewer-1', 'conv-1', 50)).toMatchObject({
      hasMore: false,
      cursor: 'msg-1',
    })
  })

  /**
   * Every row written before there was a frontier to write. Falling back to
   * nothing would mean "ask from the top", which on a thread this device is
   * already holding history for would fetch back down through every page it has.
   */
  it('falls back to the oldest Message held when the row has no cursor', async () => {
    const store = loadStore()

    await save(store, 'viewer-1', [conversation('conv-1')])
    await saveThread(store, 'viewer-1', 'conv-1', { messages: thread(3) })

    expect(restored(store, 'viewer-1', 'conv-1', 50)).toMatchObject({
      hasMore: true,
      cursor: 'msg-1',
    })
  })

  it('has nothing when the database cannot be read, and discards it', async () => {
    const store = loadStore()
    await saveThread(store, 'viewer-1', 'conv-1', { messages: thread(2) })
    mockFails.read = true

    expect(restored(store, 'viewer-1', 'conv-1', 50).messages).toEqual([])
    expect(mockDeleted).toContain(DATABASE_NAME)
  })
})

describe('restoreOlderMessages', () => {
  it('gives back the page before the Message it is asked about', async () => {
    const store = loadStore()
    const written = thread(10)
    await saveThread(store, 'viewer-1', 'conv-1', { messages: written })

    const older = store.restoreOlderMessages('viewer-1', 'conv-1', written[7], 3)

    expect(ids(older)).toEqual(['msg-5', 'msg-6', 'msg-7'])
  })

  it('gives back nothing at the bottom of what this device holds', async () => {
    const store = loadStore()
    const written = thread(3)
    await saveThread(store, 'viewer-1', 'conv-1', { messages: written })

    expect(store.restoreOlderMessages('viewer-1', 'conv-1', written[0], 50)).toEqual([])
  })

  it('gives back nothing for a thread this device has never held', async () => {
    const store = loadStore()

    expect(store.restoreOlderMessages('viewer-1', 'conv-1', message('msg-9', 9), 50)).toEqual([])
  })
})

describe("saveThread: a thread's Messages", () => {
  it('adds to a thread rather than replacing it', async () => {
    const store = loadStore()

    await saveThread(store, 'viewer-1', 'conv-1', { messages: thread(2) })
    await saveThread(store, 'viewer-1', 'conv-1', { messages: thread(4) })

    expect(ids(restored(store, 'viewer-1', 'conv-1', 50).messages)).toEqual([
      'msg-1',
      'msg-2',
      'msg-3',
      'msg-4',
    ])
  })

  /**
   * A Message that has been confirmed does not leave the thread it is in; what
   * changes is its receipts. So the row is replaced by id rather than joined by
   * a second copy of the same Message.
   */
  it('replaces a Message whose receipt has moved', async () => {
    const store = loadStore()

    await saveThread(store, 'viewer-1', 'conv-1', { messages: [message('msg-1', 1)] })
    await saveThread(store, 'viewer-1', 'conv-1', { messages: [
      message('msg-1', 1, { receiptStatus: 'read' }),
    ] })

    const held = restored(store, 'viewer-1', 'conv-1', 50).messages
    expect(held).toHaveLength(1)
    expect(held[0].receiptStatus).toBe('read')
  })

  /**
   * The one case where the Messages are not more of the thread but a different
   * run of it. What was dropped from the screen has to leave the disk with it,
   * or the next scroll back would read straight into a fragment of a thread
   * with unfetched history between them.
   */
  it('drops what it replaces', async () => {
    const store = loadStore()

    await saveThread(store, 'viewer-1', 'conv-1', { messages: thread(3) })
    // A run of history sharing nothing with the one held, which is what a
    // replace *is*: `saveThread` reads that off the two states rather than
    // being told.
    await saveThread(store, 'viewer-1', 'conv-1', { messages: thread(2, 90) })

    expect(ids(restored(store, 'viewer-1', 'conv-1', 50).messages)).toEqual([
      'msg-90',
      'msg-91',
    ])
  })

  /**
   * A thread's state change is a thread's state change, however many of its
   * three tables moved with it. The queue is filled first and drained after,
   * because `drain` runs as far as its first await the moment it is called.
   */
  it('costs one transaction when the Messages and the frontier move together', async () => {
    const store = loadStore()
    await save(store, 'viewer-1', [conversation('conv-1')])
    mockCounts.transactions = 0

    await saveThread(store, 'viewer-1', 'conv-1', {
      messages: thread(3),
      hasMore: false,
      cursor: 'msg-1',
    })

    expect(mockCounts.transactions).toBe(1)
  })

  /**
   * The decision this used to be told rather than make. A thread handed over for
   * the first time is more of nothing: there is no held run for the new one to
   * fail to continue, and reading it as a replace would drop the rows a Restore
   * had just put on screen.
   */
  it('merges a thread it is being handed for the first time', async () => {
    const first = loadStore()
    await saveThread(first, 'viewer-1', 'conv-1', { messages: thread(3) })

    const second = loadStore()
    await saveThread(second, 'viewer-1', 'conv-1', { messages: thread(2, 90) })

    expect(ids(restored(second, 'viewer-1', 'conv-1', 50).messages)).toEqual([
      'msg-1',
      'msg-2',
      'msg-3',
      'msg-90',
      'msg-91',
    ])
  })

  /**
   * What the screen could not answer while it kept one slot for the thread it
   * had last written. Somebody who opens one thread, then another, then the
   * first again is asking the same question about the first thread both times.
   */
  it("remembers each thread's last run, not just the last one written", async () => {
    const store = loadStore()

    await saveThread(store, 'viewer-1', 'conv-1', { messages: thread(3) })
    await saveThread(store, 'viewer-1', 'conv-2', { messages: thread(1) })
    await saveThread(store, 'viewer-1', 'conv-1', { messages: thread(2, 90) })

    expect(ids(restored(store, 'viewer-1', 'conv-1', 50).messages)).toEqual([
      'msg-90',
      'msg-91',
    ])
  })

  it('leaves another thread alone when it replaces one', async () => {
    const store = loadStore()

    await saveThread(store, 'viewer-1', 'conv-2', { messages: thread(2) })
    await saveThread(store, 'viewer-1', 'conv-1', { messages: thread(3) })
    await saveThread(store, 'viewer-1', 'conv-1', { messages: thread(1, 90) })

    expect(restored(store, 'viewer-1', 'conv-2', 50).messages).toHaveLength(2)
  })

  it('writes only what is not already the row on disk', async () => {
    const store = loadStore()
    const written = thread(3)
    await saveThread(store, 'viewer-1', 'conv-1', { messages: written })
    mockStatements.length = 0

    await saveThread(store, 'viewer-1', 'conv-1', { messages: [...written, message('msg-4', 4)] })

    expect(statementsFor('INSERT OR REPLACE INTO messages')).toBe(1)
  })

  /**
   * A thread that has just been Restored reaches its first state change holding
   * exactly the rows it read. A transaction that writes them back over
   * themselves is the one cost this whole arrangement exists to avoid.
   */
  it('writes nothing at all when a Restored thread has not changed', async () => {
    const store = loadStore()
    await saveThread(store, 'viewer-1', 'conv-1', { messages: thread(3) })

    const held = restored(store, 'viewer-1', 'conv-1', 50)
    mockCounts.transactions = 0
    await store.saveThread('viewer-1', 'conv-1', held)

    expect(mockCounts.transactions).toBe(0)
  })

  /**
   * A burst costs the transaction already under way plus one for the state that
   * is finally true, rather than one per arriving Message.
   */
  it('coalesces a burst to the thread that is true when it gets there', async () => {
    const store = loadStore()

    void saveThread(store, 'viewer-1', 'conv-1', { messages: thread(1) })
    void saveThread(store, 'viewer-1', 'conv-1', { messages: thread(2) })
    await saveThread(store, 'viewer-1', 'conv-1', { messages: thread(3) })

    expect(mockCounts.transactions).toBe(2)
    expect(restored(store, 'viewer-1', 'conv-1', 50).messages).toHaveLength(3)
  })

  /**
   * A drop that has been decided cannot be undecided by the next state to land
   * on top of it before the queue is drained.
   */
  it('keeps a replace that another state coalesced into', async () => {
    const store = loadStore()

    void saveThread(store, 'viewer-1', 'conv-1', { messages: thread(3) })
    void saveThread(store, 'viewer-1', 'conv-1', { messages: thread(1, 90) })
    // Continues the one before it, and so merges — into a replace already
    // decided and not yet drained.
    await saveThread(store, 'viewer-1', 'conv-1', { messages: thread(2, 90) })

    expect(ids(restored(store, 'viewer-1', 'conv-1', 50).messages)).toEqual([
      'msg-90',
      'msg-91',
    ])
  })

  it('says nothing when the write fails', async () => {
    const store = loadStore()
    mockFails.write = true

    await expect(saveThread(store, 'viewer-1', 'conv-1', { messages: thread(2) })).resolves.toBeUndefined()

    mockFails.write = false
    expect(restored(store, 'viewer-1', 'conv-1', 50).messages).toEqual([])
  })

  it('writes again after a write that failed', async () => {
    const store = loadStore()
    mockFails.write = true
    await saveThread(store, 'viewer-1', 'conv-1', { messages: thread(2) })

    mockFails.write = false
    await saveThread(store, 'viewer-1', 'conv-1', { messages: thread(2) })

    expect(restored(store, 'viewer-1', 'conv-1', 50).messages).toHaveLength(2)
  })
})

describe("saveThread: a thread's frontier", () => {
  /**
   * The list is replaced whole whenever anything anywhere changes, and a
   * frontier recorded by a thread has to survive that — otherwise every message
   * that arrived in any conversation would send this one back to the top.
   */
  it('survives the list being written over it', async () => {
    const store = loadStore()
    await save(store, 'viewer-1', [conversation('conv-1')])
    await saveThread(store, 'viewer-1', 'conv-1', { hasMore: false, cursor: 'msg-1' })

    await save(store, 'viewer-1', [conversation('conv-1'), conversation('conv-2')])

    expect(store.restoreStore('viewer-1').paging.get('conv-1')).toEqual({
      hasMore: false,
      cursor: 'msg-1',
    })
  })

  it('survives a restart, and is written back by the next list write', async () => {
    const first = loadStore()
    await save(first, 'viewer-1', [conversation('conv-1')])
    await saveThread(first, 'viewer-1', 'conv-1', { hasMore: false, cursor: 'msg-1' })

    const second = loadStore()
    second.restoreStore('viewer-1')
    await save(second, 'viewer-1', [conversation('conv-1')])

    expect(second.restoreStore('viewer-1').paging.get('conv-1')).toEqual({
      hasMore: false,
      cursor: 'msg-1',
    })
  })

  it('writes nothing when the frontier has not moved', async () => {
    const store = loadStore()
    await save(store, 'viewer-1', [conversation('conv-1')])
    await saveThread(store, 'viewer-1', 'conv-1', { hasMore: false, cursor: 'msg-1' })
    mockCounts.transactions = 0

    await saveThread(store, 'viewer-1', 'conv-1', { hasMore: false, cursor: 'msg-1' })

    expect(mockCounts.transactions).toBe(0)
  })
})

describe('a conversation that has left the list', () => {
  /**
   * The list is the unit. A thread nothing on screen can reach must not leave
   * its Messages behind on the disk for anything looking at the data directory
   * of this app to find.
   */
  it('takes its Messages with it', async () => {
    const store = loadStore()
    await save(store, 'viewer-1', [conversation('conv-1'), conversation('conv-2')])
    await saveThread(store, 'viewer-1', 'conv-2', { messages: thread(3) })

    await save(store, 'viewer-1', [conversation('conv-1')])

    expect(restored(store, 'viewer-1', 'conv-2', 50).messages).toEqual([])
  })

  it('leaves the threads that are still in it alone', async () => {
    const store = loadStore()
    await save(store, 'viewer-1', [conversation('conv-1'), conversation('conv-2')])
    await saveThread(store, 'viewer-1', 'conv-1', { messages: thread(3) })

    await save(store, 'viewer-1', [conversation('conv-1')])

    expect(restored(store, 'viewer-1', 'conv-1', 50).messages).toHaveLength(3)
  })

  it('leaves the threads of another person alone', async () => {
    const store = loadStore()
    await save(store, 'viewer-2', [conversation('conv-9')])
    await saveThread(store, 'viewer-2', 'conv-9', { messages: thread(2) })

    await save(store, 'viewer-1', [conversation('conv-1')])

    expect(restored(store, 'viewer-2', 'conv-9', 50).messages).toHaveLength(2)
  })
})

describe('wipeStore, with Messages on the disk', () => {
  it('leaves none of them behind', async () => {
    const store = loadStore()
    await saveThread(store, 'viewer-1', 'conv-1', { messages: thread(3) })

    await store.wipeStore()

    expect(restored(store, 'viewer-1', 'conv-1', 50).messages).toEqual([])
  })

  it('does not let a write already on its way put them back', async () => {
    const store = loadStore()

    void saveThread(store, 'viewer-1', 'conv-1', { messages: thread(3) })
    await store.wipeStore()

    expect(restored(store, 'viewer-1', 'conv-1', 50).messages).toEqual([])
  })
})

/**
 * The Store bounded, as the disk sees it. What is kept and what goes is decided
 * by `lib/store-eviction` and tested against a table there; what these are about
 * is the half a table cannot show — that a sweep runs after a write, that it
 * reaches the rows it named, and that a Conversation is never one of them.
 */
describe('eviction', () => {
  /** Threads named so their ids sort the opposite way to their activity. */
  function list(count: number): Conversation[] {
    return Array.from({ length: count }, (_unused, index) =>
      conversation(`conv-${String(index).padStart(3, '0')}`, {
        lastMessageAt: new Date(THREAD_BEGAN + (count - index) * 60_000).toISOString(),
      }),
    )
  }

  /** A person holding a Message in each of `count` threads, newest thread first. */
  async function held(store: Store, count: number, each = 1): Promise<Conversation[]> {
    const conversations = list(count)
    await save(store, 'viewer-1', conversations)
    for (const one of conversations) await saveThread(store, 'viewer-1', one.id, { messages: thread(each) })
    return conversations
  }

  it('keeps the Messages of the twenty most recently active threads', async () => {
    const store = loadStore()

    await held(store, 21)

    for (const id of list(21).slice(0, 20).map((one) => one.id)) {
      expect(restored(store, 'viewer-1', id, 50).messages).toHaveLength(1)
    }
  })

  it('drops the Messages of the twenty-first', async () => {
    const store = loadStore()

    await held(store, 21)
    // The last thread written is spared, so one more write is what collects it.
    await saveThread(store, 'viewer-1', 'conv-000', { messages: thread(2) })

    expect(restored(store, 'viewer-1', 'conv-020', 50).messages).toEqual([])
  })

  /**
   * The asymmetry the whole rule is built on: a list that has lost a row is a
   * list that lies about which conversations exist.
   */
  it('leaves every Conversation row where it is', async () => {
    const store = loadStore()

    await held(store, 30)

    expect(store.restoreStore('viewer-1').conversations).toHaveLength(30)
  })

  it('keeps a thread that lost its Messages fetchable, like one never opened', async () => {
    const store = loadStore()

    await held(store, 21)
    await saveThread(store, 'viewer-1', 'conv-000', { messages: thread(2) })

    expect(restored(store, 'viewer-1', 'conv-020', 50).messages).toEqual([])
    expect(
      store.restoreStore('viewer-1').conversations.some((one) => one.id === 'conv-020'),
    ).toBe(true)
  })

  /**
   * A cursor is where the next page reads backwards *from*. One left pointing at
   * history this device no longer holds would make the next scroll ask for the
   * page before something already gone, and read straight over everything
   * between it and what is on screen.
   */
  it('resets the paging of a thread it emptied', async () => {
    const store = loadStore()

    await held(store, 21)
    await saveThread(store, 'viewer-1', 'conv-020', {
      messages: thread(1),
      hasMore: false,
      cursor: 'msg-900',
    })
    await saveThread(store, 'viewer-1', 'conv-000', { messages: thread(2) })

    expect(
      mockFiles.get(DATABASE_NAME)?.rows.find((row) => row.id === 'conv-020'),
    ).toMatchObject({ has_more: 1, cursor: null })
  })

  /**
   * The case that is easy to miss: a shortened thread still has Messages, and
   * the cursor on its row is further back than the oldest of them.
   */
  it('resets the paging of a thread it shortened', async () => {
    const store = loadStore()
    await save(store, 'viewer-1', [conversation('conv-1'), conversation('conv-2')])
    const messages = thread(60)
    await saveThread(store, 'viewer-1', 'conv-1', { messages })
    await saveThread(store, 'viewer-1', 'conv-1', { messages, hasMore: true, cursor: 'msg-1' })

    await saveThread(store, 'viewer-1', 'conv-2', { messages: thread(1) })

    expect(mockFiles.get(DATABASE_NAME)?.rows.find((row) => row.id === 'conv-1')).toMatchObject({
      has_more: 1,
      cursor: null,
    })
  })

  /**
   * A sweep leaves one coherent run on the disk. Memory is still holding what it
   * held — for a thread scrolled deep, more of it and further back — and
   * patching that onto what is left is what would put a hole in it.
   */
  describe('a thread it took history from', () => {
    /** Deep enough to be shortened, then swept by a write of the other thread. */
    async function sweptThread(store: Store): Promise<Message[]> {
      await save(store, 'viewer-1', [conversation('conv-1'), conversation('conv-2')])
      const messages = thread(60)
      await saveThread(store, 'viewer-1', 'conv-1', { messages: messages })
      await saveThread(store, 'viewer-1', 'conv-2', { messages: thread(1) })
      return messages
    }

    it('takes no more of it until the thread is Restored', async () => {
      const store = loadStore()
      const messages = await sweptThread(store)

      // What a socket event leaves behind in a thread still mounted under the
      // one on screen.
      await saveThread(store, 'viewer-1', 'conv-1', { messages: [...messages, message('msg-61', 61)] })

      expect(restored(store, 'viewer-1', 'conv-1', 100).messages).toHaveLength(50)
    })

    /**
     * The hole this is really about: a page fetched from further back than
     * anything that survived would land under the fifty with the evicted history
     * missing in between, and nothing reading it back could tell.
     */
    it('takes no page from below what survived', async () => {
      const store = loadStore()
      const messages = await sweptThread(store)

      await saveThread(store, 'viewer-1', 'conv-1', { messages: [...thread(20, -30), ...messages] })

      const held = restored(store, 'viewer-1', 'conv-1', 100).messages
      expect(held).toHaveLength(50)
      expect(ids(held)).not.toContain('msg--30')
    })

    it('does not write its frontier back over the reset', async () => {
      const store = loadStore()
      const messages = await sweptThread(store)

      await saveThread(store, 'viewer-1', 'conv-1', { messages, hasMore: true, cursor: 'msg-1' })

      expect(mockFiles.get(DATABASE_NAME)?.rows.find((row) => row.id === 'conv-1')).toMatchObject({
        has_more: 1,
        cursor: null,
      })
    })

    /** A replace rebuilds the thread whole, so it cannot leave a hole in one. */
    it('accepts a replace, which rebuilds it rather than patching it', async () => {
      const store = loadStore()
      await sweptThread(store)

      await saveThread(store, 'viewer-1', 'conv-1', { messages: thread(3, 90) })

      expect(restored(store, 'viewer-1', 'conv-1', 100).messages).toHaveLength(3)
    })

    it('takes writes again once it has been Restored', async () => {
      const store = loadStore()
      const messages = await sweptThread(store)
      restored(store, 'viewer-1', 'conv-1', 100)

      await saveThread(store, 'viewer-1', 'conv-1', { messages: [...messages, message('msg-61', 61)] })

      expect(ids(restored(store, 'viewer-1', 'conv-1', 100).messages)).toContain(
        'msg-61',
      )
    })
  })

  it('does not let a later write of the list carry the old cursor back', async () => {
    const store = loadStore()
    const conversations = await held(store, 21)
    await saveThread(store, 'viewer-1', 'conv-020', {
      messages: thread(1),
      hasMore: false,
      cursor: 'msg-900',
    })
    await saveThread(store, 'viewer-1', 'conv-000', { messages: thread(2) })

    await save(store, 'viewer-1', [...conversations])

    expect(
      mockFiles.get(DATABASE_NAME)?.rows.find((row) => row.id === 'conv-020'),
    ).toMatchObject({ has_more: 1, cursor: null })
  })

  it('keeps the fifty newest Messages of a thread paged back further than that', async () => {
    const store = loadStore()
    await save(store, 'viewer-1', [conversation('conv-1'), conversation('conv-2')])

    await saveThread(store, 'viewer-1', 'conv-1', { messages: thread(60) })
    await saveThread(store, 'viewer-1', 'conv-2', { messages: thread(1) })

    const kept = restored(store, 'viewer-1', 'conv-1', 100).messages
    expect(kept).toHaveLength(50)
    expect(ids(kept)).toContain('msg-60')
    expect(ids(kept)).not.toContain('msg-10')
  })

  it('never chooses the thread the write it followed was for', async () => {
    const store = loadStore()
    await save(store, 'viewer-1', [conversation('conv-1')])

    await saveThread(store, 'viewer-1', 'conv-1', { messages: thread(60) })

    expect(restored(store, 'viewer-1', 'conv-1', 100).messages).toHaveLength(60)
  })

  it('sweeps after a write and never on its own', async () => {
    const store = loadStore()
    await held(store, 21)
    const before = statementsFor('GROUP BY m.conversation_id')

    store.restoreStore('viewer-1')
    await save(store, 'viewer-1', list(21))

    expect(statementsFor('GROUP BY m.conversation_id')).toBe(before)
  })

  /**
   * The other half of the asymmetry, and what keeps the Outbox out of reach when
   * it arrives: a sweep removes rows from `messages` and touches nothing else
   * but the frontier of a thread it just emptied.
   */
  it('writes nothing but Messages and the frontier of the thread it emptied', async () => {
    const store = loadStore()
    await held(store, 21)
    mockStatements.length = 0

    await saveThread(store, 'viewer-1', 'conv-000', { messages: thread(2) })

    const swept = mockStatements.slice(
      mockStatements.findIndex((source) => source.includes('GROUP BY m.conversation_id')),
    )
    expect(swept.filter((source) => source.startsWith('DELETE')).length).toBeGreaterThan(0)
    for (const source of swept) {
      if (source.startsWith('DELETE')) {
        expect(source.startsWith('DELETE FROM messages')).toBe(true)
      }
      if (source.startsWith('UPDATE')) {
        expect(source.startsWith('UPDATE conversations SET has_more')).toBe(true)
      }
      expect(source).not.toContain('outbox')
    }
  })

  it('leaves another person on this phone alone', async () => {
    const store = loadStore()
    await save(store, 'viewer-2', [conversation('conv-x')])
    await saveThread(store, 'viewer-2', 'conv-x', { messages: thread(3) })

    await held(store, 25)

    expect(restored(store, 'viewer-2', 'conv-x', 50).messages).toHaveLength(3)
  })

  it('leaves the Store alone when a sweep cannot be written', async () => {
    const store = loadStore()
    await held(store, 21)
    mockFails.write = true

    await saveThread(store, 'viewer-1', 'conv-000', { messages: thread(2) })
    mockFails.write = false

    expect(restored(store, 'viewer-1', 'conv-020', 50).messages).toHaveLength(1)
  })
})

/** A Message typed on this device: a local id, and nothing the server has said. */
function unsent(id: string, minute: number, overrides: Partial<CustomerMessage> = {}): Message {
  return message(`local-${id}`, minute, { fromCompany: false, ...overrides })
}

/** Statements against the Outbox, which the schema's own `CREATE TABLE` is not. */
function outboxStatements(): number {
  return statementsFor('INTO outbox') + statementsFor('FROM outbox')
}

function outboxIds(store: Store, ownerId: string, conversationId: string): string[] {
  return restored(store, ownerId, conversationId).unsent.map((entry) => entry.message.id)
}

describe('restoreThread: the Outbox', () => {
  it('has nothing for a thread this device has never held', () => {
    const store = loadStore()

    expect(restored(store, 'viewer-1', 'conv-1').unsent).toEqual([])
  })

  it('gives back what was never sent, oldest first', async () => {
    const store = loadStore()

    await saveThread(store, 'viewer-1', 'conv-1', { unsent: outbox([unsent('b', 2), unsent('a', 1)]) })

    expect(outboxIds(store, 'viewer-1', 'conv-1')).toEqual(['local-a', 'local-b'])
  })

  /**
   * The whole of the state mapping, and the reason the Outbox has no state
   * column: nobody knows whether a send that was in flight when the process died
   * landed, and *failed* is the only honest answer — it is the one that offers
   * to go again.
   */
  it('gives every Message back as failed, whatever it was doing when it was written', async () => {
    const store = loadStore()

    await saveThread(store, 'viewer-1', 'conv-1', { unsent: outbox([unsent('a', 1), unsent('b', 2)]) })

    expect(restored(store, 'viewer-1', 'conv-1').unsent.map((entry) => entry.state)).toEqual([
      'failed',
      'failed',
    ])
  })

  it('keeps a staged Attachment, device URI and all', async () => {
    const store = loadStore()
    const staged = unsent('a', 1, {
      messageType: 'media',
      attachments: [
        {
          type: 'image/jpeg',
          url: 'file:///var/mobile/tmp/photo.jpg',
          fileName: 'photo.jpg',
          size: 2048,
          durationSeconds: null,
          waveform: null,
        },
      ],
    })

    await saveThread(store, 'viewer-1', 'conv-1', { unsent: outbox([staged]) })

    expect(restored(store, 'viewer-1', 'conv-1').unsent[0].message).toEqual(staged)
  })

  it('holds one viewer apart from another', async () => {
    const store = loadStore()

    await saveThread(store, 'viewer-1', 'conv-1', { unsent: outbox([unsent('a', 1)]) })

    expect(restored(store, 'viewer-2', 'conv-1').unsent).toEqual([])
  })

  it('holds one thread apart from another', async () => {
    const store = loadStore()

    await saveThread(store, 'viewer-1', 'conv-1', { unsent: outbox([unsent('a', 1)]) })

    expect(restored(store, 'viewer-1', 'conv-2').unsent).toEqual([])
  })

  it('gives back nothing rather than throwing when the read fails', () => {
    const store = loadStore()
    mockFails.read = true

    expect(restored(store, 'viewer-1', 'conv-1').unsent).toEqual([])
  })

  it('discards a database it could not read, so the next write still lands', async () => {
    const store = loadStore()
    mockFails.read = true
    restored(store, 'viewer-1', 'conv-1').unsent
    mockFails.read = false

    await saveThread(store, 'viewer-1', 'conv-1', { unsent: outbox([unsent('a', 1)]) })

    expect(outboxIds(store, 'viewer-1', 'conv-1')).toEqual(['local-a'])
  })
})

describe('saveThread: the Outbox', () => {
  /**
   * The list is the unit. A message the API confirmed has left the Outbox in
   * memory, and a row left behind for it would restore a message the person
   * watched succeed.
   */
  it('removes a Message that has left the Outbox', async () => {
    const store = loadStore()
    await saveThread(store, 'viewer-1', 'conv-1', { unsent: outbox([unsent('a', 1), unsent('b', 2)]) })

    await saveThread(store, 'viewer-1', 'conv-1', { unsent: outbox([unsent('b', 2)]) })

    expect(outboxIds(store, 'viewer-1', 'conv-1')).toEqual(['local-b'])
  })

  it('empties the Outbox when the last Message in it is confirmed', async () => {
    const store = loadStore()
    await saveThread(store, 'viewer-1', 'conv-1', { unsent: outbox([unsent('a', 1)]) })

    await saveThread(store, 'viewer-1', 'conv-1', { unsent: outbox([]) })

    expect(restored(store, 'viewer-1', 'conv-1').unsent).toEqual([])
  })

  /**
   * A failed send can still have achieved something: what an upload answered
   * with is written back onto the message it is holding, so the row has to move
   * with it or a retry would carry those files up a second time.
   */
  it('replaces a Message the send wrote back over', async () => {
    const store = loadStore()
    await saveThread(store, 'viewer-1', 'conv-1', { unsent: outbox([unsent('a', 1)]) })

    await saveThread(store, 'viewer-1', 'conv-1', { unsent: outbox([unsent('a', 1, { body: 'edited' })]) })

    expect(restored(store, 'viewer-1', 'conv-1').unsent[0].message.body).toBe('edited')
  })

  it('leaves another thread alone', async () => {
    const store = loadStore()
    await saveThread(store, 'viewer-1', 'conv-1', { unsent: outbox([unsent('a', 1)]) })

    await saveThread(store, 'viewer-1', 'conv-2', { unsent: outbox([]) })

    expect(outboxIds(store, 'viewer-1', 'conv-1')).toEqual(['local-a'])
  })

  it('writes nothing at all when a Restored Outbox has not changed', async () => {
    const store = loadStore()
    await saveThread(store, 'viewer-1', 'conv-1', { unsent: outbox([unsent('a', 1)]) })
    const held = restored(store, 'viewer-1', 'conv-1').unsent
    mockStatements.length = 0

    await saveThread(store, 'viewer-1', 'conv-1', { unsent: held })

    expect(outboxStatements()).toBe(0)
  })

  it('writes nothing for a thread whose Outbox is and always was empty', async () => {
    const store = loadStore()
    mockStatements.length = 0

    await saveThread(store, 'viewer-1', 'conv-1', { unsent: outbox([]) })

    expect(outboxStatements()).toBe(0)
  })

  it('says nothing when the write fails', async () => {
    const store = loadStore()
    mockFails.write = true

    await expect(saveThread(store, 'viewer-1', 'conv-1', { unsent: outbox([unsent('a', 1)]) })).resolves.toBeUndefined()
    mockFails.write = false
    expect(restored(store, 'viewer-1', 'conv-1').unsent).toEqual([])
  })

  it('writes again after a write that failed', async () => {
    const store = loadStore()
    mockFails.write = true
    await saveThread(store, 'viewer-1', 'conv-1', { unsent: outbox([unsent('a', 1)]) })
    mockFails.write = false

    await saveThread(store, 'viewer-1', 'conv-1', { unsent: outbox([unsent('a', 1)]) })

    expect(outboxIds(store, 'viewer-1', 'conv-1')).toEqual(['local-a'])
  })

  /**
   * A sweep is about a hole in *history* — memory holding more of it than the
   * disk does. The Outbox has none to put one in, and a message somebody is
   * still waiting to send is the last thing to stop recording.
   */
  it('writes a thread a sweep has taken history from', async () => {
    const store = loadStore()
    // Twenty-one threads holding Messages, so the least recently active loses
    // its history to the sweep that follows the last write.
    const swept = Array.from({ length: 21 }, (_unused, index) =>
      conversation(`conv-${String(index).padStart(3, '0')}`, {
        lastMessageAt: new Date(THREAD_BEGAN + (21 - index) * 60_000).toISOString(),
      }),
    )
    await save(store, 'viewer-1', swept)
    for (const one of swept) await saveThread(store, 'viewer-1', one.id, { messages: thread(1) })
    // One more write, so the sweep it triggers spares the busiest thread rather
    // than the least active one — which is the one about to be tested.
    await saveThread(store, 'viewer-1', 'conv-000', { messages: thread(1, 2) })
    expect(restored(store, 'viewer-1', 'conv-020', 50).messages).toEqual([])

    await saveThread(store, 'viewer-1', 'conv-020', { unsent: outbox([unsent('a', 1)]) })

    expect(outboxIds(store, 'viewer-1', 'conv-020')).toEqual(['local-a'])
  })
})

describe('an Outbox row whose Conversation is gone', () => {
  const list = [conversation('conv-1'), conversation('conv-2')]

  it('is discarded rather than restored into nothing', async () => {
    const store = loadStore()
    await save(store, 'viewer-1', list)
    await saveThread(store, 'viewer-1', 'conv-2', { unsent: outbox([unsent('a', 1)]) })

    await save(store, 'viewer-1', [conversation('conv-1')])

    expect(restored(store, 'viewer-1', 'conv-2').unsent).toEqual([])
  })

  it('leaves the Outbox of a thread still in the list alone', async () => {
    const store = loadStore()
    await save(store, 'viewer-1', list)
    await saveThread(store, 'viewer-1', 'conv-1', { unsent: outbox([unsent('a', 1)]) })

    await save(store, 'viewer-1', [conversation('conv-1')])

    expect(outboxIds(store, 'viewer-1', 'conv-1')).toEqual(['local-a'])
  })

  it('leaves another person on this phone alone', async () => {
    const store = loadStore()
    await saveThread(store, 'viewer-2', 'conv-2', { unsent: outbox([unsent('a', 1)]) })

    await save(store, 'viewer-1', [conversation('conv-1')])

    expect(outboxIds(store, 'viewer-2', 'conv-2')).toEqual(['local-a'])
  })

  /**
   * The belief goes with the rows. Kept, it would answer "already written" for a
   * message this device no longer has, and a conversation that came back would
   * come back without it.
   */
  it('is written again if its Conversation comes back', async () => {
    const store = loadStore()
    await save(store, 'viewer-1', list)
    const carried = [unsent('a', 1)]
    await saveThread(store, 'viewer-1', 'conv-2', { unsent: outbox(carried) })
    await save(store, 'viewer-1', [conversation('conv-1')])

    await save(store, 'viewer-1', list)
    await saveThread(store, 'viewer-1', 'conv-2', { unsent: outbox(carried) })

    expect(outboxIds(store, 'viewer-1', 'conv-2')).toEqual(['local-a'])
  })
})

describe('wipeStore, with an Outbox on the disk', () => {
  it('leaves none of it behind', async () => {
    const store = loadStore()
    await saveThread(store, 'viewer-1', 'conv-1', { unsent: outbox([unsent('a', 1)]) })

    await store.wipeStore()

    expect(restored(store, 'viewer-1', 'conv-1').unsent).toEqual([])
  })

  it('refuses a write queued after it by somebody it just wiped', async () => {
    const store = loadStore()
    await saveThread(store, 'viewer-1', 'conv-1', { unsent: outbox([unsent('a', 1)]) })
    await store.wipeStore()

    await saveThread(store, 'viewer-1', 'conv-1', { unsent: outbox([unsent('b', 2)]) })

    expect(restored(store, 'viewer-1', 'conv-1').unsent).toEqual([])
  })
})
