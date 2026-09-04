import { STORE_SCHEMA_VERSION } from '@/lib/store-rows'
import type { Conversation } from '@/lib/types'

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
}

type MockOrganizationRow = { id: string; owner_id: string; name: string }

type MockFile = {
  userVersion: number
  rows: MockRow[]
  organizations: MockOrganizationRow[]
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
      const stamped = /PRAGMA user_version = (\d+)/.exec(source)
      if (stamped) this.file.userVersion = Number(stamped[1])
    }

    getFirstSync(source: string) {
      if (source.trim() === 'PRAGMA user_version') {
        return { user_version: this.file.userVersion }
      }
      return null
    }

    getAllSync(source: string, ...params: unknown[]) {
      if (mockFails.read) throw new Error('database disk image is malformed')
      mockStatements.push(source)
      const table = source.includes('FROM organizations') ? this.file.organizations : this.file.rows
      return table.filter((row) => row.owner_id === params[0])
    }

    async runAsync(source: string, ...params: unknown[]) {
      if (mockFails.write) throw new Error('database is locked')
      mockStatements.push(source)

      if (source.startsWith('DELETE FROM conversations WHERE owner_id')) {
        this.file.rows = this.file.rows.filter((row) => row.owner_id !== params[0])
      }
      if (source.startsWith('INSERT INTO conversations')) {
        const [id, owner_id, payload, has_more, cursor] = params as [
          string,
          string,
          string,
          number,
          string | null,
        ]
        this.file.rows.push({ id, owner_id, payload, has_more, cursor })
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
      return { lastInsertRowId: 0, changes: 1 }
    }

    // Rolled back on a throw, the way a real transaction is: a half-written list
    // is the one outcome a replace-everything write must never leave behind.
    async withTransactionAsync(task: () => Promise<void>) {
      mockCounts.transactions += 1
      const conversations = [...this.file.rows]
      const organizations = [...this.file.organizations]
      try {
        await task()
      } catch (error) {
        this.file.rows = conversations
        this.file.organizations = organizations
        throw error
      }
    }
  }

  return {
    openDatabaseSync(name: string) {
      if (mockFails.open) throw new Error('unable to open database file')
      if (!mockFiles.has(name)) {
        mockFiles.set(name, { userVersion: 0, rows: [], organizations: [] })
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
) {
  mockFiles.set(DATABASE_NAME, { userVersion, rows, organizations })
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
