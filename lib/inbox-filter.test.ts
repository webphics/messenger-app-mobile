import {
  activeInboxChip,
  filterConversations,
  isResolved,
  listAssignedConversations,
  listUnassignedConversations,
} from '@/lib/inbox-filter'
import { mergeConversation, withReassignment } from '@/lib/conversation-list'
import { CONVERSATIONS } from '@/lib/mock-data'
import { isStaffConversation } from '@/lib/types'

const assigned = CONVERSATIONS.find((c) => c.id === 'conv-assigned')!
const unassigned = CONVERSATIONS.find((c) => c.id === 'conv-unassigned')!
const closed = { ...assigned, id: 'conv-closed', status: 'closed' as const }

test('a closed support thread is resolved', () => {
  expect(isResolved(closed)).toBe(true)
})

describe('an assignment that happened elsewhere', () => {
  const holder = isStaffConversation(assigned) ? assigned.assignedAgent : null

  test('a thread another Agent just engaged leaves the pool', () => {
    const engagedElsewhere = {
      ...unassigned,
      status: 'engaged' as const,
      assignedAgent: { id: 'agent-2', name: 'Priya Raman' },
    }

    expect(listUnassignedConversations(CONVERSATIONS).map((c) => c.id)).toContain(unassigned.id)
    expect(
      listUnassignedConversations(mergeConversation(CONVERSATIONS, engagedElsewhere)).map(
        (c) => c.id,
      ),
    ).not.toContain(unassigned.id)
  })

  test('a thread taken over leaves the assignee’s own list', () => {
    const taken = withReassignment(CONVERSATIONS, {
      conversationId: assigned.id,
      reason: 'taken_over',
      assignee: { id: 'admin-1', name: 'Admin' },
    })

    expect(listAssignedConversations(holder!.id, taken).map((c) => c.id)).not.toContain(
      assigned.id,
    )
  })

  test('a thread whose assignee left the organization goes back to the pool', () => {
    const returned = withReassignment(CONVERSATIONS, {
      conversationId: assigned.id,
      reason: 'taken_over',
      assignee: null,
    })

    expect(listUnassignedConversations(returned).map((c) => c.id)).toContain(assigned.id)
  })
})

describe('filterConversations', () => {
  test('open excludes a closed thread, resolved keeps only it', () => {
    const list = [...CONVERSATIONS, closed]
    expect(filterConversations(list, { query: '', chip: 'open' }).map((c) => c.id)).not.toContain(
      closed.id,
    )
    expect(filterConversations(list, { query: '', chip: 'resolved' }).map((c) => c.id)).toEqual([
      closed.id,
    ])
  })

  test('mine keeps only the viewer’s threads, and nothing with nobody looking', () => {
    expect(
      filterConversations(CONVERSATIONS, { query: '', chip: 'mine', viewerId: 'agent-1' }).map(
        (c) => c.id,
      ),
    ).toEqual([assigned.id])
    expect(filterConversations(CONVERSATIONS, { query: '', chip: 'mine' })).toEqual([])
  })

  test('a Mine that fell back filters the whole list, not the viewer’s share of it', () => {
    const chip = activeInboxChip('mine', false)
    expect(
      filterConversations(CONVERSATIONS, { query: '', chip, viewerId: 'agent-1' }),
    ).toHaveLength(CONVERSATIONS.length)
  })

  test('a custom inbox keeps only the organizations it names, within the other filters', () => {
    const elsewhere = { ...assigned, id: 'conv-elsewhere', organizationId: 'org-elsewhere' }
    const ids = filterConversations([assigned, elsewhere, closed], {
      query: '',
      chip: 'open',
      organizationIds: new Set(['org-mock']),
    }).map((c) => c.id)
    expect(ids).toEqual(['conv-assigned'])
  })
})
