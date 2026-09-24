import { useAuth } from '@/lib/auth-context'
import { isSupportAssignmentEnabled } from '@/lib/support-assignment'

/**
 * `isSupportAssignmentEnabled` for the signed-in person, read off the auth
 * state rather than `getSessionUser()` so that a screen re-renders when it
 * changes: a Stale session is replaced in place once the API answers, and the
 * answer can move the switch.
 */
export function useSupportAssignment(): boolean {
  const { state } = useAuth()
  return isSupportAssignmentEnabled(state.status === 'signed-in' ? state.user : null)
}
