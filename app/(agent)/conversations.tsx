import { useMemo } from "react";

import { InboxScreen } from "@/components/inbox/inbox-screen";
import { getDevUserId } from "@/lib/dev-user";
import { listInboxConversations } from "@/lib/inbox-filter";
import { CONVERSATIONS } from "@/lib/mock-data";
import { getSession } from "@/lib/session";

export default function AgentConversationsScreen() {
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
      showCompose={false}
      title="Messages"
    />
  );
}
