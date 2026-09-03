import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { useAuth } from '@/lib/auth-context'
import {
  ensureSupportConversation,
  listConversations,
  listMyOrganizations,
  markConversationRead,
  type ApiFailure,
} from '@/lib/conversation-api'
import {
  mergeConversation,
  sortConversations,
  withConversationRead,
} from '@/lib/conversation-state'
import type { Conversation } from '@/lib/types'

/**
 * Everything a Customer's screens read, fetched once and held in one place.
 *
 * The inbox, the hub's recent-message card, the tab badge and the chat route all
 * need the same two things — the conversations this person is in, and the names
 * of the organizations that title their support threads — so they read one copy
 * rather than each fetching a slice. A Customer has a handful of conversations,
 * so the list is cheap enough to be the unit; when caching arrives it goes behind
 * this seam and no screen changes.
 *
 * Shared rather than per-screen because unread is not a per-screen fact: opening
 * a thread clears its badge on the list behind it and on the tab bar above it,
 * and three copies of the list would clear one of the three.
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
  /**
   * Say this conversation has been read, on screen and then to the API.
   *
   * The badge clears before the request goes out, because the person has read
   * the thread whatever the server makes of it; a request that fails loses only
   * the server's record, and the next list fetch restores the badge if the
   * server still disagrees.
   */
  markRead: (id: string) => void
}

const NOBODY: ReadonlyMap<string, string> = new Map()

/** Nobody to fetch for: an empty inbox rather than a pending one, so a screen reading this while signed out is not left on a spinner. */
const IDLE: CustomerInbox = { status: 'ready', conversations: [], organizationNames: NOBODY }

/**
 * A freshly fetched list, with every read this client made while it was out.
 *
 * Drains the set as it goes: what it holds belongs to the load that has just
 * answered, and nothing after it.
 */
function drain(ids: Set<string>, conversations: Conversation[]): Conversation[] {
  if (ids.size === 0) return conversations

  let next = conversations
  for (const id of ids) next = withConversationRead(next, id)
  ids.clear()
  return next
}

const CustomerInboxContext = createContext<CustomerInboxView | null>(null)

export function CustomerInboxProvider({ children }: { children: ReactNode }) {
  const value = useCustomerInboxState()
  return (
    <CustomerInboxContext.Provider value={value}>{children}</CustomerInboxContext.Provider>
  )
}

export function useCustomerInbox(): CustomerInboxView {
  const value = useContext(CustomerInboxContext)
  if (!value) {
    throw new Error('useCustomerInbox must be used inside a CustomerInboxProvider')
  }
  return value
}

function useCustomerInboxState(): CustomerInboxView {
  const { state } = useAuth()
  /**
   * Who this inbox belongs to, or nobody. Keyed on the id rather than on the
   * role alone so signing out and back in as a different Customer refetches
   * instead of showing the first one's threads.
   */
  const customerId =
    state.status === 'signed-in' && state.user.role === 'customer' ? state.user.id : null

  const [inbox, setInbox] = useState<CustomerInbox>(IDLE)
  const [refreshing, setRefreshing] = useState(false)

  /**
   * Whose inbox the state above currently describes.
   *
   * Reset during render rather than in the effect below, because an effect runs
   * after its children have already rendered: a Customer who has just signed in
   * would get one frame of the empty `IDLE` list, which their Messages screen
   * renders as "no conversations found". This is React's own way of adjusting
   * state to a changed input — it re-renders before anything is committed.
   */
  const [describes, setDescribes] = useState<string | null>(null)
  if (describes !== customerId) {
    setDescribes(customerId)
    setInbox(customerId ? { status: 'loading' } : IDLE)
    setRefreshing(false)
  }

  /**
   * Which load is the current one. A refresh started while another was in flight
   * would otherwise let the older answer overwrite the newer, and an answer that
   * lands after the screen is gone would set state on nothing.
   */
  const generation = useRef(0)

  /** Whether a load is out. Only a read taken while one is decides anything below. */
  const loadOut = useRef(false)
  /**
   * Conversations read while a load was in flight.
   *
   * The list the API is building can predate the read this client has just sent
   * for it, so a refresh landing a moment after a thread was opened would put
   * the badge back. These are re-applied to whatever that load answers with, and
   * drained the moment it settles — an id kept past its load would go on to
   * swallow the next real message in that conversation.
   */
  const readWhileLoading = useRef(new Set<string>())

  const load = useCallback(async (mode: 'first' | 'refresh') => {
    const mine = ++generation.current
    loadOut.current = true
    if (mode === 'refresh') setRefreshing(true)

    const [organizations, list] = await Promise.all([
      listMyOrganizations(),
      listConversations(),
    ])

    if (generation.current !== mine) return

    if (!list.ok) {
      loadOut.current = false
      readWhileLoading.current.clear()
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
    loadOut.current = false

    const merged =
      support?.ok === true
        ? mergeConversation(list.value, support.value)
        : sortConversations(list.value)

    setInbox({
      status: 'ready',
      conversations: drain(readWhileLoading.current, merged),
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
    // Nothing to cancel on the way out — `fetch` is already out — but bumping
    // the generation makes whatever comes back land on a load nobody is waiting
    // for, which is also what a sign-out needs.
    generation.current += 1
    loadOut.current = false
    readWhileLoading.current.clear()

    if (!customerId) return
    void load('first')

    return () => {
      generation.current += 1
    }
  }, [customerId, load])

  const reload = useCallback(() => {
    void load('refresh')
  }, [load])

  const markRead = useCallback((id: string) => {
    if (loadOut.current) readWhileLoading.current.add(id)

    setInbox((current) => {
      if (current.status !== 'ready') return current
      const conversations = withConversationRead(current.conversations, id)
      // Same array when the row was already read, and the same state object with
      // it: opening a thread nobody had unread must not re-render the list.
      return conversations === current.conversations
        ? current
        : { ...current, conversations }
    })

    // Sent whether or not the row on screen looked unread. The list this client
    // holds can be older than the thread being opened, and the API is the one
    // that knows which messages the receipt is missing from.
    void markConversationRead(id)
  }, [])

  return useMemo(
    () => ({ ...inbox, refreshing, reload, markRead }),
    [inbox, refreshing, reload, markRead],
  )
}
