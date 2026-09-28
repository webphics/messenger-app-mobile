import { useRouter } from "expo-router";
import { useCallback } from "react";

import { ContactList } from "@/components/inbox/contact-list";
import { can } from "@/lib/capabilities";
import { chatHref } from "@/lib/chat-route-id";
import { useViewer } from "@/lib/use-viewer";
import { useContactDirectory } from "@/lib/use-contact-directory";

/**
 * The People tab: everyone this person can write to, standing rather than
 * only reachable from a compose button.
 *
 * The same directory the compose sheet reads, on a screen of its own, because
 * staff look people up for a reason other than starting a thread — to see who
 * is on the team, which Customers they hold threads with, and which of those
 * threads exist at all. A tap still does exactly what it does in the sheet:
 * opens the thread, or brings it into being.
 */
export function ContactsScreen() {
  const router = useRouter();
  const user = useViewer();

  const open = useCallback(
    (conversationId: string) => {
      router.push(chatHref(conversationId));
    },
    [router],
  );

  const view = useContactDirectory(user?.role ?? null, open, can(user, "staff_dm"));

  return (
    <ContactList
      view={view}
      searchPlaceholder="Search people by name or role…"
      pullToRefresh
    />
  );
}
