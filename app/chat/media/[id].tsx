import { useMemo } from "react";
import { Redirect, useGlobalSearchParams, useLocalSearchParams, usePathname } from "expo-router";

import { MediaGalleryScreen } from "@/components/chat/media-gallery-screen";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import { chatMediaIdFromRoute } from "@/lib/chat-route-id";
import { useConversationInbox } from "@/lib/conversation-inbox";
import { ROLE_HREF } from "@/lib/hub-routes";
import { canViewConversation } from "@/lib/rbac";
import { getSession, getSessionUser } from "@/lib/session";
import { useThreadMessages } from "@/lib/use-thread-messages";
import type { Conversation } from "@/lib/types";

/**
 * Every attachment one conversation has carried.
 *
 * Reached from the thread's own header, and holding the same permission as the
 * thread does: a gallery is a second view of messages this person may already
 * read, so it asks `canViewConversation` the same question and sends anyone else
 * home rather than showing them a grid of somebody else's photos.
 *
 * It reads its own pages through `useThreadMessages`. The thread it was pushed
 * from is still mounted underneath, still in the conversation's socket room, so
 * an attachment that arrives while the gallery is open appears in it.
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

  if (inbox.status === "loading") return <AppLoadingScreen />;
  // A gallery has nothing of its own to say about a list that would not load, and
  // the thread it was opened from is still underneath saying it: back is the way
  // out, rather than a second copy of the same failure.
  if (inbox.status === "failed") return <Redirect href={ROLE_HREF[role]} />;
  if (!allowed || !conversation) return <Redirect href={ROLE_HREF[role]} />;

  return (
    <MediaGalleryScreen
      conversation={conversation}
      messages={thread.messages}
      organizationNames={inbox.organizationNames}
      loading={thread.loading}
      onLoadOlder={thread.loadOlder}
      loadingOlder={thread.loadingOlder}
      refreshing={thread.refreshing}
      onRefresh={thread.refresh}
    />
  );
}
