import { useMemo } from "react";

import { InboxScreen } from "@/components/inbox/inbox-screen";
import { getDevUserId } from "@/lib/dev-user";
import { listInboxConversations } from "@/lib/inbox-filter";
import { CONVERSATIONS } from "@/lib/mock-data";
import { getSession } from "@/lib/session";

type RoleConversationsScreenProps = {
  /** Agents read the shared queue but do not start threads from it. */
  showCompose?: boolean;
};

/**
 * The signed-in user's own inbox. `listInboxConversations` already scopes rows
 * by role, so every role route renders this same screen.
 */
export function RoleConversationsScreen({
  showCompose = true,
}: RoleConversationsScreenProps) {
  const role = getSession().role;
  const selfId = getDevUserId();

  const conversations = useMemo(
    () => listInboxConversations(role, selfId, CONVERSATIONS),
    [role, selfId],
  );

  return (
    <InboxScreen
      conversations={conversations}
      showChips
      showCompose={showCompose}
      title="Messages"
    />
  );
}
