import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { UnreachableScreen } from "@/components/auth/unreachable-screen";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import { useAuth } from "@/lib/auth-context";
import { launchDestination } from "@/lib/launch-route";

/**
 * How long the launch animation stays up *after it is actually on screen*.
 * Timing this from mount instead would spend most of the window decoding a
 * 4 MB WebP and fade the animation out just as it started playing.
 */
const MINIMUM_DISPLAY_MS = 2000;

export default function Index() {
  const { state, retry } = useAuth();
  const [animationReady, setAnimationReady] = useState(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  /**
   * Whether Try again has been pressed — the one thing that distinguishes a
   * second run of Hydration from the first.
   *
   * Unreachable is the only place the launch animation is torn down while
   * Hydration can still come back round, and `retry` puts the state back to
   * `hydrating`. Without this the loading screen would remount on the press:
   * another 4 MB decode, another two seconds, and the screen someone just
   * pressed a button on replaced by an animation that says nothing about
   * whether the press worked.
   *
   * Taken from the press rather than derived from the state, because the press
   * is the fact — `hydrating` cannot tell the two runs apart on its own, and
   * asking a render or an effect to remember which one this is puts a cascade
   * where an event handler will do.
   */
  const [retryStarted, setRetryStarted] = useState(false);
  const navigatedRef = useRef(false);

  // Where Hydration says this person belongs. The mapping is `lib/launch-route`;
  // what is left here is only the timing around it.
  const destination = launchDestination(state);
  const targetHref = destination.kind === "navigate" ? destination.href : null;

  // Started from `animationReady`, never from mount. `AppLoadingScreen` reports
  // ready when the WebP has decoded, and reports it anyway if the decode stalls
  // past its own 2.5s failsafe — so the worst case here is 4.5s, still inside the
  // root layout's 6s splash backstop.
  useEffect(() => {
    if (!animationReady) return;
    const timer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, MINIMUM_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [animationReady]);

  // Both halves have to be true, in either order: Hydration finishing early does
  // not cut the animation short, and Hydration finishing late is not cut off.
  // Asked of the destination rather than of `targetHref`, so that the two
  // non-navigating outcomes stay distinguishable here as well.
  const isFinishing = minTimeElapsed && destination.kind === "navigate";

  const handleReady = useCallback(() => {
    setAnimationReady(true);
  }, []);

  const handleRetry = useCallback(() => {
    setRetryStarted(true);
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
