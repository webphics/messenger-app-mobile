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
import { useConversationInbox } from "@/lib/conversation-inbox";
import { failureNotice } from "@/lib/conversation-failure";
import { findOffersConversation, isOutgoing } from "@/lib/conversation-state";
import { messagesHref, ROLE_HREF } from "@/lib/hub-routes";
import { canViewConversation } from "@/lib/rbac";
import {
  useConversationRoom,
  useRealtimeEvents,
  type RealtimeEvent,
} from "@/lib/realtime-context";
import { getSession, getSessionUser } from "@/lib/session";
import { useConversationAssignment } from "@/lib/use-conversation-assignment";
import { useThreadMessages } from "@/lib/use-thread-messages";
import type { Conversation, UserRole } from "@/lib/types";

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
 * One conversation, for whoever is reading it.
 *
 * Every role's thread is the same real thread now: the rows come from the one
 * list `ConversationInboxProvider` holds, the history and the sends go through
 * `useThreadMessages`, and what differs between a Customer and an Agent is what
 * the API put in the payload — a `sender` on every staff message, and the
 * assignment notices a Customer never receives.
 */
export default function ChatScreen() {
  const id = useRouteId();
  const role = getSession().role;

  if (!id) return <Redirect href={ROLE_HREF[role]} />;

  return <ConversationScreen routeId={id} role={role} />;
}

/**
 * Why a thread is not here, and the way out of it.
 *
 * The way out matters more than it used to: a conversation can now be deleted
 * out from under someone who is reading it, which swaps the thread for this
 * without their doing anything. The header went with the thread, so without a
 * control here the screen is a dead end with nothing on it.
 */
function ChatNotice({
  title,
  hint,
  home,
}: {
  title: string;
  hint: string;
  home: UserRole;
}) {
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
        onPress={() => router.replace(messagesHref(home))}
      >
        <Text>Back to Messages</Text>
      </Button>
    </View>
  );
}

/**
 * The thread itself, once a role is known.
 *
 * Written once for all three, because the differences that used to justify two
 * components are in the payload rather than in the screen: the role decides
 * which shape the API sends and which messages it withholds, and everything
 * from there — paging, sending, reading — is the same code.
 */
function ConversationScreen({ routeId, role }: { routeId: string; role: UserRole }) {
  const inbox = useConversationInbox();
  const user = getSessionUser();

  const conversation = useMemo<Conversation | null>(() => {
    const rows = inbox.status === "ready" ? inbox.conversations : [];
    if (routeId === OFFERS_ALIAS) return findOffersConversation(rows) ?? null;
    return rows.find((row) => row.id === routeId) ?? null;
  }, [inbox, routeId]);

  const allowed =
    conversation !== null &&
    user !== null &&
    canViewConversation(role, user.id, conversation);

  const author = useMemo(
    () => (user ? { id: user.id, name: user.name, role: user.role } : null),
    [user],
  );

  /** The conversation on screen, or null when there is none this person may open. */
  const openedId = allowed ? conversation.id : null;

  const thread = useThreadMessages(allowed ? conversation : null, role, author);

  /**
   * Engaging a thread, and taking one over.
   *
   * The row the API answers with goes straight into the shared list, which is
   * where `composerAccess` reads the assignment from — so the composer replaces
   * the button without a refetch, and the pool screen behind loses the row in
   * the same update. Every other staff session learns the same thing from the
   * `conversation.updated` the API broadcasts.
   */
  const { addConversation } = inbox;
  const assignment = useConversationAssignment(openedId, addConversation);

  /**
   * Opening a thread reads it.
   *
   * Keyed on the id rather than on the row, so the clear this causes — which
   * replaces the row in the list every screen shares — does not ask for a second
   * one. `markRead` is stable, and only a conversation this person may open is
   * ever named.
   */
  const { markRead } = inbox;
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
    return <ChatNotice title={notice.title} hint={notice.hint} home={role} />;
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
        home={role}
      />
    );
  }
  if (!allowed) return <Redirect href={ROLE_HREF[role]} />;

  return (
    <ThreadScreen
      conversation={conversation}
      messages={thread.messages}
      viewer={{ id: user.id, name: user.name, role: user.role }}
      organizationNames={inbox.organizationNames}
      onLoadOlder={thread.loadOlder}
      loadingOlder={thread.loadingOlder}
      refreshing={thread.refreshing}
      onRefresh={thread.refresh}
      onSendMessage={thread.send}
      delivery={thread.delivery}
      onRetrySend={thread.retrySend}
      sendError={thread.sendError}
      onDismissSendError={thread.dismissSendError}
      onAssign={assignment.assign}
      assigning={assignment.assigning}
      assignError={assignment.error}
    />
  );
}
