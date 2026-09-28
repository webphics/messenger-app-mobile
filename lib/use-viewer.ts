import { useAuth } from '@/lib/auth-context'
import type { SessionUser } from '@/lib/types'

/**
 * The signed-in person, or null, read off the auth state rather than
 * `getSessionUser()` so that a guard re-renders when it changes: a Stale
 * session is replaced in place once the API answers, and the answer can move
 * the role or the capabilities a `Protected` guard reads.
 *
 * Null for every status that holds no confirmed person — hydrating, signed
 * out, mid-sign-in, a two-factor challenge, unreachable — which is what shuts
 * every role group until there is somebody to let in.
 */
export function useViewer(): SessionUser | null {
  const { state } = useAuth()
  return state.status === 'signed-in' ? state.user : null
}
