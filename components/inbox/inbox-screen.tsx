import { useNavigation, useRouter } from "expo-router";
import { Inbox, MessageCircle, Search, SquarePen, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { FlatList, View } from "react-native";

import { ConversationRow } from "@/components/inbox/conversation-row";
import { NewChatModal } from "@/components/inbox/new-chat-modal";
import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { chatHref } from "@/lib/chat-route-id";
import { cn } from "@/lib/cn";
import { filterConversations, type InboxChip } from "@/lib/inbox-filter";
import { getDevUserId } from "@/lib/dev-user";
import { LABELS, PEOPLE } from "@/lib/mock-data";
import { colors } from "@/lib/tokens";
import type { Conversation } from "@/lib/types";

const CHIPS: { id: InboxChip; label: string }[] = [
  { id: "all", label: "All Messages" },
  { id: "open", label: "Open" },
  { id: "resolved", label: "Resolved" },
];

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

  const visible = useMemo(
    () =>
      filterConversations(
        conversations,
        query,
        showChips ? chip : "all",
        LABELS,
        PEOPLE,
        getDevUserId(),
      ),
    [conversations, query, chip, showChips],
  );

  return (
    <View className="flex-1 bg-bg">
      <View className="border-b border-line/60 bg-surface px-4 pb-3.5 pt-2">
        <View className="relative flex-row items-center">
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Search conversations…"
            accessibilityLabel="Search conversations"
            className="h-11 flex-1 rounded-2xl border-line bg-bg pl-10 pr-10 shadow-none font-sans text-sm"
          />
          <View className="pointer-events-none absolute left-3">
            <Search color={colors.muted} size={18} />
          </View>
          {query.length > 0 ? (
            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => setQuery("")}
              className="absolute right-2 size-7 items-center justify-center rounded-full bg-line/80"
            >
              <X color={colors.inkSoft} size={14} />
            </TactilePressable>
          ) : null}
        </View>

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
                      ? "border-transparent bg-primary text-primary-foreground shadow-sm shadow-black/10"
                      : "border-line bg-bg",
                  )}
                >
                  <Text
                    className={cn(
                      "font-sans text-xs font-semibold",
                      selected ? "text-primary-foreground" : "text-ink-soft",
                    )}
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
        keyExtractor={(item) => item.id}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={5}
        contentContainerClassName="px-4 py-3"
        ItemSeparatorComponent={() => <View className="h-3" />}
        renderItem={({ item }) => (
          <ConversationRow
            conversation={item}
            onPress={() => router.push(chatHref(item.id))}
          />
        )}
        ListEmptyComponent={
          <View className="items-center px-4 py-16">
            <View className="size-14 items-center justify-center rounded-full bg-primary-soft">
              {showChips ? (
                <MessageCircle color={colors.primary} size={26} />
              ) : (
                <Inbox color={colors.primary} size={26} />
              )}
            </View>
            <Text className="mt-4 font-sans text-base font-semibold text-ink">
              {showChips ? "No conversations found" : "Unassigned pool is empty"}
            </Text>
            <Text className="mt-1 text-center font-sans text-sm font-normal text-muted">
              {showChips
                ? "Try searching for a different person or changing the filter."
                : "All incoming requests have been assigned to an agent."}
            </Text>
          </View>
        }
      />

      <NewChatModal
        visible={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSelectChat={(href) => router.push(href as any)}
      />
    </View>
  );
}
