import { Stack } from "expo-router";

import { stackChrome } from "@/lib/tokens";

export default function ContactLayout() {
  return (
    <Stack screenOptions={stackChrome}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="messages" options={{ title: "Messages" }} />
      <Stack.Screen name="help" options={{ title: "Help" }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
    </Stack>
  );
}
