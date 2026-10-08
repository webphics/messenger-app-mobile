import { useCallback, useMemo } from "react";
import { Alert } from "react-native";
import {
  Redirect,
  router,
  useGlobalSearchParams,
  useLocalSearchParams,
  usePathname,
} from "expo-router";

import { ConversationDetailsScreen } from "@/components/chat/conversation-details-screen";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import { can } from "@/lib/capabilities";
import { chatDetailsIdFromRoute, chatHref } from "@/lib/chat-route-id";
import { useConversationInbox } from "@/lib/conversation-inbox";
import { detailsView, threadActionsView } from "@/lib/conversation-access";
import { ROLE_HREF } from "@/lib/hub-routes";
import { placeableOnboardingCustomer } from "@/lib/onboarding-placement";
import { getSession, getSessionUser } from "@/lib/session";
import type { Conversation, Organization } from "@/lib/types";
import { useChatSectionConversation } from "@/lib/use-chat-section-conversation";
import { useConversationDetails } from "@/lib/use-conversation-details";
import { useOnboardingPlacement } from "@/lib/use-onboarding-placement";
import { useSupportAssignment } from "@/lib/use-support-assignment";
import { useThreadManagement } from "@/lib/use-thread-management";

/**
 * How long a refetch waits after the thread and this screen are popped. The refetch drops the
 * Onboarding thread's row, and the thread screen answers a missing row by replacing its message
 * list; done while it is still animating out, that crashed Fabric ("child already has a
 * parent"). `InteractionManager` does not help: the stack registers no interaction, so it runs
 * at once. Comfortably longer than the native stack's pop animation.
 */
const AFTER_POP_MS = 1000;

/**
 * Back to the hub under the thread, then the list refetched once the transition is over, for
 * the reason `AFTER_POP_MS` gives. `andThen` runs between the two, for a route pushed onto the
 * hub. The timer is deliberately not cleared on unmount: the pop it waits out is this screen
 * unmounting.
 */
function dismissToHubThenReload(reload: () => void, andThen?: () => void): void {
  router.dismissTo(ROLE_HREF[getSession().role]);
  andThen?.();
  setTimeout(reload, AFTER_POP_MS);
}

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
  const { addConversation, reload } = useConversationInbox();
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

  /**
   * Placing the Customer of an Onboarding thread, in the web client's flow: say who was added
   * where, then open the Customer's support conversation in that organization (asked which
   * when there were several), or go back to the conversation list.
   *
   * Every way out goes through `dismissTo` before the reload: the thread screen sits under
   * this one, and a thread screen whose row leaves the list asks the API for it again and puts
   * it back (`app/chat/[id].tsx`). Staff may still read the Onboarding thread, so that ask
   * succeeds, and the row the reload just dropped would return. Both screens have to go.
   */
  const viewer = getSessionUser();
  const placeable = placeableOnboardingCustomer(viewer, ready ? section.conversation : null);
  // Back to the hub, the route in the stack under the thread, with the list refetched after the
  // transition. Not the Chats tab, though the web lands on its inbox: switching to that tab
  // here, with or without a refetch beside it, crashed Fabric on the emulator every time
  // ("child already has a parent" in the list's clipping view). `dismissTo` on the tab's own
  // href also finds no such route in the stack and replaces this screen alone, leaving the
  // thread under it to put its row back.
  const leaveThread = useCallback(() => dismissToHubThenReload(reload), [reload]);
  const placement = useOnboardingPlacement(placeable, {
    canOpenChat: can(viewer, "message_customers"),
    onPlaced: useCallback(
      (placed: Organization[]) => {
        Alert.alert(
          `${placeable?.name ?? "Customer"} added to ${placed
            .map((organization) => organization.name)
            .join(", ")}`,
        );
      },
      [placeable?.name],
    ),
    onOpened: useCallback(
      (opened: Conversation) => {
        addConversation(opened);
        dismissToHubThenReload(reload, () => router.push(chatHref(opened.id)));
      },
      [addConversation, reload],
    ),
    onLeave: leaveThread,
  });

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
      placement={placeable ? { customer: placeable, placement } : undefined}
    />
  );
}
