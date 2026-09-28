import { Stack } from "expo-router";

import { mayEnter, SCREEN_ACCESS } from "@/lib/route-access";
import { useStackChrome } from "@/lib/use-stack-chrome";
import { useViewer } from "@/lib/use-viewer";

/**
 * The Admin Hub and the org-wide screens it opens.
 *
 * Every screen that needs a capability sits behind a `Protected` guard reading
 * `SCREEN_ACCESS`, the same table the Hub's rows are drawn from. A guarded
 * screen is not in the navigator at all, so a deep link to one lands on the
 * Hub — this stack's first screen — rather than on a screen whose every
 * request the API would refuse; and a capability revoked while the screen is
 * open takes it away the same way.
 */
export default function AdminHomeLayout() {
  const chrome = useStackChrome();
  const viewer = useViewer();

  return (
    <Stack screenOptions={chrome}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
      <Stack.Protected guard={mayEnter(viewer, SCREEN_ACCESS.organizations)}>
        <Stack.Screen name="organizations" options={{ title: "Organizations" }} />
      </Stack.Protected>
      <Stack.Protected guard={mayEnter(viewer, SCREEN_ACCESS["organization/[id]"])}>
        <Stack.Screen name="organization/[id]" options={{ title: "Members" }} />
      </Stack.Protected>
      <Stack.Protected guard={mayEnter(viewer, SCREEN_ACCESS.users)}>
        <Stack.Screen name="users" options={{ title: "Accounts" }} />
      </Stack.Protected>
      <Stack.Protected guard={mayEnter(viewer, SCREEN_ACCESS.labels)}>
        <Stack.Screen name="labels" options={{ title: "Labels" }} />
      </Stack.Protected>
      <Stack.Protected guard={mayEnter(viewer, SCREEN_ACCESS["saved-responses"])}>
        <Stack.Screen name="saved-responses" options={{ title: "Saved responses" }} />
      </Stack.Protected>
      <Stack.Protected guard={mayEnter(viewer, SCREEN_ACCESS.activity)}>
        <Stack.Screen name="activity" options={{ title: "Audit log" }} />
      </Stack.Protected>
      {/* FAQ and Knowledge are hidden for now. These lines only set a
          screen's title; the route files stay where they are, so uncommenting
          is the whole of putting them back. */}
      {/* <Stack.Screen name="faq" options={{ title: "FAQ" }} /> */}
      {/* <Stack.Screen name="faq-add" options={{ title: "Add FAQ" }} /> */}
      {/* <Stack.Screen name="knowledge-add" options={{ title: "Add knowledge" }} /> */}
      <Stack.Protected guard={mayEnter(viewer, SCREEN_ACCESS["offer-add"])}>
        <Stack.Screen name="offer-add" options={{ title: "Add offer" }} />
      </Stack.Protected>
      {/* <Stack.Screen name="knowledge" options={{ title: "Knowledge" }} /> */}
      {/* <Stack.Screen name="article/[id]" options={{ title: "Article" }} /> */}
      <Stack.Protected guard={mayEnter(viewer, SCREEN_ACCESS["chart/[id]"])}>
        <Stack.Screen name="chart/[id]" options={{ title: "Chart" }} />
      </Stack.Protected>
    </Stack>
  );
}
