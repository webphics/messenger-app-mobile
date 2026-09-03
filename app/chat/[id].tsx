import { useEffect, useMemo } from "react";
import { View } from "react-native";
import {
  Redirect,
  router,
  useGlobalSearchParams,
  useLocalSearchParams,
  usePathname,
  useSegments,
} from "expo-router";

import { ThreadScreen } from "@/components/chat/thread-screen";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { chatIdFromRoute, chatIdFromSegments } from "@/lib/chat-route-id";
import { failureNotice } from "@/lib/conversation-failure";
import { findOffersConversation, isOutgoing } from "@/lib/conversation-state";
import { useCustomerInbox } from "@/lib/customer-inbox";
import { getDevUser } from "@/lib/dev-user";
import { CUSTOMER_HREF, ROLE_HREF } from "@/lib/hub-routes";
import { CONVERSATIONS, MESSAGES } from "@/lib/mock-data";
import { canViewConversation } from "@/lib/rbac";
import {
  useConversationRoom,
  useRealtimeEvents,
  type RealtimeEvent,
} from "@/lib/realtime-context";
import { getSession, getSessionUser } from "@/lib/session";
import { useThreadMessages } from "@/lib/use-thread-messages";
import type { Conversation, Message } from "@/lib/types";

/**
 * The route id the Offers carousel and the hub still push.
 *
 * Offers is a real group conversation created by an Admin, and its id is a UUID
 * nothing in this app can know in advance — so the fixed word stays as a route
 * alias and is resolved here against the conversations this person is in. See
 * `findOffersConversation`.
 */
const OFFERS_ALIAS = "offers";

function useRouteId(): string | undefined {
  const local = useLocalSearchParams<{ id?: string | string[] }>().id;
  const global = useGlobalSearchParams<{ id?: string | string[] }>().id;
  const pathname = usePathname();
  const segments = useSegments();

  return useMemo(() => {
    if (typeof local === "string" && local !== "[id]") return local;
    if (Array.isArray(local) && local[0] && local[0] !== "[id]") return local[0];
    return (
      chatIdFromRoute(local, pathname) ??
      chatIdFromRoute(global, pathname) ??
      chatIdFromSegments(segments)
    );
  }, [local, global, pathname, segments]);
}

/**
 * One conversation, in whichever half of the migration its role is standing.
 *
 * A Customer's thread is real as of #28; an Agent's and an Admin's are still the
 * local ones until #32. Both branches end at the same `ThreadScreen`.
 */
export default function ChatScreen() {
  const id = useRouteId();
  const role = getSession().role;

  if (!id) return <Redirect href={ROLE_HREF[role]} />;

  return role === "customer" ? (
    <CustomerChatScreen routeId={id} />
  ) : (
    <StaffChatScreen routeId={id} />
  );
}

/**
 * Why a thread is not here, and the way out of it.
 *
 * The way out matters more than it used to: a conversation can now be deleted
 * out from under someone who is reading it, which swaps the thread for this
 * without their doing anything. The header went with the thread, so without a
 * control here the screen is a dead end with nothing on it.
 */
function ChatNotice({ title, hint }: { title: string; hint: string }) {
  return (
    <View
      accessibilityLiveRegion="polite"
      className="flex-1 items-center justify-center gap-1 bg-bg px-8"
    >
      <Text variant="title" className="text-ink">
        {title}
      </Text>
      <Text variant="meta" className="text-center text-muted">
        {hint}
      </Text>
      <Button
        variant="outline"
        className="mt-4"
        onPress={() => router.replace(CUSTOMER_HREF.messages)}
      >
        <Text>Back to Messages</Text>
      </Button>
    </View>
  );
}

function CustomerChatScreen({ routeId }: { routeId: string }) {
  const inbox = useCustomerInbox();
  const user = getSessionUser();

  const conversation = useMemo<Conversation | null>(() => {
    const rows = inbox.status === "ready" ? inbox.conversations : [];
    if (routeId === OFFERS_ALIAS) return findOffersConversation(rows) ?? null;
    return rows.find((row) => row.id === routeId) ?? null;
  }, [inbox, routeId]);

  const allowed =
    conversation !== null &&
    user !== null &&
    canViewConversation("customer", user.id, conversation);

  const author = useMemo(
    () =>
      user ? ({ id: user.id, name: user.name, role: "customer" } as const) : null,
    [user],
  );

  const thread = useThreadMessages(
    allowed ? conversation : null,
    "customer",
    author,
  );

  /**
   * Opening a thread reads it.
   *
   * Keyed on the id rather than on the row, so the clear this causes — which
   * replaces the row in the list every screen shares — does not ask for a second
   * one. `markRead` is stable, and only a conversation this person may open is
   * ever named.
   */
  const { markRead } = inbox;
  const openedId = allowed ? conversation.id : null;
  useEffect(() => {
    if (openedId) markRead(openedId);
  }, [openedId, markRead]);

  /**
   * And so does a message that arrives while it is open.
   *
   * The list is shared, so without this the row behind the thread would collect
   * a badge for a message the person is looking at, and it would still be there
   * when they went back. This screen is the only thing that knows a thread is
   * open, which is why the rule lives here rather than in the inbox.
   *
   * Their own message is not one of those. It arrives here too — the sender is
   * in the conversation like everyone else — and reading what you just wrote is
   * not a thing to tell the server about.
   */
  useRealtimeEvents((event: RealtimeEvent) => {
    if (event.kind !== "message" || !openedId || !user) return;
    if (event.conversationId !== openedId) return;
    if (isOutgoing(event.message, user.id)) return;
    markRead(openedId);
  });

  // Puts this device in the conversation's room for as long as the thread is up.
  useConversationRoom(openedId);

  if (inbox.status === "loading") return <AppLoadingScreen />;
  if (inbox.status === "failed") {
    const notice = failureNotice(inbox.failure);
    return <ChatNotice title={notice.title} hint={notice.hint} />;
  }
  if (!conversation || !user) {
    return (
      <ChatNotice
        title={routeId === OFFERS_ALIAS ? "No Offers chat yet" : "Conversation unavailable"}
        hint={
          routeId === OFFERS_ALIAS
            ? "Offers announcements will appear here once the group is set up."
            : "It may have been removed, or it is not yours to open."
        }
      />
    );
  }
  if (!allowed) return <Redirect href={ROLE_HREF.customer} />;

  return (
    <ThreadScreen
      conversation={conversation}
      messages={thread.messages}
      viewer={{ id: user.id, name: user.name, role: "customer" }}
      organizationNames={inbox.organizationNames}
      onLoadOlder={thread.loadOlder}
      loadingOlder={thread.loadingOlder}
      refreshing={thread.refreshing}
      onRefresh={thread.refresh}
      onSendMessage={thread.send}
      delivery={thread.delivery}
      onRetrySend={thread.retrySend}
    />
  );
}

/** Agent and Admin, still on local data until #32. */
function StaffChatScreen({ routeId }: { routeId: string }) {
  const me = getDevUser();
  // Not memoised: a handful of rows in a module constant, and the React compiler
  // cannot preserve a memo whose value it does not control.
  const conversation = CONVERSATIONS.find((row) => row.id === routeId);
  const messages: Message[] = conversation ? (MESSAGES[conversation.id] ?? []) : [];

  if (!conversation || !canViewConversation(me.role, me.id, conversation)) {
    return <Redirect href={ROLE_HREF[me.role]} />;
  }

  return (
    <ThreadScreen
      conversation={conversation}
      messages={messages}
      viewer={{ id: me.id, name: me.displayName, role: me.role }}
    />
  );
}
