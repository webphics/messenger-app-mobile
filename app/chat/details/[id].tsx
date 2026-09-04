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
import { ROLE_HREF } from "@/lib/hub-routes";
import { canLabel, canReadNotes } from "@/lib/conversation-details";
import { galleryContents } from "@/lib/media-gallery";
import { canViewConversation } from "@/lib/rbac";
import { getSession, getSessionUser } from "@/lib/session";
import { useConversationDetails } from "@/lib/use-conversation-details";
import { useThreadMessages } from "@/lib/use-thread-messages";
import type { Conversation } from "@/lib/types";

/**
 * What a conversation is, beside what was said in it.
 *
 * Reached from the thread's own header, and holding the same permission the
 * thread does: this is a second view of a conversation this person may already
 * open, so it asks `canViewConversation` the same question and sends anyone else
 * home.
 *
 * It reads the thread's pages too, for one reason only: the Shared in chat row
 * counts what the history holds. That count is worth the request — a row that
 * says nothing about what is behind it is a row nobody taps.
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
  const inbox = useConversationInbox();
  const user = getSessionUser();
  const role = getSession().role;

  const conversation = useMemo<Conversation | null>(() => {
    const rows = inbox.status === "ready" ? inbox.conversations : [];
    return rows.find((row) => row.id === conversationId) ?? null;
  }, [inbox, conversationId]);

  const allowed =
    conversation !== null &&
    user !== null &&
    canViewConversation(role, user.id, conversation);

  const author = useMemo(
    () => (user ? { id: user.id, name: user.name, role: user.role } : null),
    [user],
  );

  const thread = useThreadMessages(allowed ? conversation : null, role, author);

  /**
   * A label change answers with the whole conversation, and it goes straight
   * into the shared list — so the chip appears here and the inbox row behind
   * gains it in the same update, without either screen refetching.
   */
  const { addConversation } = inbox;
  const details = useConversationDetails({
    conversationId: allowed ? conversationId : null,
    wantsLabels: allowed ? canLabel(conversation, role) : false,
    wantsNotes: allowed ? canReadNotes(conversation, role) : false,
    onUpdated: addConversation,
  });

  const sharedCount = useMemo(() => {
    const contents = galleryContents(thread.messages);
    return (
      contents.media.length +
      contents.docs.length +
      contents.voice.length +
      contents.links.length
    );
  }, [thread.messages]);

  if (inbox.status === "loading") return <AppLoadingScreen />;
  // The thread this was opened from is still underneath saying why the list
  // would not load; back is the way out, rather than a second copy of it.
  if (inbox.status === "failed") return <Redirect href={ROLE_HREF[role]} />;
  if (!allowed || !conversation) return <Redirect href={ROLE_HREF[role]} />;

  return (
    <ConversationDetailsScreen
      conversation={conversation}
      viewerRole={role}
      organizationNames={inbox.organizationNames}
      details={details}
      sharedCount={sharedCount}
    />
  );
}
