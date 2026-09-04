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

type MockFile = {
  userVersion: number
  rows: MockRow[]
  organizations: MockOrganizationRow[]
  messages: MockMessageRow[]
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

    getAllSync(source: string, ...params: unknown[]) {
      if (mockFails.read) throw new Error('database disk image is malformed')
      mockStatements.push(source)
      if (source.includes('GROUP BY m.conversation_id')) return this.storedThreads(params)
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
      try {
        await task()
      } catch (error) {
        this.file.rows = conversations
        this.file.organizations = organizations
        this.file.messages = messages
        throw error
      }
    }
  }

  return {
    openDatabaseSync(name: string) {
      if (mockFails.open) throw new Error('unable to open database file')
      if (!mockFiles.has(name)) {
        mockFiles.set(name, { userVersion: 0, rows: [], organizations: [], messages: [] })
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

const DATABASE_NAME = 'enki-store.db'

function conversation(id: string, overrides: Partial<Conversation> = {}): Conversation {
  return {
    id,
    organizationId: 'org-1',
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
) {
  mockFiles.set(DATABASE_NAME, { userVersion, rows, organizations, messages })
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

const THREAD_BEGAN = Date.parse('2026-08-13T08:00:00.000Z')

function message(id: string, minute: number, overrides: Partial<CustomerMessage> = {}): Message {
  const at = new Date(THREAD_BEGAN + minute * 60_000).toISOString()
  return {
    id,
    body: id,
    messageType: 'text',
    createdAt: at,
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

function statementsFor(fragment: string): number {
  return mockStatements.filter((source) => source.includes(fragment)).length
}

describe('restoreThread', () => {
  it('has nothing for a thread this device has never held', async () => {
    const store = loadStore()

    expect(store.restoreThread('viewer-1', 'conv-1', 50)).toBeNull()
  })

  it('gives back the Messages that were written', async () => {
    const store = loadStore()
    const written = thread(3)

    await store.saveMessages('viewer-1', 'conv-1', written)

    expect(ids(store.restoreThread('viewer-1', 'conv-1', 50)?.messages ?? [])).toEqual(ids(written))
  })

  /**
   * A page, not a thread. What is below it stays on the disk and is read by
   * `restoreOlderMessages` when somebody scrolls into it — which is what keeps
   * opening a thread that has been read for an hour as cheap as opening one
   * that has not.
   */
  it('reads back the newest page and no more', async () => {
    const store = loadStore()

    await store.saveMessages('viewer-1', 'conv-1', thread(10))

    expect(ids(store.restoreThread('viewer-1', 'conv-1', 3)?.messages ?? [])).toEqual([
      'msg-8',
      'msg-9',
      'msg-10',
    ])
  })

  it('holds one viewer thread apart from another', async () => {
    const store = loadStore()

    await store.saveMessages('viewer-1', 'conv-1', thread(2))

    expect(store.restoreThread('viewer-2', 'conv-1', 50)).toBeNull()
  })

  it('holds one thread apart from another', async () => {
    const store = loadStore()

    await store.saveMessages('viewer-1', 'conv-1', thread(2))

    expect(store.restoreThread('viewer-1', 'conv-2', 50)).toBeNull()
  })

  it('gives back the frontier the thread recorded', async () => {
    const store = loadStore()

    await save(store, 'viewer-1', [conversation('conv-1')])
    await store.saveMessages('viewer-1', 'conv-1', thread(2))
    await store.saveThreadPaging('viewer-1', 'conv-1', { hasMore: false, cursor: 'msg-1' })

    expect(store.restoreThread('viewer-1', 'conv-1', 50)?.paging).toEqual({
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
    await store.saveMessages('viewer-1', 'conv-1', thread(3))

    expect(store.restoreThread('viewer-1', 'conv-1', 50)?.paging).toEqual({
      hasMore: true,
      cursor: 'msg-1',
    })
  })

  it('has nothing when the database cannot be read, and discards it', async () => {
    const store = loadStore()
    await store.saveMessages('viewer-1', 'conv-1', thread(2))
    mockFails.read = true

    expect(store.restoreThread('viewer-1', 'conv-1', 50)).toBeNull()
    expect(mockDeleted).toContain(DATABASE_NAME)
  })
})

describe('restoreOlderMessages', () => {
  it('gives back the page before the Message it is asked about', async () => {
    const store = loadStore()
    const written = thread(10)
    await store.saveMessages('viewer-1', 'conv-1', written)

    const older = store.restoreOlderMessages('viewer-1', 'conv-1', written[7], 3)

    expect(ids(older)).toEqual(['msg-5', 'msg-6', 'msg-7'])
  })

  it('gives back nothing at the bottom of what this device holds', async () => {
    const store = loadStore()
    const written = thread(3)
    await store.saveMessages('viewer-1', 'conv-1', written)

    expect(store.restoreOlderMessages('viewer-1', 'conv-1', written[0], 50)).toEqual([])
  })

  it('gives back nothing for a thread this device has never held', async () => {
    const store = loadStore()

    expect(store.restoreOlderMessages('viewer-1', 'conv-1', message('msg-9', 9), 50)).toEqual([])
  })
})

describe('saveMessages', () => {
  it('adds to a thread rather than replacing it', async () => {
    const store = loadStore()

    await store.saveMessages('viewer-1', 'conv-1', thread(2))
    await store.saveMessages('viewer-1', 'conv-1', thread(2, 3))

    expect(ids(store.restoreThread('viewer-1', 'conv-1', 50)?.messages ?? [])).toEqual([
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

    await store.saveMessages('viewer-1', 'conv-1', [message('msg-1', 1)])
    await store.saveMessages('viewer-1', 'conv-1', [
      message('msg-1', 1, { receiptStatus: 'read' }),
    ])

    const held = store.restoreThread('viewer-1', 'conv-1', 50)?.messages ?? []
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

    await store.saveMessages('viewer-1', 'conv-1', thread(3))
    await store.saveMessages('viewer-1', 'conv-1', thread(2, 90), 'replace')

    expect(ids(store.restoreThread('viewer-1', 'conv-1', 50)?.messages ?? [])).toEqual([
      'msg-90',
      'msg-91',
    ])
  })

  it('leaves another thread alone when it replaces one', async () => {
    const store = loadStore()

    await store.saveMessages('viewer-1', 'conv-2', thread(2))
    await store.saveMessages('viewer-1', 'conv-1', thread(1, 90), 'replace')

    expect(store.restoreThread('viewer-1', 'conv-2', 50)?.messages).toHaveLength(2)
  })

  it('writes only what is not already the row on disk', async () => {
    const store = loadStore()
    const written = thread(3)
    await store.saveMessages('viewer-1', 'conv-1', written)
    mockStatements.length = 0

    await store.saveMessages('viewer-1', 'conv-1', [...written, message('msg-4', 4)])

    expect(statementsFor('INSERT OR REPLACE INTO messages')).toBe(1)
  })

  /**
   * A thread that has just been Restored reaches its first state change holding
   * exactly the rows it read. A transaction that writes them back over
   * themselves is the one cost this whole arrangement exists to avoid.
   */
  it('writes nothing at all when a Restored thread has not changed', async () => {
    const store = loadStore()
    await store.saveMessages('viewer-1', 'conv-1', thread(3))

    const restored = store.restoreThread('viewer-1', 'conv-1', 50)
    mockCounts.transactions = 0
    await store.saveMessages('viewer-1', 'conv-1', restored?.messages ?? [])

    expect(mockCounts.transactions).toBe(0)
  })

  /**
   * A burst costs the transaction already under way plus one for the state that
   * is finally true, rather than one per arriving Message.
   */
  it('coalesces a burst to the thread that is true when it gets there', async () => {
    const store = loadStore()

    void store.saveMessages('viewer-1', 'conv-1', thread(1))
    void store.saveMessages('viewer-1', 'conv-1', thread(2))
    await store.saveMessages('viewer-1', 'conv-1', thread(3))

    expect(mockCounts.transactions).toBe(2)
    expect(store.restoreThread('viewer-1', 'conv-1', 50)?.messages).toHaveLength(3)
  })

  /**
   * A drop that has been decided cannot be undecided by the next state to land
   * on top of it before the queue is drained.
   */
  it('keeps a replace that another state coalesced into', async () => {
    const store = loadStore()

    void store.saveMessages('viewer-1', 'conv-1', thread(3))
    void store.saveMessages('viewer-1', 'conv-1', thread(1, 90), 'replace')
    await store.saveMessages('viewer-1', 'conv-1', thread(2, 90))

    expect(ids(store.restoreThread('viewer-1', 'conv-1', 50)?.messages ?? [])).toEqual([
      'msg-90',
      'msg-91',
    ])
  })

  it('says nothing when the write fails', async () => {
    const store = loadStore()
    mockFails.write = true

    await expect(store.saveMessages('viewer-1', 'conv-1', thread(2))).resolves.toBeUndefined()

    mockFails.write = false
    expect(store.restoreThread('viewer-1', 'conv-1', 50)).toBeNull()
  })

  it('writes again after a write that failed', async () => {
    const store = loadStore()
    mockFails.write = true
    await store.saveMessages('viewer-1', 'conv-1', thread(2))

    mockFails.write = false
    await store.saveMessages('viewer-1', 'conv-1', thread(2))

    expect(store.restoreThread('viewer-1', 'conv-1', 50)?.messages).toHaveLength(2)
  })
})

describe('saveThreadPaging', () => {
  /**
   * The list is replaced whole whenever anything anywhere changes, and a
   * frontier recorded by a thread has to survive that — otherwise every message
   * that arrived in any conversation would send this one back to the top.
   */
  it('survives the list being written over it', async () => {
    const store = loadStore()
    await save(store, 'viewer-1', [conversation('conv-1')])
    await store.saveThreadPaging('viewer-1', 'conv-1', { hasMore: false, cursor: 'msg-1' })

    await save(store, 'viewer-1', [conversation('conv-1'), conversation('conv-2')])

    expect(store.restoreStore('viewer-1').paging.get('conv-1')).toEqual({
      hasMore: false,
      cursor: 'msg-1',
    })
  })

  it('survives a restart, and is written back by the next list write', async () => {
    const first = loadStore()
    await save(first, 'viewer-1', [conversation('conv-1')])
    await first.saveThreadPaging('viewer-1', 'conv-1', { hasMore: false, cursor: 'msg-1' })

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
    await store.saveThreadPaging('viewer-1', 'conv-1', { hasMore: false, cursor: 'msg-1' })
    mockCounts.transactions = 0

    await store.saveThreadPaging('viewer-1', 'conv-1', { hasMore: false, cursor: 'msg-1' })

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
    await store.saveMessages('viewer-1', 'conv-2', thread(3))

    await save(store, 'viewer-1', [conversation('conv-1')])

    expect(store.restoreThread('viewer-1', 'conv-2', 50)).toBeNull()
  })

  it('leaves the threads that are still in it alone', async () => {
    const store = loadStore()
    await save(store, 'viewer-1', [conversation('conv-1'), conversation('conv-2')])
    await store.saveMessages('viewer-1', 'conv-1', thread(3))

    await save(store, 'viewer-1', [conversation('conv-1')])

    expect(store.restoreThread('viewer-1', 'conv-1', 50)?.messages).toHaveLength(3)
  })

  it('leaves the threads of another person alone', async () => {
    const store = loadStore()
    await save(store, 'viewer-2', [conversation('conv-9')])
    await store.saveMessages('viewer-2', 'conv-9', thread(2))

    await save(store, 'viewer-1', [conversation('conv-1')])

    expect(store.restoreThread('viewer-2', 'conv-9', 50)?.messages).toHaveLength(2)
  })
})

describe('wipeStore, with Messages on the disk', () => {
  it('leaves none of them behind', async () => {
    const store = loadStore()
    await store.saveMessages('viewer-1', 'conv-1', thread(3))

    await store.wipeStore()

    expect(store.restoreThread('viewer-1', 'conv-1', 50)).toBeNull()
  })

  it('does not let a write already on its way put them back', async () => {
    const store = loadStore()

    void store.saveMessages('viewer-1', 'conv-1', thread(3))
    await store.wipeStore()

    expect(store.restoreThread('viewer-1', 'conv-1', 50)).toBeNull()
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
    for (const one of conversations) await store.saveMessages('viewer-1', one.id, thread(each))
    return conversations
  }

  it('keeps the Messages of the twenty most recently active threads', async () => {
    const store = loadStore()

    await held(store, 21)

    for (const id of list(21).slice(0, 20).map((one) => one.id)) {
      expect(store.restoreThread('viewer-1', id, 50)?.messages).toHaveLength(1)
    }
  })

  it('drops the Messages of the twenty-first', async () => {
    const store = loadStore()

    await held(store, 21)
    // The last thread written is spared, so one more write is what collects it.
    await store.saveMessages('viewer-1', 'conv-000', thread(2))

    expect(store.restoreThread('viewer-1', 'conv-020', 50)).toBeNull()
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
    await store.saveMessages('viewer-1', 'conv-000', thread(2))

    expect(store.restoreThread('viewer-1', 'conv-020', 50)).toBeNull()
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
    await store.saveThreadPaging('viewer-1', 'conv-020', { hasMore: false, cursor: 'msg-900' })
    await store.saveMessages('viewer-1', 'conv-000', thread(2))

    expect(
      mockFiles.get(DATABASE_NAME)?.rows.find((row) => row.id === 'conv-020'),
    ).toMatchObject({ has_more: 1, cursor: null })
  })

  it('does not let a later write of the list carry the old cursor back', async () => {
    const store = loadStore()
    const conversations = await held(store, 21)
    await store.saveThreadPaging('viewer-1', 'conv-020', { hasMore: false, cursor: 'msg-900' })
    await store.saveMessages('viewer-1', 'conv-000', thread(2))

    await save(store, 'viewer-1', [...conversations])

    expect(
      mockFiles.get(DATABASE_NAME)?.rows.find((row) => row.id === 'conv-020'),
    ).toMatchObject({ has_more: 1, cursor: null })
  })

  it('keeps the fifty newest Messages of a thread paged back further than that', async () => {
    const store = loadStore()
    await save(store, 'viewer-1', [conversation('conv-1'), conversation('conv-2')])

    await store.saveMessages('viewer-1', 'conv-1', thread(60))
    await store.saveMessages('viewer-1', 'conv-2', thread(1))

    const kept = store.restoreThread('viewer-1', 'conv-1', 100)?.messages ?? []
    expect(kept).toHaveLength(50)
    expect(ids(kept)).toContain('msg-60')
    expect(ids(kept)).not.toContain('msg-10')
  })

  it('never chooses the thread the write it followed was for', async () => {
    const store = loadStore()
    await save(store, 'viewer-1', [conversation('conv-1')])

    await store.saveMessages('viewer-1', 'conv-1', thread(60))

    expect(store.restoreThread('viewer-1', 'conv-1', 100)?.messages).toHaveLength(60)
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

    await store.saveMessages('viewer-1', 'conv-000', thread(2))

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
    await store.saveMessages('viewer-2', 'conv-x', thread(3))

    await held(store, 25)

    expect(store.restoreThread('viewer-2', 'conv-x', 50)?.messages).toHaveLength(3)
  })

  it('leaves the Store alone when a sweep cannot be written', async () => {
    const store = loadStore()
    await held(store, 21)
    mockFails.write = true

    await store.saveMessages('viewer-1', 'conv-000', thread(2))
    mockFails.write = false

    expect(store.restoreThread('viewer-1', 'conv-020', 50)?.messages).toHaveLength(1)
  })
})
