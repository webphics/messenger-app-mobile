import { filterConversations, isResolved, listInboxConversations } from '@/lib/inbox-filter'
import { CONVERSATIONS, LABELS, PEOPLE } from '@/lib/mock-data'

const resolved = CONVERSATIONS.find((c) => c.id === 'conv-group')!
const assigned = CONVERSATIONS.find((c) => c.id === 'conv-assigned')!
const unassigned = CONVERSATIONS.find((c) => c.id === 'conv-unassigned')!
const offers = CONVERSATIONS.find((c) => c.id === 'offers')!

describe('isResolved', () => {
  test('Resolved label name, not id', () => {
    expect(isResolved(resolved, LABELS)).toBe(true)
    expect(isResolved(assigned, LABELS)).toBe(false)
  })
})

describe('listInboxConversations', () => {
  test('contact sees only participating threads including offers', () => {
    const list = listInboxConversations('contact', 'contact-1', CONVERSATIONS)
    expect(list.map((c) => c.id).sort()).toEqual(['conv-assigned', 'conv-group', 'offers'])
  })

  test('agent chats exclude unassigned pool', () => {
    const list = listInboxConversations('agent', 'agent-1', CONVERSATIONS)
    expect(list.map((c) => c.id).sort()).toEqual(['conv-assigned', 'conv-group', 'offers'])
    expect(list.some((c) => c.id === 'conv-unassigned')).toBe(false)
  })

  test('admin sees all', () => {
    expect(listInboxConversations('admin', 'admin-1', CONVERSATIONS)).toHaveLength(
      CONVERSATIONS.length,
    )
  })
})

describe('filterConversations', () => {
  const all = CONVERSATIONS

  test('all chip returns the list', () => {
    expect(filterConversations(all, '', 'all', LABELS, PEOPLE, 'agent-1')).toEqual(all)
  })

  test('open excludes Resolved label', () => {
    const ids = filterConversations(all, '', 'open', LABELS, PEOPLE, 'agent-1').map((c) => c.id)
    expect(ids).toContain(assigned.id)
    expect(ids).not.toContain(resolved.id)
  })

  test('resolved only includes Resolved label', () => {
    const ids = filterConversations(all, '', 'resolved', LABELS, PEOPLE, 'agent-1').map((c) => c.id)
    expect(ids).toEqual([resolved.id])
  })

  test('query matches title or preview', () => {
    const byName = filterConversations(all, 'luis', 'all', LABELS, PEOPLE, 'agent-1')
    expect(byName.map((c) => c.id)).toContain(assigned.id)

    const byPreview = filterConversations(all, 'march invoice', 'all', LABELS, PEOPLE, 'agent-1')
    expect(byPreview.map((c) => c.id)).toEqual([unassigned.id])

    const byOffers = filterConversations(all, 'offers', 'all', LABELS, PEOPLE, 'agent-1')
    expect(byOffers.map((c) => c.id)).toContain(offers.id)
  })
})
