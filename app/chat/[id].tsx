import { useEffect, useMemo, useState } from "react";
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
import { getConversation } from "@/lib/conversation-api";
import { useConversationInbox } from "@/lib/conversation-inbox";
import { failureNotice } from "@/lib/conversation-failure";
import { useThreadOnScreen } from "@/lib/in-app-banner";
import { findOffersConversation } from "@/lib/conversation-list";
import { isOutgoing } from "@/lib/thread-state";
import { messagesHref, ROLE_HREF } from "@/lib/hub-routes";
import { canViewConversation } from "@/lib/rbac";
import {
  useConversationRoom,
  useRealtimeEvents,
  type RealtimeEvent,
} from "@/lib/realtime-context";
import { getSession, getSessionUser } from "@/lib/session";
import { useConversationAssignment } from "@/lib/use-conversation-assignment";
import { useSupportAssignment } from "@/lib/use-support-assignment";
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
 * The reference a Reply on a Post (#77) seeded the composer with, read once on
 * arrival. A param rather than anything on the conversation itself — it
 * belongs to this one visit, and a route param is naturally gone on the next.
 */
function useInitialDraft(): string | undefined {
  const draft = useLocalSearchParams<{ draft?: string }>().draft;
  return typeof draft === "string" && draft !== "" ? draft : undefined;
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
  const initialDraft = useInitialDraft();

  if (!id) return <Redirect href={ROLE_HREF[role]} />;

  return <ConversationScreen routeId={id} role={role} initialDraft={initialDraft} />;
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
function ConversationScreen({
  routeId,
  role,
  initialDraft,
}: {
  routeId: string;
  role: UserRole;
  initialDraft?: string;
}) {
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
    canViewConversation(user, conversation);

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
   * The row the API answers with goes straight into the shared list, and it
   * carries this viewer's `access` (see `lib/conversation-access`), so the
   * composer replaces the button without a refetch, and the pool screen behind loses the row in
   * the same update. Every other staff session learns the same thing from the
   * `conversation.updated` the API broadcasts.
   *
   * That is true of the re-read each action makes before it fires as well as of
   * the action itself, which is how a thread somebody else claimed leaves the
   * pool on the tap that lost the race.
   */
  const { addConversation } = inbox;

  /**
   * A conversation this device has never held.
   *
   * The list is where every row comes from, and it is enough for every way a
   * thread is normally opened: they are all taps on a row that is already in it.
   * A tapped Push notification is the one that is not — the thread it names can
   * be a conversation this phone has never seen, and on a launch whose own list
   * fetch failed or was abandoned it can be one this phone was not told about.
   * So the row is asked for on its own, once, and put in the list where the
   * screen already reads it from.
   *
   * The Offers alias is excluded because it is not an id: it resolves against
   * the list or it does not exist, and asking the API for `offers` would be a
   * request that can only 404.
   *
   * A refusal ends it. `tried` is what stops the ask repeating, and it is the
   * id rather than a flag so that moving between two threads this device does
   * not hold asks once for each. Until then the launch screen stays up, because
   * *not found* and *not asked yet* are different things and only one of them is
   * worth telling somebody about.
   *
   * The other way a row goes missing — deleted out from under somebody reading
   * it — comes through here too, and costs one request that answers 404 and a
   * moment of the launch screen before the same notice as before. Left that way
   * rather than told apart: asking the server about a row this client removed on
   * a socket event is the more honest of the two, and a screen that has to
   * remember what it used to hold to decide is a worse trade than one request.
   */
  const missing =
    inbox.status === "ready" && conversation === null && routeId !== OFFERS_ALIAS;
  const [tried, setTried] = useState<string | null>(null);
  const resolving = missing && tried !== routeId;

  useEffect(() => {
    if (!missing || tried === routeId) return;

    let live = true;
    void (async () => {
      const fresh = await getConversation(routeId);
      if (!live) return;
      if (fresh.ok) addConversation(fresh.value);
      else setTried(routeId);
    })();

    return () => {
      live = false;
    };
  }, [missing, tried, routeId, addConversation]);

  const assignment = useConversationAssignment(
    openedId,
    user?.id ?? null,
    addConversation,
  );
  const supportAssignment = useSupportAssignment();

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

  /**
   * And says so, so that a Message already arriving as a bubble does not also
   * arrive as a strip over the top of it. This screen is the only thing that
   * knows which thread is open — the route id is not always the conversation id,
   * since the Offers alias resolves against the list — which is the same reason
   * the read above lives here. See `lib/in-app-banner`.
   */
  useThreadOnScreen(openedId);

  if (inbox.status === "loading" || resolving) return <AppLoadingScreen />;
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
      viewer={{
        id: user.id,
        name: user.name,
        role: user.role,
        capabilities: user.capabilities,
      }}
      supportAssignment={supportAssignment}
      initialDraft={initialDraft}
      organizationNames={inbox.organizationNames}
      loading={thread.loading}
      failure={thread.failure}
      onRetry={thread.retry}
      onDismissFailure={thread.dismissFailure}
      onLoadOlder={thread.loadOlder}
      loadingOlder={thread.loadingOlder}
      hasOlder={thread.hasOlder}
      refreshing={thread.refreshing}
      onRefresh={thread.refresh}
      onSendMessage={thread.send}
      delivery={thread.delivery}
      onRetrySend={thread.retrySend}
      sendError={thread.sendError}
      onDismissSendError={thread.dismissSendError}
      onToggleReaction={thread.react}
      onEditMessage={thread.edit}
      onAssign={assignment.assign}
      assigning={assignment.assigning}
      assignError={assignment.error}
    />
  );
}
