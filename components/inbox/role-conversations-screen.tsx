import { InboxScreen } from "@/components/inbox/inbox-screen";
import { useConversationInbox } from "@/lib/conversation-inbox";
import { failureNotice } from "@/lib/conversation-failure";
import { getSessionUser } from "@/lib/session";

type RoleConversationsScreenProps = {
  /** Off for the Unassigned pool, which is a queue rather than a place to start one. */
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
 * Every role starts conversations from here, because every role has somebody
 * to start one with: `GET /conversations/contacts` answers a Customer with the
 * organizations they belong to, an Agent with their Customers and colleagues,
 * and an Admin with the directory. A Customer had no way to open a second
 * organization's support thread until this was true — the one created for them
 * on a first visit is the first organization's and nothing offered the rest.
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
      showCompose={showCompose}
      viewerId={user?.id}
      savedInboxesFor={user?.role ?? null}
      title="Messages"
    />
  );
}
