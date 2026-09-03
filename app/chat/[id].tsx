import { useMemo } from "react";
import { View } from "react-native";
import {
  Redirect,
  useGlobalSearchParams,
  useLocalSearchParams,
  usePathname,
  useSegments,
} from "expo-router";

import { ThreadScreen } from "@/components/chat/thread-screen";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import { Text } from "@/components/ui/text";
import { chatIdFromRoute, chatIdFromSegments } from "@/lib/chat-route-id";
import { failureNotice } from "@/lib/conversation-failure";
import { findOffersConversation } from "@/lib/conversation-state";
import { getDevUser } from "@/lib/dev-user";
import { ROLE_HREF } from "@/lib/hub-routes";
import { CONVERSATIONS, MESSAGES } from "@/lib/mock-data";
import { canViewConversation } from "@/lib/rbac";
import { getSession, getSessionUser } from "@/lib/session";
import { useCustomerInbox } from "@/lib/use-customer-inbox";
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

  const thread = useThreadMessages(allowed ? conversation : null, "customer");

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
      messages={thread.state.messages}
      viewer={{ id: user.id, name: user.name, role: "customer" }}
      organizationNames={inbox.organizationNames}
      onLoadOlder={thread.loadOlder}
      loadingOlder={thread.loadingOlder}
      refreshing={thread.refreshing}
      onRefresh={thread.refresh}
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
