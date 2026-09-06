import { router } from 'expo-router'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { AppState } from 'react-native'

import { BannerStrip } from '@/components/push/banner-strip'
import { useAuth } from '@/lib/auth-context'
import { bannerNotice, type BannerNotice } from '@/lib/banner-notice'
import { chatHref } from '@/lib/chat-route-id'
import { useConversationInbox } from '@/lib/conversation-inbox'
import { conversationTitle } from '@/lib/conversation-title'
import { useRealtimeEvents, type RealtimeEvent } from '@/lib/realtime-context'

/**
 * The In-app banner: what a Message gets instead of a Push notification while
 * the app is open on some other screen.
 *
 * It lives above the navigator for the same reason `PushIntentProvider` does —
 * the Message it names belongs to whichever screen somebody is on, which is to
 * say to none of them — and it is fed by the socket rather than by an arriving
 * dispatch. That is the load-bearing choice here: the strip has to appear for
 * somebody who refused the notification permission, whose conversations move
 * exactly as everybody else's do, and the socket is already what moves the row
 * and the tab badge. One event, three surfaces, and this is the one that says
 * which thread the other two just changed for.
 *
 * The operating system draws nothing while the app is in front of the person —
 * see the handler in `lib/push-device` — so the two are never both on screen.
 *
 * What earns a strip is `lib/banner-notice`, pure and table-tested. What is left
 * here is the part that is about time and place rather than about the Message:
 * which thread is on screen, whether the app is in the foreground, and how long
 * a strip stays.
 */

/** How long a strip stays before it takes itself away. */
const BANNER_MS = 5_000

type InAppBannerView = {
  /**
   * Told by a thread screen for as long as it is mounted, so that a Message
   * already drawn as a bubble does not also arrive as a strip over the top of
   * it.
   *
   * Declared rather than read off the router, the distinction `push-intent` had
   * to make for the launch gate: a route id is not always a conversation id,
   * because the Offers alias resolves against the list rather than being one.
   */
  declareThreadOnScreen: (conversationId: string) => void
  withdrawThreadOnScreen: (conversationId: string) => void
}

const InAppBannerContext = createContext<InAppBannerView | null>(null)

export function InAppBannerProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const inbox = useConversationInbox()
  const viewerId = state.status === 'signed-in' ? state.user.id : null

  /**
   * The thread screens that are mounted, newest last.
   *
   * A stack rather than one id, because more than one can be mounted at a time
   * and the router does not unmount what it pushes over: tapping a strip from
   * inside a thread pushes a second thread screen on top of the first, and
   * going Back leaves the first on screen having never been asked again. One id
   * would have been cleared by that pop and never restored, and the thread
   * somebody was reading would start getting strips about itself.
   *
   * Conversation details and Shared in chat are pushed over a thread without
   * declaring anything, which leaves the thread underneath at the top of this
   * stack. That is the right answer: somebody reading a thread's details is
   * inside that conversation.
   */
  const [mounted, setMounted] = useState<string[]>([])
  const threadOnScreen = mounted[mounted.length - 1] ?? null
  const [notice, setNotice] = useState<BannerNotice | null>(null)

  /**
   * Arriving at a thread puts away a strip that names it, however it was
   * arrived at — by tapping the strip, or by finding the row underneath it.
   * Once somebody is there the bubble is the answer and the strip is the app
   * repeating itself.
   *
   * Done as the thread is declared rather than in an effect over the two pieces
   * of state, because this is the moment it happens: an effect would put the
   * strip back the moment somebody left the thread again, having never expired.
   */
  const declareThreadOnScreen = useCallback((conversationId: string) => {
    setMounted((current) => [...current, conversationId])
    setNotice((current) =>
      current?.conversationId === conversationId ? null : current,
    )
  }, [])

  /**
   * One occurrence, found from the end: the same thread can be mounted twice —
   * a notification tapped for the thread already open pushes a second copy of
   * it — and both have to leave separately.
   */
  const withdrawThreadOnScreen = useCallback((conversationId: string) => {
    setMounted((current) => {
      const at = current.lastIndexOf(conversationId)
      return at === -1 ? current : [...current.slice(0, at), ...current.slice(at + 1)]
    })
  }, [])

  const ready = inbox.status === 'ready' ? inbox : null

  useRealtimeEvents((event: RealtimeEvent) => {
    if (event.kind !== 'message' || !viewerId) return

    const conversation = ready?.conversations.find((row) => row.id === event.conversationId)
    const next = bannerNotice({
      conversationId: event.conversationId,
      message: event.message,
      viewerId,
      threadOnScreen,
      // Read here rather than in the rule, because it is a fact about the
      // moment and not about the Message — the same split `PushRegistration`
      // makes. The socket is not torn down when the app goes behind something,
      // so a reply lands in a pocket too, and the platform has already drawn
      // that one.
      foreground: AppState.currentState === 'active',
      title:
        conversation && ready
          ? conversationTitle(conversation, ready.organizationNames)
          : null,
    })

    // A second Message replaces the first rather than queueing behind it: the
    // strip says which thread moved, and the newest is the answer to that.
    if (next) setNotice(next)
  })

  /**
   * The strip takes itself away, and is put back up whole by the next Message.
   *
   * Keyed on the notice rather than on a timer cleared by hand, so a Message
   * arriving while one is up restarts the wait instead of inheriting whatever
   * was left of the last one's.
   */
  useEffect(() => {
    if (!notice) return

    const timer = setTimeout(() => setNotice(null), BANNER_MS)
    return () => clearTimeout(timer)
  }, [notice])

  const dismiss = useCallback(() => setNotice(null), [])
  const open = useCallback(() => {
    if (!notice) return
    setNotice(null)
    // Pushed rather than replaced, so Back leaves the thread for wherever the
    // person was when it arrived — the same as a tap on a notification while the
    // app is running.
    router.push(chatHref(notice.conversationId))
  }, [notice])

  const value = useMemo(
    () => ({ declareThreadOnScreen, withdrawThreadOnScreen }),
    [declareThreadOnScreen, withdrawThreadOnScreen],
  )

  return (
    <InAppBannerContext.Provider value={value}>
      {children}
      {/* A Session end takes the strip with it: whatever it named is no longer
          this person's, and the list it came from has already gone. */}
      {notice && viewerId ? (
        <BannerStrip notice={notice} onOpen={open} onDismiss={dismiss} />
      ) : null}
    </InAppBannerContext.Provider>
  )
}

/**
 * Declare the thread on screen for as long as this component is mounted.
 *
 * One hook rather than a setter a screen has to remember to undo: leaving a
 * thread matters exactly as much as arriving at it, and a screen that unmounted
 * without saying so would suppress the strip for a conversation nobody is
 * looking at any more.
 */
export function useThreadOnScreen(conversationId: string | null): void {
  const value = useContext(InAppBannerContext)
  if (!value) {
    throw new Error('useThreadOnScreen must be used inside an InAppBannerProvider')
  }

  const { declareThreadOnScreen, withdrawThreadOnScreen } = value
  useEffect(() => {
    if (!conversationId) return

    declareThreadOnScreen(conversationId)
    return () => withdrawThreadOnScreen(conversationId)
  }, [conversationId, declareThreadOnScreen, withdrawThreadOnScreen])
}
