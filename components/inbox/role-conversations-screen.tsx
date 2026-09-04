import { InboxScreen } from "@/components/inbox/inbox-screen";
import { useConversationInbox } from "@/lib/conversation-inbox";
import { failureNotice } from "@/lib/conversation-failure";
import { getSessionUser } from "@/lib/session";

type RoleConversationsScreenProps = {
  /** Agents read the shared queue but do not start threads from it. */
  showCompose?: boolean;
};

/**
 * The signed-in person's own inbox.
 *
 * One list for all three roles, because there is one list: the API scopes
 * `GET /conversations` by who is asking, so an Agent receives their assigned
 * threads, the unassigned pool, their staff DMs and their groups, an Admin
 * receives the org-wide set their policy grants, and a Customer receives their
 * own — and none of them needs a client-side filter to say so.
 *
 * What still differs by role is the chrome. Only staff get the chips: Mine is
 * the assigned list an Agent works from, and Open/Resolved filter on a status
 * only a staff payload carries — closing a thread is a staff action, and a
 * Customer's row has no `status` field at all, so those two would offer a
 * filter that could only answer with everything or with nothing.
 */
export function RoleConversationsScreen({
  showCompose = true,
}: RoleConversationsScreenProps) {
  const user = getSessionUser();
  const inbox = useConversationInbox();
  const isStaff = user !== null && user.role !== "customer";

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
      showChips={isStaff}
      showCompose={isStaff && showCompose}
      viewerId={user?.id}
      title="Messages"
    />
  );
}
