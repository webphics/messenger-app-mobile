import { Stack } from "expo-router";

import { stackChrome } from "@/lib/tokens";

export default function CustomerHomeLayout() {
  return (
    <Stack screenOptions={stackChrome}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="faq" options={{ title: "FAQ" }} />
      <Stack.Screen name="search" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
    </Stack>
  );
}
