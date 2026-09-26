import { useMemo } from "react";
import {
  Redirect,
  useGlobalSearchParams,
  useLocalSearchParams,
  usePathname,
} from "expo-router";

import { ConversationDetailsScreen } from "@/components/chat/conversation-details-screen";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import { chatDetailsIdFromRoute } from "@/lib/chat-route-id";
import { useConversationInbox } from "@/lib/conversation-inbox";
import { detailsView, threadActionsView } from "@/lib/conversation-access";
import { ROLE_HREF } from "@/lib/hub-routes";
import { getSession } from "@/lib/session";
import { useChatSectionConversation } from "@/lib/use-chat-section-conversation";
import { useConversationDetails } from "@/lib/use-conversation-details";
import { useSupportAssignment } from "@/lib/use-support-assignment";
import { useThreadManagement } from "@/lib/use-thread-management";

/**
 * What a conversation is, beside what was said in it.
 *
 * Reached from the thread's own header, and holding the same permission the
 * thread does — see `useChatSectionConversation`.
 *
 * It fetches no messages. Shared in chat is a push away and reads its own pages;
 * counting them here to put a number on that row would mean the largest request
 * in the app on the way into a screen that mostly reads what the inbox already
 * holds, and the number would be a count of the loaded page rather than of the
 * conversation.
 */
export default function ChatDetailsScreen() {
  const local = useLocalSearchParams<{ id?: string | string[] }>().id;
  const global = useGlobalSearchParams<{ id?: string | string[] }>().id;
  const pathname = usePathname();
  const role = getSession().role;

  const id = useMemo(
    () =>
      chatDetailsIdFromRoute(local, pathname) ??
      chatDetailsIdFromRoute(global, pathname),
    [local, global, pathname],
  );

  if (!id) return <Redirect href={ROLE_HREF[role]} />;

  return <DetailsScreen conversationId={id} />;
}

function DetailsScreen({ conversationId }: { conversationId: string }) {
  const section = useChatSectionConversation(conversationId);
  const ready = section.status === "ready";

  /**
   * A label change answers with the whole conversation, and it goes straight
   * into the shared list — so the chip appears here and the inbox row behind
   * gains it in the same update, without either screen refetching.
   */
  const { addConversation } = useConversationInbox();
  /**
   * Labels and notes as the API offers them to this viewer, with the label
   * Capability this client cannot see already applied.
   */
  const offered = detailsView(ready ? section.conversation.access : undefined);
  const details = useConversationDetails({
    conversationId: ready ? conversationId : null,
    wantsLabels: offered.labels,
    wantsNotes: offered.readNotes,
    onUpdated: addConversation,
  });

  /**
   * Closing and transferring answer with the conversation too, so they go the
   * same way a label change does: into the shared list, where the pill above
   * and the inbox row behind both read it.
   */
  const management = useThreadManagement(
    ready ? conversationId : null,
    ready ? section.conversation : null,
    addConversation,
  );
  const supportAssignment = useSupportAssignment();
  /**
   * Transfer, Close and Reopen as the API offers them to this viewer, with
   * the Capabilities this client cannot see already applied.
   */
  const actions = threadActionsView(ready ? section.conversation.access : undefined);
  const manages = actions.transfer || actions.close || actions.reopen;

  if (section.status === "loading") return <AppLoadingScreen />;
  if (section.status === "denied") return <Redirect href={ROLE_HREF[section.home]} />;

  return (
    <ConversationDetailsScreen
      conversation={section.conversation}
      organizationNames={section.organizationNames}
      details={details}
      supportAssignment={supportAssignment}
      management={manages ? management : undefined}
      threadActions={actions}
      offered={offered}
    />
  );
}
