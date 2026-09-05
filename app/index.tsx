import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { UnreachableScreen } from "@/components/auth/unreachable-screen";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import { useAuth } from "@/lib/auth-context";
import { useConversationInbox } from "@/lib/conversation-inbox";
import { launchDestination, type LaunchHold } from "@/lib/launch-route";

/**
 * How long the launch animation stays up *after it is actually on screen*.
 * Timing this from mount instead would spend most of the window decoding a
 * 4 MB WebP and fade the animation out just as it started playing.
 */
const MINIMUM_DISPLAY_MS = 2000;

/**
 * The other end of the same hold: how long the launch animation may stay up
 * waiting for the Conversation list, however many times that list is asked for.
 *
 * A number about the person rather than about the network, and deliberately
 * shorter than `lib/api-client`'s Request deadline. Tying it to that deadline
 * is what #52 is a bug report about — one round trip is bounded, and a socket
 * flapping inside the launch window keeps starting fresh ones, so the sum never
 * was. Sizing the bound to fit a strand of them only moves the number up;
 * nothing makes ten seconds of a looping animation with no control on it worth
 * watching, and with the Store there is a Hub with Restored rows behind it the
 * whole time.
 *
 * The cost is that a genuinely slow first load is cut off here rather than
 * waited out. That is the trade the Store pays for: being cut off means the
 * rows this phone already holds, and the list still lands in them when it
 * arrives.
 */
const LAUNCH_BOUND_MS = 10_000;

export default function Index() {
  const { state, retry } = useAuth();
  // The other half of the gate — see `lib/launch-route` for what it decides.
  // Read from the shared inbox rather than fetched here: this is the same load
  // every screen after this one reads, and asking for it twice would be two
  // lists with one of them thrown away.
  const { conversationFetch } = useConversationInbox();
  const [animationReady, setAnimationReady] = useState(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  /**
   * Whether the hold has run past its bound. What that decides is
   * `lib/launch-route`'s; all that is here is the clock that reaches it.
   */
  const [hold, setHold] = useState<LaunchHold>("within");
  /**
   * Which attempt at this launch is running: nought for the cold start, one
   * more for every Try again.
   *
   * Doubles as whether Try again has ever been pressed, which is the one thing
   * that distinguishes a second run of Hydration from the first — see
   * `retryStarted` below.
   */
  const [attempt, setAttempt] = useState(0);
  /**
   * Whether Try again has ever been pressed.
   *
   * Unreachable is the only place the launch animation is torn down while
   * Hydration can still come back round, and `retry` puts the state back to
   * `hydrating`. Without this the loading screen would remount on the press:
   * another 4 MB decode, another two seconds, and the screen someone just
   * pressed a button on replaced by an animation that says nothing about
   * whether the press worked.
   *
   * Counted from the press rather than derived from the auth state, because
   * the press is the fact — `hydrating` cannot tell the two runs apart on its
   * own, and asking a render or an effect to remember which one this is puts a
   * cascade where an event handler will do.
   */
  const retryStarted = attempt > 0;
  const navigatedRef = useRef(false);

  // Where Hydration says this person belongs, and whether there is yet anything
  // to show them there. The mapping is `lib/launch-route`; what is left here is
  // only the timing around it.
  const destination = launchDestination(state, conversationFetch, hold);
  const targetHref = destination.kind === "navigate" ? destination.href : null;

  // The hold, both of its ends, started from `animationReady` and never from
  // mount. `AppLoadingScreen` reports ready when the WebP has decoded, and
  // reports it anyway if the decode stalls past its own 2.5s failsafe.
  //
  // That same report is what hides the native splash, which is all the root
  // layout's 6s backstop is about — so the backstop still sits beyond every path
  // through this gate however long the fetch takes.
  //
  // The far end is #52. It is armed here beside the minimum rather than in a
  // clock of its own, because they are the two ends of one stretch of time; two
  // timers each deciding when the launch is over is what that would become.
  //
  // Note which one this does *not* depend on: the fetch. That is the bug — a
  // bound re-armed by anything happening underneath it is not a bound.
  //
  // Re-armed on a Try again, which is why the attempt is a dependency: a retry
  // is another go at the same launch and gets the same bound, rather than
  // inheriting an expiry from the wait that preceded it. The minimum is re-armed
  // with it and has nothing to do — it went true the first time and never goes
  // back — but keeping one effect over the pair is worth more than skipping a
  // timer that changes nothing.
  useEffect(() => {
    if (!animationReady) return;
    const minimum = setTimeout(() => {
      setMinTimeElapsed(true);
    }, MINIMUM_DISPLAY_MS);
    const bound = setTimeout(() => {
      setHold("expired");
    }, LAUNCH_BOUND_MS);
    return () => {
      clearTimeout(minimum);
      clearTimeout(bound);
    };
  }, [animationReady, attempt]);

  // Both halves have to be true, in either order: an answer arriving early does
  // not cut the animation short, and one arriving late is not cut off. Asked of
  // the destination rather than of `targetHref`, so that the two non-navigating
  // outcomes stay distinguishable here as well.
  const isFinishing = minTimeElapsed && destination.kind === "navigate";

  const handleReady = useCallback(() => {
    setAnimationReady(true);
  }, []);

  // A fresh attempt, so a fresh hold: the bound is on a launch, not on the app,
  // and somebody who left Unreachable on screen past it must not have their
  // retry handed over the moment Hydration lands with the list still coming.
  const handleRetry = useCallback(() => {
    setAttempt((n) => n + 1);
    setHold("within");
    retry();
  }, [retry]);

  const handleFinish = useCallback(() => {
    if (targetHref && !navigatedRef.current) {
      navigatedRef.current = true;
      router.replace(targetHref);
    }
  }, [targetHref]);

  // Gated on `animationReady` rather than shown the instant Hydration fails:
  // `AppLoadingScreen` owns hiding the native splash, so unmounting it before it
  // has reported ready would leave the splash up until the root layout's backstop.
  const showUnreachable = destination.kind === "unreachable" && animationReady;

  // A retry, not a cold start: Hydration is out again, and Unreachable stays up
  // with its button busy rather than the launch animation coming back. A retry
  // that finds the API down again lands on `unreachable`, so this goes false and
  // the button is pressable once more.
  //
  // `wait` now covers the list still coming as well as Hydration still running,
  // so a retry that succeeds keeps the button busy until there is a Hub to hand
  // over. That is the same promise the gate makes on a cold start, kept on the
  // one path where the animation is already gone — and bounded the same way,
  // since the press re-arms the hold.
  const retrying = retryStarted && destination.kind === "wait";

  // Once the animation is gone, nothing is left to call `onFinish`, so the
  // navigation a successful retry earns has to be made here instead.
  useEffect(() => {
    if (!retryStarted || !targetHref || navigatedRef.current) return;
    navigatedRef.current = true;
    router.replace(targetHref);
  }, [retryStarted, targetHref]);

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
