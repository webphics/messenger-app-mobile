import { useMemo } from "react";
import {
  Redirect,
  useGlobalSearchParams,
  useLocalSearchParams,
  usePathname,
} from "expo-router";

import { MessageInfoScreen } from "@/components/chat/message-info-screen";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import { chatMessageInfoIdFromRoute } from "@/lib/chat-route-id";
import { ROLE_HREF } from "@/lib/hub-routes";
import { getSession } from "@/lib/session";
import { useChatSectionConversation } from "@/lib/use-chat-section-conversation";
import { useMessageReceipts } from "@/lib/use-message-receipts";
import { useThreadMessages } from "@/lib/use-thread-messages";

/**
 * Who has read one message, and when.
 *
 * The third screen hanging off a thread, and it asks permission the way the
 * other two do — `useChatSectionConversation`, so a thread this person has lost
 * access to takes its message info with it rather than answering separately.
 *
 * The message it is about travels as a param. Which messages exist is still the
 * thread's question, so this reads them through `useThreadMessages` exactly as
 * the gallery does, and finds the one it was sent for; a message further back
 * than the loaded pages resolves to nothing and the screen draws the receipts
 * without a quote of it, which is the honest answer rather than a blank.
 */
export default function ChatMessageInfoScreen() {
  const local = useLocalSearchParams<{ id?: string | string[]; messageId?: string | string[] }>();
  const global = useGlobalSearchParams<{ id?: string | string[]; messageId?: string | string[] }>();
  const pathname = usePathname();
  const role = getSession().role;

  const id = useMemo(
    () =>
      chatMessageInfoIdFromRoute(local.id, pathname) ??
      chatMessageInfoIdFromRoute(global.id, pathname),
    [local.id, global.id, pathname],
  );

  const messageId = useMemo(() => {
    const raw = local.messageId ?? global.messageId;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [local.messageId, global.messageId]);

  if (!id || !messageId) return <Redirect href={ROLE_HREF[role]} />;

  return <InfoScreen conversationId={id} messageId={messageId} />;
}

function InfoScreen({
  conversationId,
  messageId,
}: {
  conversationId: string;
  messageId: string;
}) {
  const section = useChatSectionConversation(conversationId);
  const ready = section.status === "ready";

  const thread = useThreadMessages(
    ready ? section.conversation : null,
    ready ? section.viewerRole : "customer",
    ready ? section.author : null,
  );

  const { state, reload } = useMessageReceipts(
    ready ? conversationId : null,
    ready ? messageId : null,
  );

  const message = useMemo(
    () => thread.messages.find((item) => item.id === messageId) ?? null,
    [thread.messages, messageId],
  );

  if (section.status === "loading") return <AppLoadingScreen />;
  if (section.status === "denied") return <Redirect href={ROLE_HREF[section.home]} />;

  return <MessageInfoScreen message={message} state={state} reload={reload} />;
}
