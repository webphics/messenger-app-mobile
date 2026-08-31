import {
  canAccessUnassignedPool,
  canAssignConversation,
  canBroadcast,
  canDeleteConversation,
  canDeleteMessage,
  canManageUsers,
  canSeeInternalNotes,
  canViewConversation,
} from '@/lib/rbac'
import { CONVERSATIONS } from '@/lib/mock-data'
import type { Conversation, UserRole } from '@/lib/types'

const assigned = CONVERSATIONS.find((c) => c.id === 'conv-assigned') as Conversation
const unassigned = CONVERSATIONS.find((c) => c.id === 'conv-unassigned') as Conversation
const group = CONVERSATIONS.find((c) => c.id === 'conv-group') as Conversation

describe('canViewConversation', () => {
  test('customer sees only threads they participate in', () => {
    expect(canViewConversation('customer', 'customer-1', assigned)).toBe(true)
    expect(canViewConversation('customer', 'customer-1', unassigned)).toBe(false)
    expect(canViewConversation('customer', 'customer-2', unassigned)).toBe(true)
    expect(canViewConversation('customer', 'customer-2', assigned)).toBe(false)
  })

  test('agent sees assignee, participant, or unassigned', () => {
    expect(canViewConversation('agent', 'agent-1', assigned)).toBe(true)
    expect(canViewConversation('agent', 'agent-2', assigned)).toBe(false)
    expect(canViewConversation('agent', 'agent-2', unassigned)).toBe(true)
    expect(canViewConversation('agent', 'agent-1', group)).toBe(true)
  })

  test('admin sees all', () => {
    expect(canViewConversation('admin', 'admin-1', assigned)).toBe(true)
    expect(canViewConversation('admin', 'admin-1', unassigned)).toBe(true)
    expect(canViewConversation('admin', 'admin-1', group)).toBe(true)
  })
})

describe('role matrix', () => {
  test('unassigned pool', () => {
    expect(canAccessUnassignedPool('customer')).toBe(false)
    expect(canAccessUnassignedPool('agent')).toBe(true)
    expect(canAccessUnassignedPool('admin')).toBe(true)
  })

  test('internal notes', () => {
    expect(canSeeInternalNotes('customer')).toBe(false)
    expect(canSeeInternalNotes('agent')).toBe(true)
    expect(canSeeInternalNotes('admin')).toBe(true)
  })

  test('delete message and conversation — admin only', () => {
    expect(canDeleteMessage('customer')).toBe(false)
    expect(canDeleteMessage('agent')).toBe(false)
    expect(canDeleteMessage('admin')).toBe(true)
    expect(canDeleteConversation('customer')).toBe(false)
    expect(canDeleteConversation('agent')).toBe(false)
    expect(canDeleteConversation('admin')).toBe(true)
  })

  test('assign, broadcast, manage users — admin only', () => {
    expect(canAssignConversation('customer')).toBe(false)
    expect(canAssignConversation('agent')).toBe(false)
    expect(canAssignConversation('admin')).toBe(true)
    expect(canBroadcast('customer')).toBe(false)
    expect(canBroadcast('agent')).toBe(false)
    expect(canBroadcast('admin')).toBe(true)
    expect(canManageUsers('customer')).toBe(false)
    expect(canManageUsers('agent')).toBe(false)
    expect(canManageUsers('admin')).toBe(true)
  })

  test('unknown role throws', () => {
    const bad = 'superuser' as UserRole
    expect(() => canBroadcast(bad)).toThrow(/unknown role/i)
    expect(() => canViewConversation(bad, 'x', assigned)).toThrow(/unknown role/i)
  })
})
