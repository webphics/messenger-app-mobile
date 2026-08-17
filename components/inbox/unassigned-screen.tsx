import { InboxScreen } from "@/components/inbox/inbox-screen";
import { listUnassignedConversations } from "@/lib/inbox-filter";
import { CONVERSATIONS } from "@/lib/mock-data";

/** Shared pickup queue — identical for admin and agent. */
export function UnassignedScreen() {
  return (
    <InboxScreen
      conversations={listUnassignedConversations(CONVERSATIONS)}
      showChips={false}
      showCompose={false}
      title="Unassigned"
    />
  );
}
