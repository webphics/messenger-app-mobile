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
  const { state } = useAuth();
  const [animationReady, setAnimationReady] = useState(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
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

  const handleFinish = useCallback(() => {
    if (targetHref && !navigatedRef.current) {
      navigatedRef.current = true;
      router.replace(targetHref);
    }
  }, [targetHref]);

  // Gated on `animationReady` rather than shown the instant Hydration fails:
  // `AppLoadingScreen` owns hiding the native splash, so unmounting it before it
  // has reported ready would leave the splash up until the root layout's backstop.
  if (destination.kind === "unreachable" && animationReady) {
    return <UnreachableScreen />;
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
