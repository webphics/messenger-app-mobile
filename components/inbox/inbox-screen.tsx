import { useNavigation, useRouter } from "expo-router";
import { CloudOff, Inbox, MessageCircle, SquarePen } from "@/components/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, View } from "react-native";

import { ConversationRow } from "@/components/inbox/conversation-row";
import { NewChatModal } from "@/components/inbox/new-chat-modal";
import { SearchFieldWithClear } from "@/components/search-field-with-clear";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { chatHref } from "@/lib/chat-route-id";
import { cn } from "@/lib/cn";
import { filterConversations, type InboxChip } from "@/lib/inbox-filter";
import { settleEnter } from "@/lib/motion-enter";
import {
  makeRefreshControl,
  useSimulatedRefresh,
} from "@/lib/simulated-refresh";
import { colors } from "@/lib/tokens";
import type { Conversation } from "@/lib/types";
import Animated, { useReducedMotion } from "react-native-reanimated";

/**
 * The staff filters, in the order they narrow.
 *
 * Short labels because there are four of them and the row does not scroll: "All
 * Messages" was affordable beside two chips and is not beside three.
 */
const CHIPS: { id: InboxChip; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" },
  { id: "open", label: "Open" },
  { id: "resolved", label: "Resolved" },
];

function keyExtractor(item: Conversation) {
  return item.id;
}

function InboxItemSeparator() {
  return <View className="h-3" />;
}

function InboxEmpty({ showChips }: { showChips: boolean }) {
  const reduceMotion = useReducedMotion();
  return (
    <Animated.View
      entering={settleEnter(!!reduceMotion)}
      className="items-center px-4 py-16"
    >
      <View className="size-14 items-center justify-center rounded-full bg-primary-soft">
        {showChips ? (
          <MessageCircle color={colors.primary} size={26} />
        ) : (
          <Inbox color={colors.primary} size={26} />
        )}
      </View>
      <Text variant="title" className="mt-4 text-ink">
        {showChips ? "No conversations found" : "Unassigned pool is empty"}
      </Text>
      <Text variant="meta" className="mt-1 text-center text-muted">
        {showChips
          ? "Try searching for a different person or changing the filter."
          : "All incoming requests have been assigned to an agent."}
      </Text>
    </Animated.View>
  );
}

/** The first fetch, with nothing to show yet. */
function InboxLoading() {
  return (
    <View className="items-center px-4 py-16">
      <ActivityIndicator color={colors.primary} />
      <Text variant="meta" className="mt-4 text-muted">
        Loading conversations…
      </Text>
    </View>
  );
}

/**
 * The list could not be fetched.
 *
 * Says what happened and offers the one thing that can help, rather than leaving
 * an empty list that reads as "you have no conversations" when the truth is that
 * nobody managed to ask.
 */
function InboxError({
  title,
  hint,
  onRetry,
}: {
  title: string;
  hint: string;
  onRetry?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <Animated.View
      entering={settleEnter(!!reduceMotion)}
      accessibilityLiveRegion="polite"
      className="items-center px-4 py-16"
    >
      <View className="size-14 items-center justify-center rounded-full bg-danger/10">
        <CloudOff color={colors.danger} size={26} />
      </View>
      <Text variant="title" className="mt-4 text-ink">
        {title}
      </Text>
      <Text variant="meta" className="mt-1 text-center text-muted">
        {hint}
      </Text>
      {onRetry ? (
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={onRetry}
          className="mt-4 min-h-11 justify-center rounded-full bg-primary px-5"
        >
          <Text variant="label" className="font-bold text-primary-foreground">
            Try again
          </Text>
        </TactilePressable>
      ) : null}
    </Animated.View>
  );
}

type InboxScreenProps = {
  conversations: Conversation[];
  showChips: boolean;
  showCompose: boolean;
  title: string;
  /** Names a Customer's own support threads, which carry no title of their own. */
  organizationNames?: ReadonlyMap<string, string>;
  /** Who is looking, so the Mine chip knows whose threads to keep. */
  viewerId?: string;
  /** Set while the first fetch is out and there is nothing to show yet. */
  loading?: boolean;
  /** What went wrong, when the list could not be fetched at all. */
  error?: { title: string; hint: string } | null;
  refreshing?: boolean;
  /** Absent for the lists still reading local data, which have nothing to refetch. */
  onRefresh?: () => void;
};

export function InboxScreen({
  conversations,
  showChips,
  showCompose,
  title,
  organizationNames,
  viewerId,
  loading = false,
  error = null,
  refreshing: refreshingProp,
  onRefresh: onRefreshProp,
}: InboxScreenProps) {
  const router = useRouter();
  const navigation = useNavigation();
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<InboxChip>("all");
  const [composeOpen, setComposeOpen] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const simulated = useSimulatedRefresh(() => {
    setEpoch((n) => n + 1);
  });
  // A list that fetches refreshes for real; one still reading local data keeps
  // the gesture it had, which only replays the enter animation.
  const refreshing = onRefreshProp ? refreshingProp === true : simulated.refreshing;
  const onRefresh = onRefreshProp ?? simulated.onRefresh;

  useEffect(() => {
    navigation.setOptions({
      title,
      headerRight: showCompose
        ? () => (
            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel="New conversation"
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              className="mr-2 size-10 items-center justify-center rounded-full bg-primary-soft/80"
              onPress={() => setComposeOpen(true)}
            >
              <SquarePen color={colors.primary} size={20} />
            </TactilePressable>
          )
        : undefined,
    });
  }, [navigation, showCompose, title]);

  const visible = useMemo(() => {
    void epoch;
    return filterConversations(conversations, {
      query,
      chip: showChips ? chip : "all",
      organizationNames,
      viewerId,
    });
  }, [conversations, query, chip, showChips, organizationNames, viewerId, epoch]);

  const openConversation = useCallback(
    (conversationId: string) => {
      router.push(chatHref(conversationId));
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Conversation; index: number }) => (
      <ConversationRow
        conversation={item}
        onPress={openConversation}
        organizationNames={organizationNames}
        index={index}
      />
    ),
    [openConversation, organizationNames],
  );

  return (
    <View className="flex-1 bg-bg">
      <View className="border-b border-line/60 bg-surface px-4 pb-3.5 pt-2">
        <SearchFieldWithClear
          value={query}
          onChangeText={setQuery}
          placeholder="Search conversations…"
          accessibilityLabel="Search conversations"
        />

        {showChips ? (
          <View className="mt-3 flex-row gap-2">
            {CHIPS.map((item) => {
              const selected = item.id === chip;
              return (
                <TactilePressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected }}
                  onPress={() => setChip(item.id)}
                  className={cn(
                    "min-h-9 justify-center rounded-full border px-3.5",
                    selected
                      ? "border-transparent bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                      : "border-line/80 bg-line/35",
                  )}
                >
                  <Text
                    variant="label"
                    className={
                      selected ? "text-primary-foreground" : "text-ink-soft"
                    }
                  >
                    {item.label}
                  </Text>
                </TactilePressable>
              );
            })}
          </View>
        ) : null}
      </View>

      <FlatList
        className="flex-1 bg-bg"
        showsVerticalScrollIndicator={false}
        data={visible}
        keyExtractor={keyExtractor}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={5}
        contentContainerClassName="px-4 py-3"
        ItemSeparatorComponent={InboxItemSeparator}
        renderItem={renderItem}
        ListEmptyComponent={
          loading ? (
            <InboxLoading />
          ) : error ? (
            <InboxError title={error.title} hint={error.hint} onRetry={onRefresh} />
          ) : (
            <InboxEmpty showChips={showChips} />
          )
        }
        refreshControl={makeRefreshControl(refreshing, onRefresh)}
      />

      <NewChatModal
        visible={composeOpen}
        onClose={() => setComposeOpen(false)}
        onOpenConversation={(conversation) => router.push(chatHref(conversation.id))}
      />
    </View>
  );
}
