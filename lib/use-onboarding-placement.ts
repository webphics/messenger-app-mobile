import { useCallback, useEffect, useState } from 'react'

import { refusalSentence } from '@/lib/api-result'
import { toggleOrganization } from '@/lib/onboarding-placement'
import { inviteToOrganizations, listOrganizations } from '@/lib/org-api'
import type { ConversationPerson, InviteOutcome, OrganizationSummary } from '@/lib/types'

export type PlacementOrganizations =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; organizations: OrganizationSummary[] }

export type OnboardingPlacement = {
  organizations: PlacementOrganizations
  reloadOrganizations: () => void
  selected: string[]
  toggle: (organizationId: string) => void
  assigning: boolean
  /** What the API said about the last attempt, in the words the section prints. */
  error: string | null
  assign: () => void
}

export type OnboardingPlacementOptions = {
  /** Told what the invite did, as soon as the write lands. */
  onInvited: (outcome: InviteOutcome) => void
}

/**
 * Inviting the Customer of a General Support thread to organizations, from Conversation details.
 *
 * The same flow as the web client's invite dialog. The write is `POST /invitations`, which no
 * longer adds a Customer to anything: each organization becomes an Invitation card in their
 * General Support, which they answer with Join or Decline. So the viewer stays where they are; the
 * selection clears and the cards arrive in the thread underneath. Pass a null customer to do
 * nothing at all, which is how a screen that offers no invitation keeps from listing organizations.
 */
export function useOnboardingPlacement(
  customer: ConversationPerson | null,
  { onInvited }: OnboardingPlacementOptions,
): OnboardingPlacement {
  const [organizations, setOrganizations] = useState<PlacementOrganizations>({ status: 'loading' })
  const [selected, setSelected] = useState<string[]>([])
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const customerId = customer?.id ?? null

  /** Asks once and answers through `settle`, so a screen that has gone does not hear it. */
  const fetchOrganizations = useCallback(
    async (settle: (next: PlacementOrganizations) => void) => {
      const result = await listOrganizations()
      settle(
        result.ok
          ? { status: 'ready', organizations: result.value }
          : {
              status: 'failed',
              message: refusalSentence(result.failure, 'The organizations could not be loaded.') ?? '',
            },
      )
    },
    [],
  )

  useEffect(() => {
    if (!customerId) return
    let live = true
    void fetchOrganizations((next) => {
      if (live) setOrganizations(next)
    })
    return () => {
      live = false
    }
  }, [customerId, fetchOrganizations])

  const reloadOrganizations = useCallback(() => {
    setOrganizations({ status: 'loading' })
    void fetchOrganizations(setOrganizations)
  }, [fetchOrganizations])

  const toggle = useCallback((organizationId: string) => {
    setError(null)
    setSelected((current) => toggleOrganization(current, organizationId))
  }, [])

  const assign = useCallback(async () => {
    if (!customerId || selected.length === 0 || assigning) return
    setAssigning(true)
    setError(null)
    const result = await inviteToOrganizations(customerId, selected)
    setAssigning(false)
    if (!result.ok) {
      setError(refusalSentence(result.failure, 'The invitation could not be sent.'))
      return
    }
    setSelected([])
    onInvited(result.value)
  }, [assigning, customerId, onInvited, selected])

  return {
    organizations,
    reloadOrganizations,
    selected,
    toggle,
    assigning,
    error,
    assign: () => void assign(),
  }
}
