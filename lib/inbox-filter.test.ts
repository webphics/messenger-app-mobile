import {
  filterConversations,
  isResolved,
  latestInboxThread,
  listAssignedConversations,
  listInboxConversations,
  listUnassignedConversations,
} from '@/lib/inbox-filter'
import { CONVERSATIONS } from '@/lib/mock-data'

const assigned = CONVERSATIONS.find((c) => c.id === 'conv-assigned')!
const unassigned = CONVERSATIONS.find((c) => c.id === 'conv-unassigned')!
const group = CONVERSATIONS.find((c) => c.id === 'conv-group')!
const offers = CONVERSATIONS.find((c) => c.id === 'offers')!
const closed = { ...assigned, id: 'conv-closed', status: 'closed' as const }

describe('isResolved', () => {
  test('a closed support thread is resolved', () => {
    expect(isResolved(closed)).toBe(true)
  })

  test('an engaged one is not', () => {
    expect(isResolved(assigned)).toBe(false)
  })

  test('a group has no status to be resolved by', () => {
    expect(isResolved(group)).toBe(false)
  })
})

describe('listInboxConversations', () => {
  test('an Agent sees the whole support pool of their organizations, plus their groups', () => {
    const list = listInboxConversations('agent', 'agent-1', CONVERSATIONS)
    expect(list.map((c) => c.id).sort()).toEqual([
      'conv-assigned',
      'conv-group',
      'conv-unassigned',
      'offers',
    ])
  })

  test('an Agent does not see a group they are not in', () => {
    const list = listInboxConversations('agent', 'agent-9', CONVERSATIONS)
    expect(list.map((c) => c.id)).not.toContain('conv-group')
  })

  test('an Admin sees all', () => {
    expect(listInboxConversations('admin', 'admin-1', CONVERSATIONS)).toHaveLength(
      CONVERSATIONS.length,
    )
  })
})

describe('latestInboxThread', () => {
  test('skips Offers and returns the newest thread in the list', () => {
    expect(latestInboxThread(CONVERSATIONS)?.id).toBe('conv-unassigned')
  })

  test('is nothing when the list is empty', () => {
    expect(latestInboxThread([])).toBeUndefined()
  })

  test('is nothing when Offers is the only thing in it', () => {
    expect(latestInboxThread([offers])).toBeUndefined()
  })
})

describe('listAssignedConversations', () => {
  test('the support threads this agent holds', () => {
    expect(listAssignedConversations('agent-1', CONVERSATIONS).map((c) => c.id)).toEqual([
      assigned.id,
    ])
  })

  test('counts nothing for an agent nothing is assigned to', () => {
    expect(listAssignedConversations('agent-9', CONVERSATIONS)).toEqual([])
  })

  test('a group is never assigned to anyone', () => {
    expect(listAssignedConversations('agent-1', [group])).toEqual([])
  })
})

describe('listUnassignedConversations', () => {
  test('only support threads nobody has engaged', () => {
    expect(listUnassignedConversations(CONVERSATIONS).map((c) => c.id)).toEqual([
      unassigned.id,
    ])
  })
})

describe('filterConversations', () => {
  const all = CONVERSATIONS

  test('the all chip returns everything, with Offers pinned first', () => {
    const ids = filterConversations(all, { query: '', chip: 'all' }).map((c) => c.id)
    expect(ids[0]).toBe('offers')
    expect([...ids].sort()).toEqual(all.map((c) => c.id).sort())
  })

  test('open excludes a closed thread', () => {
    const ids = filterConversations([...all, closed], { query: '', chip: 'open' }).map((c) => c.id)
    expect(ids).toContain(assigned.id)
    expect(ids).not.toContain(closed.id)
  })

  test('resolved includes only closed threads', () => {
    expect(filterConversations([...all, closed], { query: '', chip: 'resolved' }).map((c) => c.id)).toEqual([
      closed.id,
    ])
  })

  test('a query matches the title or the preview', () => {
    expect(filterConversations(all, { query: 'luis', chip: 'all' }).map((c) => c.id)).toContain(assigned.id)
    expect(filterConversations(all, { query: 'march invoice', chip: 'all' }).map((c) => c.id)).toEqual([
      unassigned.id,
    ])
    expect(filterConversations(all, { query: 'offers', chip: 'all' }).map((c) => c.id)).toEqual([offers.id])
  })

  test('a Customer support row is searchable by the organization that titles it', () => {
    const customerRow = {
      id: 'conv-customer',
      organizationId: 'org-1',
      type: 'support_dm' as const,
      lastMessageAt: '2026-08-13T08:00:00.000Z',
      lastMessagePreview: 'Hello',
      lastMessageMine: false,
      lastMessageReceiptStatus: null,
      lastMessageRead: true,
      unreadCount: 0,
    }
    const names = new Map([['org-1', 'Talo']])
    expect(filterConversations([customerRow], { query: 'talo', chip: 'all', organizationNames: names })).toHaveLength(1)
    expect(filterConversations([customerRow], { query: 'other', chip: 'all', organizationNames: names })).toHaveLength(0)
  })

  test('mine keeps only the threads assigned to the viewer', () => {
    expect(
      filterConversations(all, { query: '', chip: 'mine', viewerId: 'agent-1' }).map((c) => c.id),
    ).toEqual([assigned.id])
  })

  test('mine with nobody looking keeps nothing, rather than everything', () => {
    expect(filterConversations(all, { query: '', chip: 'mine' })).toEqual([])
  })

  test('Offers stays out when the chip excludes it', () => {
    expect(filterConversations(all, { query: '', chip: 'resolved' }).map((c) => c.id)).not.toContain(offers.id)
  })
})
