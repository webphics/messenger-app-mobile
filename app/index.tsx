import { router, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { UnreachableScreen } from "@/components/auth/unreachable-screen";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import { useAuth } from "@/lib/auth-context";
import { useConversationInbox } from "@/lib/conversation-inbox";
import { launchDestination } from "@/lib/launch-route";
import { usePushIntent } from "@/lib/push-intent";

export default function Index() {
  const { state, retry } = useAuth();
  // The other half of the gate — see `lib/launch-route` for what it decides.
  // Read from the shared inbox rather than fetched here: this is the same load
  // every screen after this one reads, and asking for it twice would be two
  // lists with one of them thrown away.
  const { conversationFetch } = useConversationInbox();
  // The third input to the gate: the thread a tapped notification asked for, or
  // null on a launch nobody tapped anything to start. Held outside this screen
  // because the tap is reported while the process is still coming up — see
  // `lib/push-intent`.
  const { pendingThread, setLaunchOnScreen, clearPendingThread } = usePushIntent();
  // Whether the launch screen has hidden the native splash. Until it has, it
  // has to stay mounted — see `showUnreachable`.
  const [launchReady, setLaunchReady] = useState(false);
  /**
   * Whether Try again has been pressed — the one thing that distinguishes a
   * second run of Hydration from the first.
   *
   * Unreachable is the only place the launch screen is torn down while
   * Hydration can still come back round, and `retry` puts the state back to
   * `hydrating`. Without this the loading screen would remount on the press,
   * and the screen someone just pressed a button on would be replaced by a
   * logo that says nothing about whether the press worked.
   *
   * Taken from the press rather than derived from the state, because the press
   * is the fact — `hydrating` cannot tell the two runs apart on its own, and
   * asking a render or an effect to remember which one this is puts a cascade
   * where an event handler will do.
   */
  const [retryStarted, setRetryStarted] = useState(false);
  const navigatedRef = useRef(false);

  // While this screen is up, a tapped notification is worth holding: this is the
  // only thing that reads one. Once it is gone the listener navigates instead —
  // see `lib/push-intent`.
  useEffect(() => {
    setLaunchOnScreen(true);
    return () => setLaunchOnScreen(false);
  }, [setLaunchOnScreen]);

  // Where Hydration says this person belongs, and whether there is yet anything
  // to show them there. The mapping is `lib/launch-route`; what is left here is
  // only the timing around it.
  const destination = launchDestination(state, conversationFetch, pendingThread);
  const targetHref = destination.kind === "navigate" ? destination.href : null;
  // What has to be on the stack underneath the target before the launch lands on
  // it. Only a tapped notification asks for one, and it is the whole reason Back
  // out of that thread leaves the thread rather than the app.
  const behindHref =
    destination.kind === "navigate" ? (destination.behind ?? null) : null;

  // `AppLoadingScreen` reports ready when the mark has decoded, and reports it
  // anyway if the decode stalls past its own 2.5s failsafe. That report is what
  // hides the native splash, which is all the root layout's 6s backstop is
  // about. What the fetch can extend is the launch screen over the top of it,
  // and only as far as the Launch deadline — which is armed in
  // `lib/conversation-inbox` beside the load it bounds, and arrives here as a
  // settled `conversationFetch` like any other. This screen holds no clock.
  //
  // Asked of the destination rather than of `targetHref`, so that the two
  // non-navigating outcomes stay distinguishable here as well.
  const isFinishing = launchReady && destination.kind === "navigate";

  const handleReady = useCallback(() => {
    setLaunchReady(true);
  }, []);

  const handleRetry = useCallback(() => {
    setRetryStarted(true);
    retry();
  }, [retry]);

  /**
   * Hand the launch over.
   *
   * One place rather than two, because the two callers — the launch screen
   * finishing, and a retry that succeeded after it was gone — have to land the
   * same way, and a tap makes that two calls rather than one: the Hub replaces
   * the launch screen and the thread is pushed onto it, so Back finds the Hub.
   *
   * The Pending thread is cleared whichever destination this was. A launch that sent
   * somebody to sign-in has dropped it deliberately — the Session end that took
   * the cookie took the Store the thread would have drawn from — and a launch
   * that opened the thread has spent it.
   */
  const handOver = useCallback(
    (href: Href, behind: Href | null) => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      if (behind) {
        router.replace(behind);
        router.push(href);
      } else {
        router.replace(href);
      }
      clearPendingThread();
    },
    [clearPendingThread],
  );

  const handleFinish = useCallback(() => {
    if (targetHref) handOver(targetHref, behindHref);
  }, [targetHref, behindHref, handOver]);

  // Gated on `launchReady` rather than shown the instant Hydration fails:
  // `AppLoadingScreen` owns hiding the native splash, so unmounting it before it
  // has reported ready would leave the splash up until the root layout's backstop.
  const showUnreachable = destination.kind === "unreachable" && launchReady;

  // A retry, not a cold start: Hydration is out again, and Unreachable stays up
  // with its button busy rather than the launch screen coming back. A retry
  // that finds the API down again lands on `unreachable`, so this goes false and
  // the button is pressable once more.
  //
  // `wait` now covers the list still coming as well as Hydration still running,
  // so a retry that succeeds keeps the button busy until there is a Hub to hand
  // over. That is the same promise the gate makes on a cold start, kept on the
  // one path where the launch screen is already gone.
  const retrying = retryStarted && destination.kind === "wait";

  // Once the launch screen is gone, nothing is left to call `onFinish`, so the
  // navigation a successful retry earns has to be made here instead.
  useEffect(() => {
    if (!retryStarted || !targetHref) return;
    handOver(targetHref, behindHref);
  }, [retryStarted, targetHref, behindHref, handOver]);

  if (showUnreachable || retrying) {
    return <UnreachableScreen retrying={retrying} onRetry={handleRetry} />;
  }

  return (
    <View className="flex-1 bg-bg">
      <AppLoadingScreen
        isFinishing={isFinishing}
        onReady={handleReady}
        onFinish={handleFinish}
      />
    </View>
  );
}
