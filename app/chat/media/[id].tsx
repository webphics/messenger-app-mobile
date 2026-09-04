import { useMemo } from "react";
import {
  Redirect,
  useGlobalSearchParams,
  useLocalSearchParams,
  usePathname,
} from "expo-router";

import { MediaGalleryScreen } from "@/components/chat/media-gallery-screen";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import { chatMediaIdFromRoute } from "@/lib/chat-route-id";
import { ROLE_HREF } from "@/lib/hub-routes";
import { getSession } from "@/lib/session";
import { useChatSectionConversation } from "@/lib/use-chat-section-conversation";
import { useThreadMessages } from "@/lib/use-thread-messages";

/**
 * Every attachment and link one conversation has carried.
 *
 * Reached from Conversation details, and holding the same permission the thread
 * does — see `useChatSectionConversation`, which is where that question is asked
 * for both of the screens that hang off a thread.
 *
 * It reads its own pages through `useThreadMessages`. The thread it was pushed
 * from is still mounted underneath, still in the conversation's socket room, so
 * an attachment that arrives while this is open appears in it.
 */
export default function ChatMediaScreen() {
  const local = useLocalSearchParams<{ id?: string | string[] }>().id;
  const global = useGlobalSearchParams<{ id?: string | string[] }>().id;
  const pathname = usePathname();
  const role = getSession().role;

  const id = useMemo(
    () =>
      chatMediaIdFromRoute(local, pathname) ?? chatMediaIdFromRoute(global, pathname),
    [local, global, pathname],
  );

  if (!id) return <Redirect href={ROLE_HREF[role]} />;

  return <GalleryScreen conversationId={id} />;
}

function GalleryScreen({ conversationId }: { conversationId: string }) {
  const section = useChatSectionConversation(conversationId);
  const ready = section.status === "ready";

  const thread = useThreadMessages(
    ready ? section.conversation : null,
    ready ? section.viewerRole : "customer",
    ready ? section.author : null,
  );

  if (section.status === "loading") return <AppLoadingScreen />;
  if (section.status === "denied") return <Redirect href={ROLE_HREF[section.home]} />;

  return (
    <MediaGalleryScreen
      conversation={section.conversation}
      messages={thread.messages}
      organizationNames={section.organizationNames}
      loading={thread.loading}
      onLoadOlder={thread.loadOlder}
      loadingOlder={thread.loadingOlder}
      refreshing={thread.refreshing}
      onRefresh={thread.refresh}
    />
  );
}
