import { useCallback, useEffect, useRef, useState } from 'react'

import { acceptInvitation, declineInvitation, listMyInvitations } from '@/lib/org-api'
import type { Invitation } from '@/lib/types'

/**
 * The invitations addressed to the signed-in person.
 *
 * Every role has them: an organization is the container everything in this
 * product belongs to, and being invited into one is how anybody gets access
 * to any of it. So this is read from Settings rather than from an Admin
 * surface, and it draws nothing at all when there is nothing to answer —
 * which is the common case, and the reason a card that appears is a card
 * worth looking at.
 *
 * An answered invitation is dropped from the list rather than refetched. Both
 * routes answer with the organization they were about and nothing else, so
 * there is nothing to fold in: what changed is that this invitation is gone.
 *
 * Accepting changes what the person can see, and the conversation list is
 * fetched separately and will not know. `onAccepted` is how the caller asks
 * for a resync, rather than this module reaching into the inbox.
 */

export type InvitationsView = {
  invitations: Invitation[]
  /** True only until the first answer. There is no error state: see below. */
  loading: boolean
  /** Which invitation has a request out. */
  busyId: string | null
  error: string | null
  accept: (invitation: Invitation) => void
  decline: (invitation: Invitation) => void
  reload: () => void
}

export function useInvitations(onAccepted?: () => void): InvitationsView {
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  const accepted = useRef(onAccepted)
  useEffect(() => {
    accepted.current = onAccepted
  }, [onAccepted])

  const load = useCallback(() => {
    void listMyInvitations().then((result) => {
      if (!live.current) return
      setLoading(false)
      /*
       * A fetch that failed leaves the list empty and says nothing. Every
       * other list in this app announces its failure, and this one must not:
       * it renders only when it has something, so a failure would put an
       * error card on a Settings screen most people have no invitations on
       * at all. Nothing is lost by staying quiet — the invitation is still
       * there on the next visit, and the Admin who sent it can see it is
       * still pending.
       */
      if (result.ok) setInvitations(result.value)
    })
  }, [])

  useEffect(() => load(), [load])

  const answer = useCallback(
    (invitation: Invitation, kind: 'accept' | 'decline') => {
      if (busyId) return
      setBusyId(invitation.id)
      setError(null)

      const request =
        kind === 'accept' ? acceptInvitation(invitation.id) : declineInvitation(invitation.id)

      void request.then((result) => {
        if (!live.current) return
        setBusyId(null)

        if (!result.ok) {
          setError(
            result.failure.kind === 'refused'
              ? result.failure.message
              : result.failure.kind === 'unreachable'
                ? 'No connection. Try again.'
                : 'That could not be answered right now.',
          )
          return
        }

        setInvitations((held) => held.filter((row) => row.id !== invitation.id))
        if (kind === 'accept') accepted.current?.()
      })
    },
    [busyId],
  )

  const accept = useCallback(
    (invitation: Invitation) => answer(invitation, 'accept'),
    [answer],
  )
  const decline = useCallback(
    (invitation: Invitation) => answer(invitation, 'decline'),
    [answer],
  )

  return { invitations, loading, busyId, error, accept, decline, reload: load }
}
