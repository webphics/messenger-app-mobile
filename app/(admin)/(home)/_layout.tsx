import { Stack } from "expo-router";

import { stackChrome } from "@/lib/tokens";

export default function AdminHomeLayout() {
  return (
    <Stack screenOptions={stackChrome}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
      <Stack.Screen name="faq" options={{ title: "FAQ" }} />
      <Stack.Screen name="faq-add" options={{ title: "Add FAQ" }} />
      <Stack.Screen name="knowledge-add" options={{ title: "Add knowledge" }} />
      <Stack.Screen name="offer-add" options={{ title: "Add offer" }} />
      <Stack.Screen name="knowledge" options={{ title: "Knowledge" }} />
      <Stack.Screen name="article/[id]" options={{ title: "Article" }} />
      <Stack.Screen name="chart/[id]" options={{ title: "Chart" }} />
    </Stack>
  );
}
