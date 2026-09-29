import { assignmentPrecheck } from '@/lib/assignment-precheck'
import type { Conversation, StaffConversation, SupportStatus } from '@/lib/types'

const ME = { id: 'me' }

const OTHER_AGENT = { id: 'agent-2', name: 'Priya Raman' }

function staffRow(overrides: Partial<StaffConversation> = {}): Conversation {
  return {
    id: 'conv-1',
    organizationId: 'org-1',
    type: 'support_dm',
    status: 'unassigned' as SupportStatus,
    title: null,
    description: null,
    avatarUrl: null,
    customer: { id: 'cust-1', name: 'Luis Ferreira' },
    assignedAgent: null,
    otherUser: null,
    members: [],
    labels: [],
    lastMessageAt: '2026-08-13T08:00:00.000Z',
    lastMessagePreview: 'Hello',
    lastMessageMine: false,
    lastMessageReceiptStatus: null,
    lastMessageRead: true,
    unreadCount: 0,
    ...overrides,
  } as StaffConversation
}

describe('assignmentPrecheck, on an Engage', () => {
  test('fires when the thread is still unassigned', () => {
    expect(assignmentPrecheck('engage', staffRow(), ME)).toEqual({ kind: 'fire' })
  })

  test('names whoever reached it first', () => {
    const taken = staffRow({ status: 'engaged', assignedAgent: OTHER_AGENT })
    expect(assignmentPrecheck('engage', taken, ME)).toEqual({
      kind: 'stop',
      message: 'Priya Raman engaged this conversation first.',
    })
  })

  test('stops when it was closed while the row was held', () => {
    expect(assignmentPrecheck('engage', staffRow({ status: 'closed' }), ME)).toEqual({
      kind: 'stop',
      message: 'It was closed while you were reading it.',
    })
  })
})

describe('assignmentPrecheck, on a Takeover', () => {
  test('fires when somebody else still holds the thread', () => {
    const held = staffRow({ status: 'engaged', assignedAgent: OTHER_AGENT })
    expect(assignmentPrecheck('take_over', held, ME)).toEqual({ kind: 'fire' })
  })

  test('stops when the thread was released back to the pool', () => {
    expect(assignmentPrecheck('take_over', staffRow({ status: 'unassigned' }), ME)).toEqual({
      kind: 'stop',
      message: 'This conversation is no longer assigned to anybody.',
    })
  })
})

describe('assignmentPrecheck, on a row whose status and assignee disagree', () => {
  // Nothing the API does today produces one: both paths that put a thread back
  // in the pool null its assignee. The rule is here because the API offers the
  // Engage on any unassigned row, and the two must agree.
  test('an unassigned thread is claimable even when it still names this person', () => {
    const stale = staffRow({ status: 'unassigned', assignedAgent: { id: 'me', name: 'Jonah Reed' } })
    expect(assignmentPrecheck('engage', stale, ME)).toEqual({ kind: 'fire' })
  })
})
