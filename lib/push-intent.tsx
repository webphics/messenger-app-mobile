import { router } from 'expo-router'
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
import { chatHref } from '@/lib/chat-route-id'
import { pushRouteHref } from '@/lib/hub-routes'
import {
  addPushTapListener,
  takeTappedConversation,
  takeTappedRoute,
} from '@/lib/push-device'
import type { PushRoute } from '@/lib/push-rules'
import type { UserRole } from '@/lib/types'

/**
 * The thread a tapped notification asked for, held only for as long as nothing
 * can act on it yet.
 *
 * A tap has two very different shapes and this module is the seam between them.
 * While the app is running there is nothing to decide: somebody is already
 * somewhere, and the listener navigates. From a cold start there is a great deal
 * in front of it — Hydration, the Store's Restore, the Launch gate — and the
 * thread cannot be opened over a Hub that does not exist yet, so the Pending
 * thread waits here and the gate takes it as its third input. See
 * `lib/launch-route`, which is where the deciding happens; nothing about *where
 * a launch lands* is decided in this module.
 *
 * Held in one place rather than read where it is needed, because the two moments
 * do not share a screen: the cold-start read has to happen before the launch
 * screen has drawn anything, and the tap after it arrives when that screen is
 * long gone.
 */

type PushIntentView = {
  /** The thread a launch should open over the Hub, or null for an ordinary one. */
  pendingThread: string | null
  /** The screen a launch should open over the Hub for a tap about no thread, or null. */
  pendingRoute: PushRoute | null
  /**
   * Told by the launch screen while it is the screen — which is exactly while a
   * Pending thread is worth holding, because the gate is the only thing that
   * reads one.
   */
  setLaunchOnScreen: (onScreen: boolean) => void
  /** Called by the Launch gate once it has acted on the Pending thread, either way. */
  clearPendingThread: () => void
}

const PushIntentContext = createContext<PushIntentView | null>(null)

export function PushIntentProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const [pendingThread, setPendingThread] = useState<string | null>(null)
  const [pendingRoute, setPendingRoute] = useState<PushRoute | null>(null)

  const signedIn = state.status === 'signed-in'
  const role: UserRole | null = state.status === 'signed-in' ? state.user.role : null
  /**
   * Both are facts about the moment a tap arrives, so the listener reads them
   * rather than depending on them: subscribing again every time somebody moved
   * between screens or their session settled would be a subscription torn down
   * and rebuilt for nothing, and a tap landing in the gap would be lost.
   */
  const signedInRef = useRef(signedIn)

  useEffect(() => {
    signedInRef.current = signedIn
  }, [signedIn])

  /** Read by the listener for the same reason as `signedInRef`: a route depends on the role. */
  const roleRef = useRef(role)

  useEffect(() => {
    roleRef.current = role
  }, [role])

  /**
   * Whether the launch screen is the screen, told by that screen rather than
   * read off the router — which is the distinction the emulator had to make.
   * A route group is not part of a path, so the Customer Hub —
   * `app/(customer)/(home)/index` — has the pathname `/` exactly as `app/index`
   * does, and a tap on the Hub was held for a gate that had already gone.
   *
   * Asking the screen instead answers the question actually being asked: not
   * *where is the router*, but *is there still something that will read a
   * Pending thread*. It is also right for a cold start that never draws the
   * launch screen at all — a magic link opens its own route, and a tap there
   * navigates rather than waiting for a gate that will never run.
   */
  const atLaunchRef = useRef(false)
  const setLaunchOnScreen = useCallback((onScreen: boolean) => {
    atLaunchRef.current = onScreen
  }, [])

  useEffect(() => {
    // The tap that started this launch, which no listener can be registered in
    // time to hear: the process is still coming up while the platform reports
    // it. `push-device` hands it out once, so a platform that also replays it
    // through the listener below does not open the thread twice.
    const tapped = takeTappedConversation()
    // The current value of the thing this effect subscribes to, rather than a
    // render-driven update: the platform reported the tap before this app could
    // listen for one, so reading it is the same act as subscribing. Guarded,
    // keyed on nothing, and it cannot cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tapped) setPendingThread(tapped)
    // A tap on a notification about no thread, held for the gate on the same terms.
    const tappedRoute = tapped ? null : takeTappedRoute()
    if (tappedRoute) setPendingRoute(tappedRoute)

    return addPushTapListener((conversationId) => {
      // Still on the launch screen: there is no Hub to open this over yet, so
      // it goes to the gate like the launch's own tap rather than navigating
      // into a stack that is about to be replaced.
      if (atLaunchRef.current) {
        setPendingThread(conversationId)
        return
      }

      // Somebody is signed in and somewhere, so this is the whole of it: pushed
      // rather than replaced, so Back leaves the thread for wherever they were.
      // A tap arriving with no session is dropped — the Session end that took
      // the cookie took the Store this thread would have drawn from.
      if (signedInRef.current) router.push(chatHref(conversationId))
    }, (route) => {
      // The same two cases as a thread's tap: held for the gate while the launch screen
      // is up, pushed over wherever somebody is otherwise.
      if (atLaunchRef.current) {
        setPendingRoute(route)
        return
      }
      const currentRole = roleRef.current
      if (signedInRef.current && currentRole) router.push(pushRouteHref(route, currentRole))
    })
  }, [])

  const clearPendingThread = useCallback(() => {
    setPendingThread(null)
    setPendingRoute(null)
  }, [])

  const value = useMemo(
    () => ({ pendingThread, pendingRoute, setLaunchOnScreen, clearPendingThread }),
    [pendingThread, pendingRoute, setLaunchOnScreen, clearPendingThread],
  )

  return <PushIntentContext.Provider value={value}>{children}</PushIntentContext.Provider>
}

export function usePushIntent(): PushIntentView {
  const value = useContext(PushIntentContext)
  if (!value) {
    throw new Error('usePushIntent must be used inside a PushIntentProvider')
  }
  return value
}
