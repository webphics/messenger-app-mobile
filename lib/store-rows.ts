import { parseConversation } from '@/lib/conversation-parse'
import { sortConversations } from '@/lib/conversation-state'
import type { Conversation } from '@/lib/types'

/**
 * The Store as rows, and rows back as a Store.
 *
 * Pure, and deliberately on this side of the native boundary: nothing here
 * imports `expo-sqlite`, so the mapping that decides what survives a restart is
 * a table of cases rather than something only a device can demonstrate. What is
 * on the other side of that boundary — the connection, the schema, the
 * transaction — is `lib/conversation-store.ts`, and it is the only file that
 * knows SQLite exists. See ADR-0008.
 *
 * The row shape uses the column names rather than this codebase's camelCase,
 * because that is what SQLite hands back: a row read out of the database *is*
 * one of these, with no renaming step in between to get wrong.
 */

/**
 * The shape of what is on disk. Bumped whenever a column is added, dropped or
 * reinterpreted; `conversation-store` discards a database at any other version
 * rather than migrating it, so a change here costs one cold start's worth of
 * Stale data and never a migration that can go wrong.
 */
export const STORE_SCHEMA_VERSION = 1

/**
 * How far back a thread has been read, as the Store holds it.
 *
 * The same two fields `ThreadState` carries, and no more: whether asking for
 * another page is still worth a request, and the id the next page reads
 * backwards from. They ride on the conversation row rather than in a table of
 * their own — there is exactly one of these per conversation, so a second table
 * would be a join to learn what a column already says.
 */
export type ThreadPaging = { hasMore: boolean; cursor: string | undefined }

/** One row of the `conversations` table. */
export type ConversationRow = {
  id: string
  owner_id: string
  /** The Conversation as the API sent it, serialised. Read back through `parseConversation`. */
  payload: string
  /** SQLite has no boolean; 1 unless a page has said otherwise. */
  has_more: number
  cursor: string | null
}

/** One row of the `organizations` table. */
export type OrganizationRow = { id: string; owner_id: string; name: string }

/** Everything the Conversation list needs, as one Restore answers it. */
export type RestoredStore = {
  conversations: Conversation[]
  paging: ReadonlyMap<string, ThreadPaging>
  /**
   * What titles a Customer's Support DM. A conversation carries an organization
   * id and no name, so a list Restored without these would draw every Support
   * thread as `Support` until a second endpoint answered — the same rows, but
   * not the same rows a person left.
   */
  organizationNames: ReadonlyMap<string, string>
}

const NO_PAGING: ReadonlyMap<string, ThreadPaging> = new Map()
const NO_NAMES: ReadonlyMap<string, string> = new Map()

/** Nothing on disk, or nothing readable. The two are the same to a caller. */
export const NOTHING_RESTORED: RestoredStore = {
  conversations: [],
  paging: NO_PAGING,
  organizationNames: NO_NAMES,
}

/**
 * A Store's Conversations as rows, one per conversation.
 *
 * Owned by a person, because a phone is shared: rows are written under the
 * viewer they belong to and read back under the same one, so the next person to
 * sign in on this device Restores nothing rather than somebody else's support
 * history.
 *
 * A conversation nobody has paged through yet is written with the defaults
 * `emptyThread` would give it — more history to ask for, and nowhere in
 * particular to ask from — so a row that has never held a thread and a thread
 * that has never been scrolled read back the same, which is what they mean.
 */
export function toConversationRows(
  ownerId: string,
  conversations: readonly Conversation[],
  paging: ReadonlyMap<string, ThreadPaging> = NO_PAGING,
): ConversationRow[] {
  return conversations.map((conversation) => {
    const thread = paging.get(conversation.id)
    return {
      id: conversation.id,
      owner_id: ownerId,
      payload: JSON.stringify(conversation),
      has_more: thread?.hasMore === false ? 0 : 1,
      cursor: thread?.cursor ?? null,
    }
  })
}

/**
 * Rows back into a Store's Conversations, in the order the list shows them.
 *
 * Takes `unknown` because that is what a database holds: these rows were written
 * by some build of this app, and the one reading them is not necessarily the one
 * that wrote them. A row that cannot be read is dropped rather than thrown over
 * — the same rule `parseConversations` follows for a page from the API, and for
 * the same reason. One unreadable row is not grounds for showing a person an
 * empty inbox.
 *
 * Sorted through `sortConversations` rather than by a column, so a Restored list
 * and a fetched one are ordered by the same function and cannot drift apart.
 */
export function fromConversationRows(rows: readonly unknown[]): {
  conversations: Conversation[]
  paging: ReadonlyMap<string, ThreadPaging>
} {
  const conversations: Conversation[] = []
  const paging = new Map<string, ThreadPaging>()

  for (const row of rows) {
    const conversation = readPayload(row)
    if (!conversation) continue

    conversations.push(conversation)
    paging.set(conversation.id, readPaging(row))
  }

  return { conversations: sortConversations(conversations), paging }
}

function readPayload(row: unknown): Conversation | null {
  const payload = (row as Partial<ConversationRow> | null)?.payload
  if (typeof payload !== 'string') return null

  try {
    return parseConversation(JSON.parse(payload))
  } catch {
    // Not JSON at all: a truncated write, or a row from a schema this build has
    // no idea about. Either way there is nothing here to draw.
    return null
  }
}

/**
 * The paging half of a row.
 *
 * Anything the row does not say reads as the default rather than as a reason to
 * drop the conversation: a thread whose cursor is unreadable is a thread that
 * pages from the top, which costs a request and never a missing row.
 */
function readPaging(row: unknown): ThreadPaging {
  const record = row as Partial<ConversationRow> | null
  return {
    hasMore: record?.has_more !== 0,
    cursor: typeof record?.cursor === 'string' ? record.cursor : undefined,
  }
}

/**
 * The organizations a person belongs to, as rows.
 *
 * Owned the same way the conversations are, and for the same reason: an
 * organization name is something this person was told, and the next person to
 * sign in on this phone was not told it.
 */
export function toOrganizationRows(
  ownerId: string,
  names: ReadonlyMap<string, string>,
): OrganizationRow[] {
  return [...names].map(([id, name]) => ({ id, owner_id: ownerId, name }))
}

/**
 * Rows back into the names a title is looked up in.
 *
 * A row missing either half is dropped rather than defaulted: a name is what
 * this is for, and an organization with an empty one would title a thread with
 * nothing at all where `conversationTitle` would otherwise fall back to
 * `Support`.
 */
export function fromOrganizationRows(rows: readonly unknown[]): ReadonlyMap<string, string> {
  const names = new Map<string, string>()

  for (const row of rows) {
    const record = row as Partial<OrganizationRow> | null
    if (typeof record?.id !== 'string' || typeof record.name !== 'string') continue
    if (record.id === '' || record.name === '') continue
    names.set(record.id, record.name)
  }

  return names
}
