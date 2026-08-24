import { router, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import { ROLE_HREF } from "@/lib/hub-routes";
import { hydrateSession, isLoggedIn } from "@/lib/session";

/**
 * How long the launch animation stays up *after it is actually on screen*.
 * Timing this from mount instead would spend most of the window decoding a
 * 4 MB WebP and fade the animation out just as it started playing.
 */
const MINIMUM_DISPLAY_MS = 2000;

export default function Index() {
  const [targetHref, setTargetHref] = useState<Href | null>(null);
  const [animationReady, setAnimationReady] = useState(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const navigatedRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, MINIMUM_DISPLAY_MS);

    void hydrateSession()
      .then((blob) => {
        setTargetHref(isLoggedIn(blob) ? ROLE_HREF[blob.role] : "/(auth)/sign-in");
      })
      .catch(() => {
        setTargetHref("/(auth)/sign-in");
      });

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

