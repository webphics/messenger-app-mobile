import type { Conversation, UserRole } from '@/lib/types'

const ROLES: readonly UserRole[] = ['admin', 'agent', 'contact']

function assertRole(role: UserRole): void {
  if (!ROLES.includes(role)) {
    throw new Error(`Unknown role: ${String(role)}`)
  }
}

export function canViewConversation(
  role: UserRole,
  userId: string,
  conversation: Conversation,
): boolean {
  assertRole(role)
  if (role === 'admin') return true
  if (role === 'contact') return conversation.participantIds.includes(userId)
  return (
    conversation.assigneeId === userId ||
    conversation.participantIds.includes(userId) ||
    conversation.assigneeId === null
  )
}

export function canAccessUnassignedPool(role: UserRole): boolean {
  assertRole(role)
  return role === 'agent' || role === 'admin'
}

export function canSeeInternalNotes(role: UserRole): boolean {
  assertRole(role)
  return role === 'agent' || role === 'admin'
}

export function canDeleteMessage(role: UserRole): boolean {
  assertRole(role)
  return role === 'admin'
}

export function canDeleteConversation(role: UserRole): boolean {
  assertRole(role)
  return role === 'admin'
}

export function canAssignConversation(role: UserRole): boolean {
  assertRole(role)
  return role === 'admin'
}

export function canBroadcast(role: UserRole): boolean {
  assertRole(role)
  return role === 'admin'
}

export function canManageUsers(role: UserRole): boolean {
  assertRole(role)
  return role === 'admin'
}
