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
  type ApiResult,
} from '@/lib/conversation-api'
import { restoreStore, saveStore } from '@/lib/conversation-store'
import {
  mergeConversation,
  sortConversations,
  withConversationRead,
  withIncomingMessage,
  withoutConversation,
  withReassignment,
} from '@/lib/conversation-list'
import { useRealtimeEvents, type RealtimeEvent } from '@/lib/realtime-context'
import { createCountedMessages } from '@/lib/realtime-events'
import { createLaunchDeadline, type LaunchDeadline } from '@/lib/launch-deadline'
import { dismissConversationNotifications } from '@/lib/push-device'
import type { Conversation, ConversationFetch, Organization, UserRole } from '@/lib/types'

/**
 * Everything a signed-in person's screens read, fetched once and held in one place.
 *
 * The inbox, the hub's counts and recent-message card, the tab badges and the
 * chat route all need the same thing — the conversations this person is in — so
 * they read one copy rather than each fetching a slice. A Customer has a handful
 * and a staff member a few pages of them, so the list is cheap enough to be the
 * unit; when caching arrives it goes behind this seam and no screen changes.
 *
 * Shared rather than per-screen because unread is not a per-screen fact: opening
 * a thread clears its badge on the list behind it and on the tab bar above it,
 * and three copies of the list would clear one of the three.
 *
 * One list, two loads. Staff ask for `GET /conversations` and are done: the API
 * scopes it by role and membership, so an Agent's assigned threads, the
 * unassigned pool, their staff DMs and their groups arrive together and the
 * screens divide them up. A Customer's load is the same call plus two — their
 * organizations, which title support threads that carry no title of their own,
 * and the get-or-create that makes a first visit to Messages find a thread
 * waiting rather than an empty screen.
 */

export type ConversationInbox =
  | { status: 'loading' }
  /** Nothing to show: the list itself could not be fetched. */
  | { status: 'failed'; failure: ApiFailure }
  | {
      status: 'ready'
      conversations: Conversation[]
      organizationNames: ReadonlyMap<string, string>
    }

export type ConversationInboxView = ConversationInbox & {
  /** Pull-to-refresh. Distinct from a first load, which has nothing to show yet. */
  refreshing: boolean
  /**
   * How the fetch behind this list is doing — what the Launch animation waits on.
   *
   * `outstanding` until a load settles and then whichever way it settled. It
   * only goes back when the viewer does — nothing about *this* person is
   * un-answered once it has been answered. Distinct from `status`, which a
   * Restored list makes `ready` before anything has been asked of the API: the
   * very case this exists to tell apart.
   *
   * See `lib/launch-route`, which is where it decides something.
   */
  conversationFetch: ConversationFetch
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
  /** Put a conversation the API just handed over into the list, without refetching it. */
  addConversation: (conversation: Conversation) => void
}

const NOBODY: ReadonlyMap<string, string> = new Map()

/** Nobody to fetch for: an empty inbox rather than a pending one, so a screen reading this while signed out is not left on a spinner. */
const IDLE: ConversationInbox = { status: 'ready', conversations: [], organizationNames: NOBODY }

/**
 * What this device already knows about this person, before anything is fetched.
 *
 * A cold start Restores the list rather than beginning on a spinner, so the
 * first screen after the Launch animation is the last thing this phone knew —
 * the same rows, the same Unread counts, the same order — and the fetch running
 * underneath it confirms that rather than being the only thing that can draw
 * anything. With no network the confirmation never comes and the rows stay,
 * which is the whole point of them being on disk.
 *
 * A device with nothing to Restore — a first sign-in, a database this build does
 * not recognise, a database that will not open — loads exactly as it did before.
 * The three are deliberately indistinguishable here: Restore has no failure a
 * person sees.
 *
 * Organization names come back with it, because they are what titles a
 * Customer's Support DM: they arrive from a different endpoint but they change
 * with the same load, and a list Restored without them would draw every support
 * thread as `Support` and then rename it once that endpoint answered.
 */
function restored(viewerId: string): ConversationInbox {
  const { conversations, organizationNames } = restoreStore(viewerId)
  return conversations.length > 0
    ? { status: 'ready', conversations, organizationNames }
    : { status: 'loading' }
}

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

/** One socket event, applied to the rows on screen. Pure; the state around it is not. */
function applyToList(
  conversations: Conversation[],
  event: Exclude<RealtimeEvent, { kind: 'resync' }>,
  viewerId: string | null,
): Conversation[] {
  if (event.kind === 'deleted') return withoutConversation(conversations, event.conversationId)
  if (event.kind === 'conversation') return mergeConversation(conversations, event.conversation)
  if (event.kind === 'reassigned') return withReassignment(conversations, event.reassignment)
  // A Post is not a Message and never reaches the Conversation list — the Wall
  // is the only thing that reads a `post-*` event. See `lib/use-wall`.
  if (event.kind === 'post-created' || event.kind === 'post-updated' || event.kind === 'post-removed') {
    return conversations
  }
  // A Group join request answered is the Communities screen's to re-read —
  // see `useCommunityFeed`. The viewer's own tap already folds a newly-joined
  // Group's conversation in through `addConversation` (`useJoinGroup`); an
  // approval landing from elsewhere has no payload here to build one from, so
  // it waits for the next ordinary fetch to pick it up.
  if (event.kind === 'group-join-answered') return conversations
  if (!viewerId) return conversations
  return withIncomingMessage(conversations, event.conversationId, event.message, viewerId)
}

const ConversationInboxContext = createContext<ConversationInboxView | null>(null)

export function ConversationInboxProvider({ children }: { children: ReactNode }) {
  const value = useConversationInboxState()
  return (
    <ConversationInboxContext.Provider value={value}>
      {children}
    </ConversationInboxContext.Provider>
  )
}

export function useConversationInbox(): ConversationInboxView {
  const value = useContext(ConversationInboxContext)
  if (!value) {
    throw new Error('useConversationInbox must be used inside a ConversationInboxProvider')
  }
  return value
}

/** Nothing to fetch, for the half of a load only a Customer makes. */
const NO_ORGANIZATIONS: ApiResult<Organization[]> = { ok: true, value: [] }

function useConversationInboxState(): ConversationInboxView {
  const { state } = useAuth()
  /**
   * Who this inbox belongs to, or nobody. Keyed on the id rather than on the
   * role alone so signing out and back in as somebody else refetches instead of
   * showing the first person's threads.
   */
  const viewerId = state.status === 'signed-in' ? state.user.id : null
  const role: UserRole | null = state.status === 'signed-in' ? state.user.role : null

  const [inbox, setInbox] = useState<ConversationInbox>(IDLE)
  const [refreshing, setRefreshing] = useState(false)
  const [conversationFetch, setConversationFetch] = useState<ConversationFetch>('outstanding')

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
  if (describes !== viewerId) {
    setDescribes(viewerId)
    setInbox(viewerId ? restored(viewerId) : IDLE)
    setRefreshing(false)
    // Whoever this is now, nothing has been fetched for them yet — Restored rows
    // included, which is the point: they are what this phone last knew, not what
    // the API has just said.
    setConversationFetch('outstanding')
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

  /**
   * What the badge has already counted.
   *
   * A message is broadcast again whenever its receipt advances, and the thread
   * wants every one of those. A count cannot take them: adding is not
   * idempotent, and a tick moving from sent to delivered would raise a badge
   * with nothing behind it. See `createCountedMessages`.
   */
  const counted = useRef<ReturnType<typeof createCountedMessages>>(undefined)
  counted.current ??= createCountedMessages()

  /**
   * The Launch gate's bound. Armed here rather than in the launch screen
   * because this is where the load it bounds is started — and because a Resync
   * restarting the load is the thing it has to survive, which is only visible
   * from in here. See `lib/launch-deadline` and #52.
   */
  const deadline = useRef<LaunchDeadline>(undefined)
  deadline.current ??= createLaunchDeadline()

  const load = useCallback(async (mode: 'first' | 'refresh' | 'resync') => {
    const mine = ++generation.current
    loadOut.current = true
    // Every load, and the first one wins: `arm` does nothing while a deadline
    // is already running, which is exactly what a Resync's call has to do. The
    // generation guard below strands the load this one is replacing, and if
    // that strand also restarted the clock the launch would have no bound —
    // only each hop of it would.
    deadline.current?.arm(() => {
      // The gate is told to stop waiting; the load is not cancelled and may
      // still answer, which is why this is not terminal.
      setConversationFetch('abandoned')
      // The rule the first-load failure below already settles: Restored rows
      // are what this phone knows and are kept, and a list with nothing in it
      // says so rather than rendering as *no conversations found*. Unreachable
      // because that is what it is — silence, and nothing about the session.
      setInbox((current) =>
        current.status === 'ready' && current.conversations.length > 0
          ? current
          : { status: 'failed', failure: { kind: 'unreachable' } },
      )
    })
    // A resync is not something anyone asked for, so it shows nothing while it
    // runs: the list on screen stays exactly as it is until the answer replaces
    // it. A spinner appearing on its own would read as an error.
    if (mode === 'refresh') setRefreshing(true)

    // Only a Customer's support thread is titled by an organization and
    // get-or-created against one, so only a Customer pays for the two requests
    // that need. Staff rows name a peer, a group or a customer of their own.
    const forCustomer = role === 'customer'
    const [organizations, list] = await Promise.all([
      forCustomer ? listMyOrganizations() : NO_ORGANIZATIONS,
      listConversations(),
    ])

    if (generation.current !== mine) return

    if (!list.ok) {
      loadOut.current = false
      readWhileLoading.current.clear()
      // Settled, which is all the Launch animation asked, so the gate is
      // released and its clock stops. Recorded for every mode rather than the
      // first load alone: a resync bumps the generation and strands the load it
      // interrupted, so the gate has to be released by whichever one actually
      // comes back.
      deadline.current?.settle()
      setConversationFetch('failed')
      // A resync that failed leaves what is on screen alone. Nobody asked for
      // it, the rows are still the last thing the API said, and replacing them
      // with an error would turn a dropped connection into an empty inbox.
      //
      // So does a first load, now that there can be Restored rows behind it. A
      // phone with no signal must not answer a cold start by throwing away the
      // one thing it still had to show, and the error screen is what it would be
      // throwing them away for.
      //
      // A refresh is neither. Somebody pulled it, and an action a person took
      // has to say what became of it — so this stays exactly as it was, error
      // screen and all, even though that costs the Restored rows. Keeping them
      // *and* saying the refresh failed needs somewhere to say it that is not
      // the empty-list slot the notice lives in today; that is a screen change
      // rather than a Store one.
      const keepRows = mode === 'first'
      if (mode !== 'resync') {
        setInbox((current) =>
          keepRows && current.status === 'ready' && current.conversations.length > 0
            ? current
            : { status: 'failed', failure: list.failure },
        )
      }
      setRefreshing(false)
      return
    }

    // A Customer's support thread belongs to an organization, and the mobile app
    // shows one. Any others they hold threads in still arrive in the list above;
    // what this decides is only which one is created on a first visit.
    const primary = organizations.ok ? organizations.value[0] : undefined
    const support = forCustomer && primary ? await ensureSupportConversation(primary.id) : null

    if (generation.current !== mine) return
    loadOut.current = false
    deadline.current?.settle()
    setConversationFetch('answered')

    const merged =
      support?.ok === true
        ? mergeConversation(list.value, support.value)
        : sortConversations(list.value)

    setInbox((current) => ({
      status: 'ready',
      conversations: drain(readWhileLoading.current, merged),
      // The organizations are a second request, and the list is not held
      // hostage to it: one that failed keeps the names already held rather than
      // replacing them with none. A Customer whose list arrived and whose
      // organizations did not would otherwise watch every Support thread lose
      // its title — and, now that the names are Restored, lose it on disk too.
      organizationNames: organizations.ok
        ? new Map(
            organizations.value.map((organization) => [organization.id, organization.name]),
          )
        : current.status === 'ready'
          ? current.organizationNames
          : NOBODY,
    }))
    setRefreshing(false)
  }, [role])

  useEffect(() => {
    // Nothing to cancel on the way out — `fetch` is already out — but bumping
    // the generation makes whatever comes back land on a load nobody is waiting
    // for, which is also what a sign-out needs.
    generation.current += 1
    loadOut.current = false
    readWhileLoading.current.clear()
    // Somebody else, or nobody: a different launch, and it gets a clock of its
    // own rather than inheriting one that has already run.
    deadline.current?.reset()

    if (!viewerId) return
    void load('first')

    return () => {
      generation.current += 1
      // Nothing left to hand over to.
      deadline.current?.reset()
    }
  }, [viewerId, load])

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

    // And the shade goes with the badge. A read that left three notifications
    // for this thread standing in it would be a second unread count, disagreeing
    // with the one that has just gone — and every way a thread is read runs
    // through here, whether it was opened from the app or from one of the
    // notifications being cleared, so there is one call site and no path around
    // it. Nothing waits for it; see `dismissConversationNotifications`.
    void dismissConversationNotifications(id)
  }, [])

  /**
   * A conversation this client has just been handed, folded into the list.
   *
   * The get-or-create calls — a staff DM started from the directory, a
   * Customer's first support thread — answer with a row the list does not have
   * yet, and refetching the whole list to learn about it would put the largest
   * request in the app between a tap and the thread it opens.
   */
  const addConversation = useCallback((conversation: Conversation) => {
    setInbox((current) =>
      current.status === 'ready'
        ? { ...current, conversations: mergeConversation(current.conversations, conversation) }
        : current,
    )
  }, [])

  /**
   * What the socket says, on the list.
   *
   * Every case is one call into `lib/conversation-list`, where what it means is
   * decided and tested. A message moves the row and its count; a row the API
   * re-sends replaces the one held, count included, since the API answers
   * `unreadCount: null` everywhere but the list endpoint; a deleted conversation
   * goes, because a hard delete leaves nothing to refetch.
   *
   * A message for a conversation this client has never held changes nothing —
   * the `conversation.updated` the API sends beside it carries the whole row and
   * adds it.
   *
   * A reassignment is the one event addressed to a single person: the API sends
   * it only to the assignee who has just lost the thread. So it moves this
   * viewer's own row, and every *other* staff session learns the same thing from
   * the `conversation.updated` that follows.
   */
  useRealtimeEvents((event: RealtimeEvent) => {
    if (event.kind === 'resync') {
      void load('resync')
      return
    }

    // A message already counted still reaches the thread, which merges the
    // newer copy over the older by id; what it must not do is count twice.
    if (event.kind === 'message' && !counted.current?.isFirst(event.message.id)) return

    setInbox((current) => {
      if (current.status !== 'ready') return current

      const conversations = applyToList(current.conversations, event, viewerId)
      return conversations === current.conversations ? current : { ...current, conversations }
    })
  })

  /**
   * Every state this list reaches, written through to the Store.
   *
   * Observed here rather than written at each transition, deliberately. A
   * fetched page, a socket event, a mark-as-read and a get-or-create all end up
   * in this one piece of state, so watching it persists all four — and the
   * fifth, added a year from now by somebody who would have had no idea there
   * was a writer to call.
   *
   * Off the render path: an effect, and a call that queues rather than writes.
   * Nothing here is awaited and nothing here can fail — see
   * `lib/conversation-store`. Keyed on the viewer, so a sign-out writes nothing
   * over the rows of the person who just left.
   */
  useEffect(() => {
    if (!viewerId || inbox.status !== 'ready') return
    void saveStore(viewerId, {
      conversations: inbox.conversations,
      organizationNames: inbox.organizationNames,
    })
  }, [viewerId, inbox])

  return useMemo(
    () => ({ ...inbox, refreshing, conversationFetch, reload, markRead, addConversation }),
    [inbox, refreshing, conversationFetch, reload, markRead, addConversation],
  )
}
