import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, View } from "react-native";

import { CommunityActionsSheet } from "@/components/communities/community-actions-sheet";
import { CommunityJoinableRowView } from "@/components/communities/community-joinable-row";
import {
  CommunityLoading,
  CommunityNoticeView,
} from "@/components/communities/community-notice-view";
import { CommunityThreadRowView } from "@/components/communities/community-thread-row";
import { InScreenHeader } from "@/components/in-screen-header";
import { MoreVertical } from "@/components/icons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/auth-context";
import { chatHref } from "@/lib/chat-route-id";
import { leaveCommunity } from "@/lib/community-api";
import {
  communityScreenRows,
  communitySections,
  withLiveSections,
  type CommunityScreenRow,
} from "@/lib/community-list";
import { communityActionRefusal } from "@/lib/community-join";
import { COMMUNITY_JOINABLE_EMPTY, COMMUNITY_JOINED_EMPTY } from "@/lib/community-notice";
import { confirmLeaveCommunity } from "@/lib/confirm-leave-community";
import { useConversationInbox } from "@/lib/conversation-inbox";
import { initials } from "@/lib/display";
import { makeRefreshControl } from "@/lib/simulated-refresh";
import { colors } from "@/lib/tokens";
import { forgetCommunity, useCommunityFeed, useJoinGroup, useStoredCommunity } from "@/lib/use-communities";
import { ROLE_HREF } from "@/lib/hub-routes";
import type { Conversation } from "@/lib/types";

type CommunityScreenProps = { communityId: string };

function keyExtractor(row: CommunityScreenRow) {
  return row.key;
}

/**
 * One Community, whole: its pinned Announcements thread, the Groups the
 * viewer is already in, and the Groups they may join (#73).
 *
 * `View all`, on the tab, draws a handful of joined Groups and nothing a
 * viewer is not in; this draws every joined Group unbounded and adds the
 * section a list of rooms with no way into them would have made a dead end.
 */
export function CommunityScreen({ communityId }: CommunityScreenProps) {
  const router = useRouter();
  const { state } = useAuth();
  const viewerId = state.status === "signed-in" ? state.user.id : null;
  const role = state.status === "signed-in" ? state.user.role : "customer";

  /*
   * Which Community this is comes off the disk rather than off a request. The
   * tab writes the list it fetched, so a name and a member count are here with
   * no signal and in the frame this screen first draws.
   */
  const community = useStoredCommunity(communityId);
  const { feed, refresh, refreshing, reload } = useCommunityFeed(communityId);
  const inbox = useConversationInbox();

  const conversations = inbox.status === "ready" ? inbox.conversations : EMPTY_CONVERSATIONS;

  const rows = useMemo(() => {
    if (feed.status !== "ready") return [];
    const sections = withLiveSections(communitySections(feed.rows), conversations);
    return communityScreenRows(sections);
  }, [feed, conversations]);

  const openConversation = useCallback(
    (conversationId: string) => {
      router.push(chatHref(conversationId));
    },
    [router],
  );

  const { busyId, error: joinError, join } = useJoinGroup(
    communityId,
    useCallback(
      (conversation: Conversation) => {
        inbox.addConversation(conversation);
      },
      [inbox],
    ),
    // A join changes membership either way — straight in, or a pending ask —
    // and both move the row between sections. Fired once the join's own
    // request has actually landed, never at the tap, so this re-read sees
    // the join rather than racing it. Silent: this is not the pull a person
    // asked for, it is what makes their own tap take effect.
    reload,
  );

  const [sheetOpen, setSheetOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const handleLeave = useCallback(async () => {
    const title = community?.name ?? "this community";
    const confirmed = await confirmLeaveCommunity(title);
    if (!confirmed) return;

    setLeaving(true);
    setLeaveError(null);
    const result = await leaveCommunity(communityId);
    setLeaving(false);

    if (!result.ok) {
      // No fallback message: `communityActionRefusal` returns null on purpose
      // for an expired session, because the auth layer is already on its way
      // to sign-in and a sentence here would land on a screen that is leaving.
      setLeaveError(communityActionRefusal(result.failure));
      return;
    }

    if (viewerId) forgetCommunity(viewerId, communityId);
    if (router.canGoBack()) router.back();
    else router.replace(ROLE_HREF[role]);
  }, [community, communityId, router, viewerId, role]);

  const renderItem = useCallback(
    ({ item }: { item: CommunityScreenRow }) => {
      if (item.kind === "announcements" || item.kind === "thread") {
        return <CommunityThreadRowView row={item.row} onPress={openConversation} inset={false} />;
      }
      if (item.kind === "section") {
        return (
          <Text variant="label" className="mb-1 mt-5 font-bold uppercase tracking-wide text-muted">
            {item.title}
          </Text>
        );
      }
      if (item.kind === "joined-empty") {
        return (
          <Text variant="meta" className="mt-1 text-muted">
            {COMMUNITY_JOINED_EMPTY}
          </Text>
        );
      }
      if (item.kind === "joinable") {
        return (
          <CommunityJoinableRowView
            row={item.row}
            busy={busyId === item.row.id}
            blocked={busyId !== null && busyId !== item.row.id}
            onJoin={join}
          />
        );
      }
      if (item.kind === "joinable-empty") {
        return (
          <Text variant="meta" className="mt-1 text-muted">
            {COMMUNITY_JOINABLE_EMPTY}
          </Text>
        );
      }
      item satisfies never;
      return null;
    },
    [openConversation, busyId, join],
  );

  const title = community?.name ?? "Community";
  const bannerErrors = [
    { key: "join", message: joinError },
    { key: "leave", message: leaveError },
  ].filter(
    (banner): banner is { key: string; message: string } => banner.message !== null,
  );

  return (
    <View className="flex-1 bg-bg">
      <InScreenHeader>
        <View className="min-w-0 flex-1 flex-row items-center gap-3 pr-1">
          <Avatar alt={title} className="size-9">
            <AvatarFallback className="bg-primary-soft">
              <Text variant="label" className="font-bold text-primary">
                {initials(title)}
              </Text>
            </AvatarFallback>
          </Avatar>
          <View className="min-w-0 flex-1">
            <Text variant="title" className="text-ink" numberOfLines={1}>
              {title}
            </Text>
            {community ? (
              <Text variant="label" className="font-normal text-muted" numberOfLines={1}>
                {community.memberCount} {community.memberCount === 1 ? "member" : "members"}
              </Text>
            ) : null}
          </View>
        </View>
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Community options"
          onPress={() => setSheetOpen(true)}
          disabled={leaving}
          className="size-11 shrink-0 items-center justify-center rounded-full"
        >
          {leaving ? (
            <ActivityIndicator color={colors.ink} size="small" />
          ) : (
            <MoreVertical color={colors.ink} size={20} />
          )}
        </TactilePressable>
      </InScreenHeader>

      {bannerErrors.map((banner) => (
        <View
          key={banner.key}
          accessibilityLiveRegion="polite"
          className="border-b border-line/60 bg-danger/10 px-4 py-2"
        >
          <Text variant="label" className="text-danger">
            {banner.message}
          </Text>
        </View>
      ))}

      <FlatList
        className="flex-1 bg-bg"
        showsVerticalScrollIndicator={false}
        data={rows}
        keyExtractor={keyExtractor}
        initialNumToRender={16}
        contentContainerClassName="px-4 pb-6 pt-1"
        renderItem={renderItem}
        ListEmptyComponent={
          feed.status === "loading" ? (
            <CommunityLoading label="Loading groups" />
          ) : feed.status === "failed" ? (
            <CommunityNoticeView title={feed.title} hint={feed.hint} failed onRetry={refresh} />
          ) : null
        }
        refreshControl={makeRefreshControl(refreshing, refresh)}
      />

      <CommunityActionsSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onLeave={() => void handleLeave()}
      />
    </View>
  );
}

const EMPTY_CONVERSATIONS: readonly Conversation[] = [];
