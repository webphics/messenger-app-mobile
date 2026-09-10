import { Stack } from "expo-router";

import { useStackChrome } from "@/lib/use-stack-chrome";

export default function CustomerHomeLayout() {
  const chrome = useStackChrome();

  return (
    <Stack screenOptions={chrome}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="faq" options={{ title: "FAQ" }} />
      <Stack.Screen name="search" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
    </Stack>
  );
}
