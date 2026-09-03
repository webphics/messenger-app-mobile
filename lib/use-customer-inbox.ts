import { useCallback, useEffect, useRef, useState } from 'react'

import {
  ensureSupportConversation,
  listConversations,
  listMyOrganizations,
  type ApiFailure,
} from '@/lib/conversation-api'
import { mergeConversation, sortConversations } from '@/lib/conversation-state'
import type { Conversation } from '@/lib/types'

/**
 * Everything a Customer's screens read, fetched once.
 *
 * The inbox, the hub's recent-message card and the chat route all need the same
 * two things — the conversations this person is in, and the names of the
 * organizations that title their support threads — so they ask the same hook for
 * them rather than each fetching a slice. A Customer has a handful of
 * conversations, so the list is cheap enough to be the unit; when caching
 * arrives it goes behind this seam and no screen changes.
 *
 * Three requests, in two rounds. The memberships and the conversation list are
 * independent and go together; the support thread is got-or-created against the
 * organization the first answer named, which is what makes a Customer's first
 * visit to Messages find a thread waiting rather than an empty screen.
 */

export type CustomerInbox =
  | { status: 'loading' }
  /** Nothing to show: the list itself could not be fetched. */
  | { status: 'failed'; failure: ApiFailure }
  | {
      status: 'ready'
      conversations: Conversation[]
      organizationNames: ReadonlyMap<string, string>
    }

export type CustomerInboxView = CustomerInbox & {
  /** Pull-to-refresh. Distinct from a first load, which has nothing to show yet. */
  refreshing: boolean
  reload: () => void
}

export function useCustomerInbox(): CustomerInboxView {
  const [inbox, setInbox] = useState<CustomerInbox>({ status: 'loading' })
  const [refreshing, setRefreshing] = useState(false)

  /**
   * Which load is the current one. A refresh started while another was in flight
   * would otherwise let the older answer overwrite the newer, and an answer that
   * lands after the screen is gone would set state on nothing.
   */
  const generation = useRef(0)

  const load = useCallback(async (mode: 'first' | 'refresh') => {
    const mine = ++generation.current
    if (mode === 'refresh') setRefreshing(true)

    const [organizations, list] = await Promise.all([
      listMyOrganizations(),
      listConversations(),
    ])

    if (generation.current !== mine) return

    if (!list.ok) {
      setInbox({ status: 'failed', failure: list.failure })
      setRefreshing(false)
      return
    }

    // A Customer's support thread belongs to an organization, and the mobile app
    // shows one. Any others they hold threads in still arrive in the list above;
    // what this decides is only which one is created on a first visit.
    const primary = organizations.ok ? organizations.value[0] : undefined
    const support = primary ? await ensureSupportConversation(primary.id) : null

    if (generation.current !== mine) return

    setInbox({
      status: 'ready',
      conversations:
        support?.ok === true
          ? mergeConversation(list.value, support.value)
          : sortConversations(list.value),
      organizationNames: new Map(
        (organizations.ok ? organizations.value : []).map((organization) => [
          organization.id,
          organization.name,
        ]),
      ),
    })
    setRefreshing(false)
  }, [])

  useEffect(() => {
    void load('first')
    return () => {
      // Nothing to cancel — `fetch` is already out — but bumping the generation
      // makes whatever comes back land on a load nobody is waiting for.
      generation.current += 1
    }
  }, [load])

  const reload = useCallback(() => {
    void load('refresh')
  }, [load])

  return { ...inbox, refreshing, reload }
}
