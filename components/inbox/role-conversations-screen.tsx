import { useMemo } from "react";

import { InboxScreen } from "@/components/inbox/inbox-screen";
import { failureNotice } from "@/lib/conversation-failure";
import { getDevUserId } from "@/lib/dev-user";
import { listInboxConversations } from "@/lib/inbox-filter";
import { CONVERSATIONS } from "@/lib/mock-data";
import { getSession } from "@/lib/session";
import { useCustomerInbox } from "@/lib/use-customer-inbox";

type RoleConversationsScreenProps = {
  /** Agents read the shared queue but do not start threads from it. */
  showCompose?: boolean;
};

/**
 * The signed-in person's own inbox.
 *
 * Split by role rather than by screen, because the two halves are at different
 * stages of the same migration: a Customer's conversations are real as of #28,
 * and an Agent's and an Admin's follow in #32. The staff branch is the screen
 * exactly as it was; when it moves, this component loses the branch rather than
 * gaining a third.
 */
export function RoleConversationsScreen({
  showCompose = true,
}: RoleConversationsScreenProps) {
  const role = getSession().role;

  return role === "customer" ? (
    <CustomerConversationsScreen />
  ) : (
    <StaffConversationsScreen showCompose={showCompose} />
  );
}

function CustomerConversationsScreen() {
  const inbox = useCustomerInbox();

  return (
    <InboxScreen
      conversations={inbox.status === "ready" ? inbox.conversations : []}
      organizationNames={
        inbox.status === "ready" ? inbox.organizationNames : undefined
      }
      loading={inbox.status === "loading"}
      error={inbox.status === "failed" ? failureNotice(inbox.failure) : null}
      refreshing={inbox.refreshing}
      onRefresh={inbox.reload}
      /*
       * No Open/Resolved chips: a Customer's payload carries no status to filter
       * on — closing a thread is a staff action and the field is staff-facing —
       * so the chips would offer a filter that could only ever answer with
       * everything or with nothing.
       */
      showChips={false}
      showCompose={false}
      title="Messages"
    />
  );
}

function StaffConversationsScreen({ showCompose }: { showCompose: boolean }) {
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
