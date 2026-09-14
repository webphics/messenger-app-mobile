import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { FlatList, View } from "react-native";

import {
  CommunityLoading,
  CommunityNoticeView,
} from "@/components/communities/community-notice-view";
import { CommunityThreadRowView } from "@/components/communities/community-thread-row";
import { InScreenHeader } from "@/components/in-screen-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Text } from "@/components/ui/text";
import { chatHref } from "@/lib/chat-route-id";
import { communityThreads, withLiveThread } from "@/lib/community-list";
import { COMMUNITY_EMPTY } from "@/lib/community-notice";
import { useConversationInbox } from "@/lib/conversation-inbox";
import { initials } from "@/lib/display";
import { makeRefreshControl } from "@/lib/simulated-refresh";
import { useCommunityFeed, useStoredCommunity } from "@/lib/use-communities";
import type { CommunityThreadRow, Conversation } from "@/lib/types";

type CommunityScreenProps = { communityId: string };

function keyExtractor(row: CommunityThreadRow) {
  return row.id;
}

/**
 * One Community, whole.
 *
 * What the tab shows beneath an expanded Community, unbounded: the Announcements
 * thread and every Group the viewer is in. The tab draws a handful and this
 * draws all of them, which is what `View all` means.
 *
 * The Groups the viewer is *not* in are deliberately absent. The feed carries
 * them and joining one is #73; a list of rooms with no way into them would be a
 * dead end, and the Community screen this grows into is that ticket's.
 */
export function CommunityScreen({ communityId }: CommunityScreenProps) {
  const router = useRouter();
  /*
   * Which Community this is comes off the disk rather than off a request. The
   * tab writes the list it fetched, so a name and a member count are here with
   * no signal and in the frame this screen first draws. A Community this device
   * has never held leaves the header naming nothing rather than refusing the
   * screen — the rooms below are the point, and they are fetched either way.
   */
  const community = useStoredCommunity(communityId);
  const { feed, refresh, refreshing } = useCommunityFeed(communityId);
  const inbox = useConversationInbox();

  const conversations = inbox.status === "ready" ? inbox.conversations : EMPTY;

  const threads = useMemo(() => {
    if (feed.status !== "ready") return [];
    const { announcements, groups } = communityThreads(feed.rows);
    const ordered = announcements ? [announcements, ...groups] : groups;
    return ordered.map((row) => withLiveThread(row, conversations));
  }, [feed, conversations]);

  const openConversation = useCallback(
    (conversationId: string) => {
      router.push(chatHref(conversationId));
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: CommunityThreadRow }) => (
      <CommunityThreadRowView row={item} onPress={openConversation} inset={false} />
    ),
    [openConversation],
  );

  const title = community?.name ?? "Community";

  return (
    <View className="flex-1 bg-bg">
      <InScreenHeader>
        <View className="min-w-0 flex-1 flex-row items-center gap-3 pr-3">
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
      </InScreenHeader>

      <FlatList
        className="flex-1 bg-bg"
        showsVerticalScrollIndicator={false}
        data={threads}
        keyExtractor={keyExtractor}
        initialNumToRender={12}
        contentContainerClassName="px-4 pb-6 pt-1"
        renderItem={renderItem}
        ListEmptyComponent={
          feed.status === "loading" ? (
            <CommunityLoading label="Loading groups" />
          ) : feed.status === "failed" ? (
            <CommunityNoticeView title={feed.title} hint={feed.hint} failed onRetry={refresh} />
          ) : (
            <CommunityNoticeView {...COMMUNITY_EMPTY} failed={false} />
          )
        }
        refreshControl={makeRefreshControl(refreshing, refresh)}
      />
    </View>
  );
}

const EMPTY: readonly Conversation[] = [];
