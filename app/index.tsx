import { Redirect, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { ROLE_HREF } from "@/lib/hub-routes";
import { hydrateSession, isLoggedIn } from "@/lib/session";

export default function Index() {
  const [href, setHref] = useState<Href | null>(null);

  useEffect(() => {
    void hydrateSession()
      .then((blob) => {
        setHref(isLoggedIn(blob) ? ROLE_HREF[blob.role] : "/(auth)/sign-in");
      })
      .catch(() => {
        setHref("/(auth)/sign-in");
      });
  }, []);

  if (!href) return <View className="flex-1 bg-bg" />;
  return <Redirect href={href} />;
}
