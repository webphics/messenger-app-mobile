import { router, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import { ROLE_HREF } from "@/lib/hub-routes";
import { hydrateSession, isLoggedIn } from "@/lib/session";

const MINIMUM_DISPLAY_MS = 2000;

export default function Index() {
  const [targetHref, setTargetHref] = useState<Href | null>(null);
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

  const isFinishing = Boolean(minTimeElapsed && targetHref);

  const handleFinish = () => {
    if (targetHref && !navigatedRef.current) {
      navigatedRef.current = true;
      router.replace(targetHref);
    }
  };

  return (
    <View className="flex-1 bg-bg">
      <AppLoadingScreen isFinishing={isFinishing} onFinish={handleFinish} />
    </View>
  );
}

