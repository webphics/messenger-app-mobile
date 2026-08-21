import { useNavigation, useRouter } from "expo-router";
import { Inbox, MessageCircle, SquarePen } from "@/components/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, View } from "react-native";

import { ConversationRow } from "@/components/inbox/conversation-row";
import { NewChatModal } from "@/components/inbox/new-chat-modal";
import { SearchFieldWithClear } from "@/components/search-field-with-clear";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { chatHref } from "@/lib/chat-route-id";
import { cn } from "@/lib/cn";
import { filterConversations, type InboxChip } from "@/lib/inbox-filter";
import { getDevUserId } from "@/lib/dev-user";
import { LABELS, PEOPLE } from "@/lib/mock-data";
import { settleEnter } from "@/lib/motion-enter";
import {
  makeRefreshControl,
  useSimulatedRefresh,
} from "@/lib/simulated-refresh";
import { colors } from "@/lib/tokens";
import type { Conversation } from "@/lib/types";
import Animated, { useReducedMotion } from "react-native-reanimated";

const CHIPS: { id: InboxChip; label: string }[] = [
  { id: "all", label: "All Messages" },
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

type InboxScreenProps = {
  conversations: Conversation[];
  showChips: boolean;
  showCompose: boolean;
  title: string;
};

export function InboxScreen({
  conversations,
  showChips,
  showCompose,
  title,
}: InboxScreenProps) {
  const router = useRouter();
  const navigation = useNavigation();
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<InboxChip>("all");
  const [composeOpen, setComposeOpen] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const { refreshing, onRefresh } = useSimulatedRefresh(() => {
    setEpoch((n) => n + 1);
  });

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
    return filterConversations(
      conversations,
      query,
      showChips ? chip : "all",
      LABELS,
      PEOPLE,
      getDevUserId(),
    );
  }, [conversations, query, chip, showChips, epoch]);

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
        index={index}
      />
    ),
    [openConversation],
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
        ListEmptyComponent={<InboxEmpty showChips={showChips} />}
        refreshControl={makeRefreshControl(refreshing, onRefresh)}
      />

      <NewChatModal
        visible={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSelectChat={(href) => router.push(href)}
      />
    </View>
  );
}
