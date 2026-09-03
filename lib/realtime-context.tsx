import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'

import { getSessionCookie } from '@/lib/api-client'
import { useAuth } from '@/lib/auth-context'
import { connectRealtime } from '@/lib/realtime'
import {
  parseConversationDeleted,
  parseConversationUpdated,
  parseMessageCreated,
  REALTIME_EVENTS,
} from '@/lib/realtime-events'
import type { Conversation, Message } from '@/lib/types'

/**
 * The socket, and what the screens above it hear from it.
 *
 * Two connections, mirroring the web client. The global one lives for as long as
 * someone is signed in and carries everything that changes the list — a message
 * anywhere, a row that moved, a conversation that is gone. The second is opened
 * only while a thread is on screen and exists to put this device in that
 * conversation's room; nothing listens on it, because the global connection
 * already receives the same events through the signed-in person's own room.
 * Room membership is what the server checks before it accepts a typing signal,
 * so the seam is here before the feature that needs it.
 *
 * Events reach screens through one subscription rather than through a socket
 * each: the list and the open thread both want `message.created`, and two
 * sockets listening for it would deliver it twice to a count that must go up
 * once. What a subscriber receives has been read into this app's types and
 * nothing else — in particular nothing here decides that a message has been
 * heard before. One message is broadcast again each time its receipt advances,
 * which is how a tick moves without a refresh, and a filter here would swallow
 * exactly that. The unread count keeps its own memory instead; see
 * `createCountedMessages`.
 */

export type RealtimeEvent =
  | { kind: 'message'; conversationId: string; message: Message }
  | { kind: 'conversation'; conversation: Conversation }
  | { kind: 'deleted'; conversationId: string }
  /**
   * The connection came back after dropping. Whatever was emitted while it was
   * down was emitted to nobody, so what is held is unverifiable and has to be
   * re-read from REST — which is the authority, socket or no socket.
   *
   * Never sent for a first connect: the screens fetched moments earlier and
   * nothing was missed.
   */
  | { kind: 'resync' }

type RealtimeListener = (event: RealtimeEvent) => void

type RealtimeValue = {
  /** Answers the function that unsubscribes. */
  subscribe: (listener: RealtimeListener) => () => void
  /** Whether there is a session to open a connection with. Not socket state. */
  signedIn: boolean
}

const RealtimeContext = createContext<RealtimeValue | null>(null)

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const value = useRealtimeConnection()
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
}

function useRealtime(): RealtimeValue {
  const value = useContext(RealtimeContext)
  if (!value) {
    throw new Error('useRealtime must be used inside a RealtimeProvider')
  }
  return value
}

/**
 * Hear what the socket says, for as long as the component is on screen.
 *
 * The handler is kept in a ref and the subscription is made once, so a screen
 * that rebuilds its callback every render — which every screen does — does not
 * tear the subscription down and put it back on each of them. Callers pass a
 * plain function for that reason: memoising it here would buy nothing.
 */
export function useRealtimeEvents(listener: RealtimeListener): void {
  const { subscribe } = useRealtime()
  const latest = useRef(listener)
  useEffect(() => {
    latest.current = listener
  }, [listener])

  useEffect(() => subscribe((event) => latest.current(event)), [subscribe])
}

/**
 * Put this device in one conversation's room while the thread is open.
 *
 * The join is re-emitted on every `connect` rather than once at creation: a
 * reconnect gives the socket a new identity server-side, in no room at all, and
 * a one-shot join would leave it that way for the rest of the session. Joining a
 * room already held is a no-op, so re-emitting costs nothing.
 */
export function useConversationRoom(conversationId: string | null): void {
  const { signedIn } = useRealtime()

  useEffect(() => {
    if (!signedIn || !conversationId) return

    const cookie = getSessionCookie()
    if (!cookie) return

    const socket = connectRealtime(cookie, { forceNew: true })
    socket.on('connect', () => {
      socket.emit(REALTIME_EVENTS.conversationJoin, { conversationId })
    })

    return () => {
      // Told rather than left to be inferred from the disconnect: the server
      // drops the room with the socket either way, and saying so first makes it
      // immediate instead of dependent on how soon the drop is noticed.
      socket.emit(REALTIME_EVENTS.conversationLeave, { conversationId })
      socket.removeAllListeners()
      socket.disconnect()
    }
  }, [signedIn, conversationId])
}

function useRealtimeConnection(): RealtimeValue {
  const { state } = useAuth()
  /**
   * Whose connection this is, or nobody's. Keyed on the id so signing out and
   * back in as someone else opens a new one rather than keeping the first
   * person's — the cookie on the handshake is fixed for the life of the socket.
   */
  const userId = state.status === 'signed-in' ? state.user.id : null

  /** Built once, not per render: every subscription is held against this one set. */
  const registry = useRef<Set<RealtimeListener>>(undefined)
  registry.current ??= new Set()
  const listeners = registry.current

  /** Stable for the connection's lifetime, so a subscriber that arrives later still hears events. */
  const emit = useCallback(
    (event: RealtimeEvent) => {
      for (const listener of listeners) listener(event)
    },
    [listeners],
  )

  useEffect(() => {
    if (!userId) return

    // Read here rather than passed in: the cookie is set before the auth state
    // says signed-in, and holding it in React state would put a credential in a
    // render tree that has no use for one.
    const cookie = getSessionCookie()
    if (!cookie) return

    const socket = connectRealtime(cookie)
    let connectedBefore = false

    socket.on('connect', () => {
      if (connectedBefore) emit({ kind: 'resync' })
      connectedBefore = true
    })

    socket.on(REALTIME_EVENTS.messageCreated, (payload: unknown) => {
      const event = parseMessageCreated(payload)
      if (!event) return
      emit({ kind: 'message', conversationId: event.conversationId, message: event.message })
    })

    socket.on(REALTIME_EVENTS.conversationUpdated, (payload: unknown) => {
      const conversation = parseConversationUpdated(payload)
      if (conversation) emit({ kind: 'conversation', conversation })
    })

    socket.on(REALTIME_EVENTS.conversationDeleted, (payload: unknown) => {
      const conversationId = parseConversationDeleted(payload)
      if (conversationId) emit({ kind: 'deleted', conversationId })
    })

    return () => {
      socket.removeAllListeners()
      socket.disconnect()
    }
  }, [emit, userId])

  return useMemo(
    () => ({
      subscribe: (listener: RealtimeListener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      signedIn: userId !== null,
    }),
    [listeners, userId],
  )
}
