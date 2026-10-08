import { useCallback, useEffect, useState } from 'react'

import { refusalSentence, type ApiFailure } from '@/lib/api-result'
import { startCustomerConversation } from '@/lib/conversation-api'
import { toggleOrganization } from '@/lib/onboarding-placement'
import { inviteToOrganizations, listOrganizations } from '@/lib/org-api'
import type { Conversation, ConversationPerson, Organization, OrganizationSummary } from '@/lib/types'

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
  /**
   * The organizations the Customer was just placed in, while the viewer is asked which one's
   * support conversation to open. Null the rest of the time.
   */
  choices: Organization[] | null
  /** Opens the Customer's support conversation in this organization. */
  choose: (organizationId: string) => void
  /** Declines to open one, and leaves the thread. */
  skipChoice: () => void
  /** A support conversation is being found or created. */
  opening: boolean
}

export type OnboardingPlacementOptions = {
  /** Whether the viewer holds `message_customers`, without which there is no chat to open. */
  canOpenChat: boolean
  /** Told which organizations the Customer now belongs to, as soon as the write lands. */
  onPlaced: (placed: Organization[]) => void
  /** The Customer's support conversation, found or created. The caller goes to it. */
  onOpened: (conversation: Conversation) => void
  /** Nothing to open, or the viewer declined to. The caller leaves the thread. */
  onLeave: () => void
}

/**
 * What each refusal of `POST /conversations/support/with-customer` means to the person asking,
 * in the web client's words (`use-start-customer-chat`).
 */
function openRefusal(failure: ApiFailure): string | null {
  if (failure.kind === 'unauthorised') return null
  if (failure.kind === 'refused' && failure.code === 'missing_capability') {
    return 'You no longer have permission to message customers.'
  }
  if (failure.kind === 'refused' && failure.code === 'no_shared_organization') {
    return 'You share no organization with this customer.'
  }
  if (failure.kind === 'refused' && failure.code === 'organization_not_shared') {
    return 'You and this customer no longer share that organization.'
  }
  return 'Could not start a chat with this customer.'
}

/**
 * Placing the Customer of an Onboarding thread in organizations, from Conversation details.
 *
 * The same flow as the web client's Assign organizations dialog. The write is
 * `POST /invitations`, which joins a Customer outright, so success is the membership itself
 * and the Onboarding thread stops being live. A viewer who can message customers is then taken
 * to the Customer's support conversation in the organization they were placed in, asked which
 * one first when there were several; anyone else, or a viewer who declines to choose, leaves
 * the thread. Pass a null customer to do nothing at all, which is how a screen that offers no
 * placement keeps from listing organizations.
 */
export function useOnboardingPlacement(
  customer: ConversationPerson | null,
  { canOpenChat, onPlaced, onOpened, onLeave }: OnboardingPlacementOptions,
): OnboardingPlacement {
  const [organizations, setOrganizations] = useState<PlacementOrganizations>({ status: 'loading' })
  const [selected, setSelected] = useState<string[]>([])
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [choices, setChoices] = useState<Organization[] | null>(null)
  const [opening, setOpening] = useState(false)
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

  /**
   * The Customer's support conversation, in `organizationId` or in the one organization the
   * API finds the two share. A refusal stays on this screen with its reason, as the web
   * client's toast does; `organization_selection_required` asks again from the organizations
   * they were just placed in.
   */
  const openChat = useCallback(
    async (placed: Organization[], organizationId?: string) => {
      if (!customerId) return
      setOpening(true)
      setError(null)
      const result = await startCustomerConversation(customerId, organizationId)
      setOpening(false)
      if (result.ok) {
        onOpened(result.value)
        return
      }
      if (result.failure.kind === 'refused' && result.failure.code === 'organization_selection_required') {
        setChoices(placed)
        return
      }
      setError(openRefusal(result.failure))
    },
    [customerId, onOpened],
  )

  const assign = useCallback(async () => {
    if (!customerId || selected.length === 0 || assigning) return
    setAssigning(true)
    setError(null)
    const result = await inviteToOrganizations(customerId, selected)
    setAssigning(false)
    if (!result.ok) {
      setError(refusalSentence(result.failure, 'They could not be added.'))
      return
    }
    // Nothing on this card is reset on the way out. Every success leaves the screen, and a
    // re-render of the card in the same tick as the pop that takes it away crashed Fabric
    // ("child already has a parent") on the emulator.
    const placed = [...result.value.joined, ...result.value.alreadyMembers]
    onPlaced(placed)

    if (placed.length === 0 || !canOpenChat) {
      onLeave()
      return
    }
    const [only] = placed
    if (placed.length === 1 && only) {
      // Named rather than left to the API to bind: a Customer who already shared another
      // organization with the viewer would otherwise be asked about, with one choice offered.
      void openChat(placed, only.id)
      return
    }
    setChoices(placed)
  }, [assigning, canOpenChat, customerId, onLeave, onPlaced, openChat, selected])

  const choose = useCallback(
    (organizationId: string) => {
      const placed = choices ?? []
      setChoices(null)
      void openChat(placed, organizationId)
    },
    [choices, openChat],
  )

  // Leaves without clearing `choices`, for the reason `assign` gives.
  const skipChoice = useCallback(() => onLeave(), [onLeave])

  return {
    organizations,
    reloadOrganizations,
    selected,
    toggle,
    assigning,
    error,
    assign: () => void assign(),
    choices,
    choose,
    skipChoice,
    opening,
  }
}
