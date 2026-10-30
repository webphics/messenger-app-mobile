import { useRouter } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, FlatList, View } from "react-native";

import { CommunityRow } from "@/components/communities/community-row";
import {
  CommunityLoading,
  CommunityNoticeView,
} from "@/components/communities/community-notice-view";
import { CommunityThreadRowView } from "@/components/communities/community-thread-row";
import { ChevronRight, X } from "@/components/icons";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { chatHref } from "@/lib/chat-route-id";
import { communityHref } from "@/lib/community-route";
import type { CommunityTabRow } from "@/lib/community-list";
import { makeRefreshControl } from "@/lib/simulated-refresh";
import { colors } from "@/lib/tokens";
import { useCommunities } from "@/lib/use-communities";

function keyExtractor(item: CommunityTabRow) {
  return item.key;
}

/**
 * A read that failed over Communities that are still drawn.
 *
 * One line above them rather than a screen in their place: what is drawn is
 * still true, so it is dismissed rather than retried — the same shape a failed
 * page over a thread's Messages takes.
 */
function StaleStrip({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <View
      accessibilityLiveRegion="polite"
      className="mt-3 flex-row items-center gap-2 rounded-2xl border border-line/70 bg-line/30 px-3 py-2"
    >
      <Text variant="label" className="flex-1 font-normal text-muted">
        {message}
      </Text>
      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={onDismiss}
        className="size-8 items-center justify-center rounded-full"
      >
        <X color={colors.muted} size={16} />
      </TactilePressable>
    </View>
  );
}

/** One Community's rooms, still on their way. */
function FeedLoading() {
  return (
    <View
      accessibilityLabel="Loading groups"
      className="ml-5 mt-1.5 flex-row items-center gap-3 rounded-2xl border border-line/50 bg-surface/60 p-3"
    >
      <ActivityIndicator color={colors.muted} size="small" />
      <Text variant="label" className="font-normal text-muted">
        Loading groups…
      </Text>
    </View>
  );
}

/** One Community's rooms, which did not arrive. The tab around them is fine. */
function FeedFailed({
  title,
  hint,
  onRetry,
}: {
  title: string;
  hint: string;
  onRetry: () => void;
}) {
  return (
    <View className="ml-5 mt-1.5 gap-2 rounded-2xl border border-danger/20 bg-danger/5 p-3">
      <Text variant="label" className="text-ink">
        {title}
      </Text>
      <Text variant="label" className="font-normal text-muted">
        {hint}
      </Text>
      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel="Try again"
        onPress={onRetry}
        className="mt-0.5 min-h-11 self-start justify-center rounded-full bg-primary px-4"
      >
        <Text variant="label" className="font-bold text-primary-foreground">
          Try again
        </Text>
      </TactilePressable>
    </View>
  );
}

/** A Community holding nothing this person can open yet. */
function FeedEmpty() {
  return (
    <View className="ml-5 mt-1.5 rounded-2xl border border-line/50 bg-surface/60 p-3">
      <Text variant="label" className="font-normal text-muted">
        No groups you’re in yet.
      </Text>
    </View>
  );
}

/**
 * The Communities tab: the Communities this person is in, each expanding onto
 * what it holds.
 *
 * One flat, virtualised list rather than a list of lists — see
 * `lib/community-list`, which flattens it. Several Communities open at once
 * costs the window a fixed number of extra rows each and nothing else.
 */
export function CommunityTabList() {
  const router = useRouter();
  const communities = useCommunities();
  const { notice, rows, retryFeed, toggle } = communities;

  const openConversation = useCallback(
    (conversationId: string) => {
      router.push(chatHref(conversationId));
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: CommunityTabRow }) => {
      switch (item.kind) {
        case "community":
          return (
            <CommunityRow
              community={item.community}
              expanded={item.expanded}
              onToggle={toggle}
            />
          );
        case "thread":
          return <CommunityThreadRowView row={item.row} onPress={openConversation} />;
        case "feed-loading":
          return <FeedLoading />;
        case "feed-failed":
          return (
            <FeedFailed
              title={item.title}
              hint={item.hint}
              onRetry={() => retryFeed(item.communityId)}
            />
          );
        case "feed-empty":
          return <FeedEmpty />;
        case "view-all":
          return (
            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel={`View all of ${item.community.name}`}
              onPress={() => router.push(communityHref(item.community.id))}
              className="ml-5 mt-1 min-h-11 flex-row items-center gap-1 rounded-2xl px-3"
            >
              <Text variant="label" className="text-primary">
                View all
              </Text>
              <ChevronRight color={colors.primary} size={14} />
            </TactilePressable>
          );
      }
    },
    [openConversation, retryFeed, router, toggle],
  );

  return (
    <View className="flex-1 bg-bg">
      <FlatList
        className="flex-1 bg-bg"
        showsVerticalScrollIndicator={false}
        data={rows}
        keyExtractor={keyExtractor}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={5}
        contentContainerClassName="px-4 pb-4"
        renderItem={renderItem}
        ListHeaderComponent={
          notice.kind === "stale" ? (
            <StaleStrip message={notice.message} onDismiss={communities.dismissFailure} />
          ) : undefined
        }
        ListEmptyComponent={
          notice.kind === "loading" ? (
            <CommunityLoading label="Loading communities" />
          ) : notice.kind === "failed" ? (
            <CommunityNoticeView
              title={notice.title}
              hint={notice.hint}
              failed
              onRetry={communities.retry}
            />
          ) : notice.kind === "empty" ? (
            <CommunityNoticeView title={notice.title} hint={notice.hint} failed={false} />
          ) : undefined
        }
        refreshControl={makeRefreshControl(communities.refreshing, communities.refresh)}
      />
    </View>
  );
}
