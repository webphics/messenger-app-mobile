import { router, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { UnreachableScreen } from "@/components/auth/unreachable-screen";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import { useAuth } from "@/lib/auth-context";
import { ROLE_HREF } from "@/lib/hub-routes";

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

  /**
   * Where Hydration says this person belongs. Null while it is still running, and
   * while it ended Unreachable — that outcome is a screen here, not a route.
   */
  const targetHref: Href | null =
    state.status === "signed-in"
      ? ROLE_HREF[state.user.role]
      : state.status === "hydrating" || state.status === "unreachable"
        ? null
        : "/(auth)/sign-in";

  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, MINIMUM_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!animationReady) return;
    const timer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, MINIMUM_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [animationReady]);

  const isFinishing = Boolean(minTimeElapsed && targetHref);

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
  if (state.status === "unreachable" && animationReady) {
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
