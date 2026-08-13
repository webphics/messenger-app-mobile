import { useNavigation, useRouter } from "expo-router";
import { SquarePen } from "lucide-react-native";
import { useLayoutEffect, useMemo, useState } from "react";
import { FlatList, Pressable, View } from "react-native";

import { ConversationRow } from "@/components/inbox/conversation-row";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { chatHref } from "@/lib/chat-route-id";
import { cn } from "@/lib/cn";
import { filterConversations, type InboxChip } from "@/lib/inbox-filter";
import { DEV_USER_ID, LABELS, PEOPLE } from "@/lib/mock-data";
import { colors } from "@/lib/tokens";
import type { Conversation } from "@/lib/types";

const CHIPS: { id: InboxChip; label: string }[] = [
  { id: "all", label: "All" },
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

  useLayoutEffect(() => {
    navigation.setOptions({
      title,
      headerRight: showCompose
        ? () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New conversation"
              className="mr-3 size-11 items-center justify-center"
              onPress={() => undefined}
            >
              <SquarePen color={colors.ink} size={22} />
            </Pressable>
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
        DEV_USER_ID,
      ),
    [conversations, query, chip, showChips],
  );

  return (
    <View className="flex-1 bg-bg">
      <View className="bg-surface px-4 pb-3 pt-2">
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          accessibilityLabel="Search conversations"
          className="h-11 rounded-full border-line bg-bg shadow-none"
        />
        {showChips ? (
          <View className="mt-3 flex-row gap-2">
            {CHIPS.map((item) => {
              const selected = item.id === chip;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected }}
                  onPress={() => setChip(item.id)}
                  className={cn(
                    "min-h-11 justify-center rounded-full border px-4",
                    selected
                      ? "border-transparent bg-primary-soft"
                      : "border-line bg-bg",
                  )}
                >
                  <Text
                    className={cn(
                      "font-sans text-sm font-medium",
                      selected ? "text-primary" : "text-ink-soft",
                    )}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      <FlatList
        className="flex-1 bg-surface"
        data={visible}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View className="ml-20 h-px bg-line" />}
        renderItem={({ item }) => (
          <ConversationRow
            conversation={item}
            onPress={() => router.push(chatHref(item.id))}
          />
        )}
        ListEmptyComponent={
          <Text className="px-4 py-8 text-center font-sans text-sm text-muted">
            No conversations
          </Text>
        }
      />
    </View>
  );
}
