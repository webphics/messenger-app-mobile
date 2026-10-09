import type { ThreadActionsView } from '@/lib/conversation-access'
import type { UserRole } from '@/lib/types'

/**
 * The thread actions with Close taken away from an Agent.
 *
 * Closing a conversation is an Admin's act. For now that is a choice about
 * what the screen offers, not a rule the API enforces: an Agent holding the
 * Close Capability is still allowed it there, and Reopen is untouched, so an
 * Agent can still bring a closed conversation back. The web client hides it
 * the same way (`agent-close.utils`).
 */
export function withoutAgentClose(actions: ThreadActionsView, role: UserRole): ThreadActionsView {
  return role === 'agent' ? { ...actions, close: false } : actions
}
