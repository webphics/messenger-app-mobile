import { useMemo } from "react";

import { InboxScreen } from "@/components/inbox/inbox-screen";
import { useConversationInbox } from "@/lib/conversation-inbox";
import { failureNotice } from "@/lib/conversation-failure";
import { listUnassignedConversations } from "@/lib/inbox-filter";

/**
 * The shared pickup queue — identical for Admin and Agent.
 *
 * Read out of the one list both roles already hold rather than fetched again:
 * the API sends the unassigned support threads alongside the engaged ones, and
 * `?type=support_dm` would only narrow by type, not by status. So the pool is a
 * filter over the list, which also means a thread engaged from another device
 * leaves this screen the moment the row that says so arrives.
 */
export function UnassignedScreen() {
  const inbox = useConversationInbox();
  const conversations = inbox.status === "ready" ? inbox.conversations : null;
  const pool = useMemo(
    () => (conversations ? listUnassignedConversations(conversations) : []),
    [conversations],
  );

  return (
    <InboxScreen
      conversations={pool}
      loading={inbox.status === "loading"}
      error={inbox.status === "failed" ? failureNotice(inbox.failure) : null}
      refreshing={inbox.refreshing}
      onRefresh={inbox.reload}
      showChips={false}
      showCompose={false}
      title="Unassigned"
    />
  );
}
