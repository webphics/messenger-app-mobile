import { useNavigation } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { CommunityTabList } from "@/components/communities/community-tab-list";
import { InboxScreen } from "@/components/inbox/inbox-screen";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { useConversationInbox } from "@/lib/conversation-inbox";
import { failureNotice } from "@/lib/conversation-failure";
import { inboxConversations } from "@/lib/conversation-scope";
import { getSessionUser } from "@/lib/session";
import { communitiesTabBadge, inboxTabBadge } from "@/lib/tab-badges";

type RoleConversationsScreenProps = {
  /** Off for the Unassigned pool, which is a queue rather than a place to start one. */
  showCompose?: boolean;
};

/** The two things the Conversation list can be showing. */
type ListTab = "chats" | "communities";

/**
 * The signed-in person's own inbox, and the Communities they belong to.
 *
 * One list for all three roles, because there is one list: the API scopes
 * `GET /conversations` by who is asking, so an Agent receives their assigned
 * threads, the unassigned pool, their staff DMs and their groups, an Admin
 * receives the org-wide set their policy grants, and a Customer receives their
 * own — and none of them needs a client-side filter to say so.
 *
 * Every role starts conversations from here, because every role has somebody
 * to start one with: `GET /conversations/contacts` answers a Customer with the
 * organizations they belong to, an Agent with their Customers and colleagues,
 * and an Admin with the directory.
 *
 * Communities sit beside Chats rather than on the Tab capsule, and that is the
 * whole shape of the feature: a Community is a place conversations live, so it
 * belongs where the conversations are. The tab is here for every role — a staff
 * member is in the same rooms their Customers are, and seeing what they see is
 * the point.
 *
 * ## What the two halves each hold
 *
 * Exactly what the tab above them says, and nothing of the other's. Chats used
 * to be the whole Conversation list — a Community's rooms included — so the same
 * thread was readable under both tabs and the count over Chats was counting
 * rooms it did not show. `inboxConversations` and `communityConversations` split
 * it on `communityId`, which is the field the API added for this, and the two
 * counts beside the labels are the same split: every unread thread is counted
 * under exactly one tab.
 *
 * What still differs by role is the chrome of the Chats half. Only staff get the
 * chips: Mine is the assigned list an Agent works from, and Open/Resolved filter
 * on a status only a staff payload carries — closing a thread is a staff action,
 * and a Customer's row has no `status` field at all, so those two would offer a
 * filter that could only answer with everything or with nothing.
 */
export function RoleConversationsScreen({
  showCompose = true,
}: RoleConversationsScreenProps) {
  const user = getSessionUser();
  const inbox = useConversationInbox();
  const navigation = useNavigation();
  const isStaff = user !== null && user.role !== "customer";
  const [tab, setTab] = useState<ListTab>("chats");

  const all = inbox.status === "ready" ? inbox.conversations : EMPTY;

  const chats = useMemo(() => inboxConversations(all), [all]);

  /**
   * The count beside each label, or undefined where there is nothing to say.
   *
   * Read off the one list both halves are drawn from, so a room moving between
   * them moves its count with it. Nothing while the first fetch is out: an empty
   * list is not yet a fact, and a count that appears a moment later is better
   * than one that says zero and then disagrees with the rows under it.
   */
  const counts = useMemo(
    () =>
      inbox.status === "ready"
        ? { chats: inboxTabBadge(all), communities: communitiesTabBadge(all) }
        : { chats: undefined, communities: undefined },
    [inbox.status, all],
  );

  /*
   * The screen is titled here rather than by whichever half is showing, so the
   * header does not change under somebody switching between two views of the
   * same inbox.
   *
   * Compose is the Chats half's, and `InboxScreen` sets it when it mounts —
   * which is why this has to take it away again: header options outlive the
   * component that set them, so a tab switch would leave a New conversation
   * button over a list of Communities that has nothing to do with it.
   */
  useEffect(() => {
    navigation.setOptions(
      tab === "communities" ? { title: "Messages", headerRight: undefined } : { title: "Messages" },
    );
  }, [navigation, tab]);

  return (
    <View className="flex-1 bg-bg">
      <View
        accessibilityRole="tablist"
        className="flex-row gap-2 border-b border-line/60 bg-surface px-4 pb-2.5 pt-2"
      >
        {TABS.map((item) => {
          const selected = item.id === tab;
          const count = counts[item.id];
          return (
            <TactilePressable
              key={item.id}
              accessibilityRole="tab"
              // The count is part of the name rather than a separate element: a
              // pressable collapses what it contains, so a badge drawn inside it
              // would be a number no screen reader could reach.
              accessibilityLabel={count != null ? `${item.label}, ${count} unread` : item.label}
              accessibilityState={{ selected }}
              onPress={() => setTab(item.id)}
              className={cn(
                "min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl border",
                selected
                  ? "border-transparent bg-primary shadow-sm shadow-primary/25"
                  : "border-line/80 bg-line/35",
              )}
            >
              <Text
                variant="label"
                className={selected ? "text-primary-foreground" : "text-ink-soft"}
              >
                {item.label}
              </Text>
              {count != null ? (
                <View
                  className={cn(
                    "min-w-5 items-center rounded-full px-1.5 py-px",
                    selected ? "bg-primary-foreground/25" : "bg-primary",
                  )}
                >
                  <Text variant="label" className="tabular-nums text-primary-foreground">
                    {count > 99 ? "99+" : String(count)}
                  </Text>
                </View>
              ) : null}
            </TactilePressable>
          );
        })}
      </View>

      {tab === "chats" ? (
        <InboxScreen
          conversations={chats}
          organizationNames={
            inbox.status === "ready" ? inbox.organizationNames : undefined
          }
          loading={inbox.status === "loading"}
          error={inbox.status === "failed" ? failureNotice(inbox.failure) : null}
          refreshing={inbox.refreshing}
          onRefresh={inbox.reload}
          showChips={isStaff}
          showUnreadFilter
          showCompose={showCompose}
          viewerId={user?.id}
          savedInboxesFor={user?.role ?? null}
          title="Messages"
        />
      ) : (
        <CommunityTabList />
      )}
    </View>
  );
}

const TABS: { id: ListTab; label: string }[] = [
  { id: "chats", label: "Chats" },
  { id: "communities", label: "Communities" },
];

const EMPTY: never[] = [];
