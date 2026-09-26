import { Stack } from "expo-router";

import { useStackChrome } from "@/lib/use-stack-chrome";

export default function AdminHomeLayout() {
  const chrome = useStackChrome();

  return (
    <Stack screenOptions={chrome}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
      <Stack.Screen name="organizations" options={{ title: "Organizations" }} />
      <Stack.Screen name="organization/[id]" options={{ title: "Members" }} />
      <Stack.Screen name="users" options={{ title: "Accounts" }} />
      <Stack.Screen name="labels" options={{ title: "Labels" }} />
      <Stack.Screen name="saved-responses" options={{ title: "Saved responses" }} />
      {/* FAQ and Knowledge are hidden for now. These lines only set a
          screen's title; the route files stay where they are, so uncommenting
          is the whole of putting them back. */}
      {/* <Stack.Screen name="faq" options={{ title: "FAQ" }} /> */}
      {/* <Stack.Screen name="faq-add" options={{ title: "Add FAQ" }} /> */}
      {/* <Stack.Screen name="knowledge-add" options={{ title: "Add knowledge" }} /> */}
      <Stack.Screen name="offer-add" options={{ title: "Add offer" }} />
      {/* <Stack.Screen name="knowledge" options={{ title: "Knowledge" }} /> */}
      {/* <Stack.Screen name="article/[id]" options={{ title: "Article" }} /> */}
      <Stack.Screen name="chart/[id]" options={{ title: "Chart" }} />
    </Stack>
  );
}
