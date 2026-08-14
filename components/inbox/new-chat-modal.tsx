import type { Href } from "expo-router";
import { MessageSquare, Search, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { FlatList, Modal, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { chatHref } from "@/lib/chat-route-id";
import { initials } from "@/lib/display";
import { getDevUserId } from "@/lib/dev-user";
import { CONVERSATIONS, PEOPLE } from "@/lib/mock-data";
import { colors, screenTopPad } from "@/lib/tokens";
import type { Person } from "@/lib/types";

type NewChatModalProps = {
  visible: boolean;
  onClose: () => void;
  onSelectChat: (href: Href) => void;
};

export function NewChatModal({
  visible,
  onClose,
  onSelectChat,
}: NewChatModalProps) {
  const insets = useSafeAreaInsets();
  const myId = getDevUserId();
  const [query, setQuery] = useState("");

  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PEOPLE.filter((p) => {
      if (p.id === myId) return false;
      if (!q) return true;
      return (
        p.displayName.toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q)
      );
    });
  }, [myId, query]);

  function handleSelect(person: Person) {
    // Find if a 1-on-1 conversation exists with this person
    const existing = CONVERSATIONS.find(
      (c) =>
        c.kind === "direct" &&
        c.participantIds.includes(person.id) &&
        c.participantIds.includes(myId),
    );
    const targetId = existing?.id ?? (person.role === "contact" ? "conv-unassigned" : "conv-assigned");
    onClose();
    onSelectChat(chatHref(targetId));
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        className="flex-1 bg-bg"
        style={{ paddingTop: Math.max(screenTopPad(insets.top), 16) }}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between border-b border-line/60 bg-surface px-4 pb-3">
          <View className="flex-row items-center gap-2">
            <View className="size-8 items-center justify-center rounded-full bg-primary-soft">
              <MessageSquare color={colors.primary} size={18} />
            </View>
            <Text className="font-sans text-lg font-bold text-ink">
              New Message
            </Text>
          </View>
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={onClose}
            className="size-9 items-center justify-center rounded-full bg-line/80"
          >
            <X color={colors.inkSoft} size={18} />
          </TactilePressable>
        </View>

        {/* Search */}
        <View className="border-b border-line/40 bg-surface px-4 py-3">
          <View className="relative flex-row items-center">
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="Search people by name or role…"
              accessibilityLabel="Search people"
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
                className="absolute right-2.5 size-7 items-center justify-center rounded-full bg-line/80"
              >
                <X color={colors.inkSoft} size={14} />
              </TactilePressable>
            ) : null}
          </View>
        </View>

        {/* Contacts List */}
        <FlatList
          className="flex-1 bg-bg"
          data={filteredPeople}
          keyExtractor={(item) => item.id}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="px-4 py-3"
          ItemSeparatorComponent={() => <View className="h-2.5" />}
          renderItem={({ item }) => (
            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel={`Chat with ${item.displayName}`}
              onPress={() => handleSelect(item)}
              className="flex-row items-center gap-3.5 rounded-2xl border border-line bg-surface p-3.5 shadow-sm shadow-black/5"
            >
              <View className="relative">
                <Avatar alt={item.displayName} className="size-11">
                  <AvatarFallback className="bg-primary-soft">
                    <Text className="font-sans text-sm font-bold text-primary">
                      {initials(item.displayName)}
                    </Text>
                  </AvatarFallback>
                </Avatar>
                {item.isOnline ? (
                  <View
                    accessibilityLabel="Online"
                    className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-surface bg-success"
                  />
                ) : null}
              </View>

              <View className="min-w-0 flex-1">
                <Text className="font-sans text-base font-semibold text-ink" numberOfLines={1}>
                  {item.displayName}
                </Text>
                <Text className="mt-0.5 font-sans text-xs font-normal text-muted">
                  {item.lastActiveLabel ?? (item.isOnline ? "Active now" : "Offline")}
                </Text>
              </View>

              <View
                className={`rounded-full px-2.5 py-0.5 ${
                  item.role === "admin"
                    ? "bg-primary-soft"
                    : item.role === "agent"
                      ? "bg-success/15"
                      : "bg-line/80"
                }`}
              >
                <Text
                  className={`font-sans text-[10px] font-bold uppercase tracking-wider ${
                    item.role === "admin"
                      ? "text-primary"
                      : item.role === "agent"
                        ? "text-success"
                        : "text-muted"
                  }`}
                >
                  {item.role}
                </Text>
              </View>
            </TactilePressable>
          )}
          ListEmptyComponent={
            <View className="items-center px-4 py-12">
              <Text className="font-sans text-base font-semibold text-ink">
                No matching contacts
              </Text>
              <Text className="mt-1 text-center font-sans text-sm text-muted">
                Try searching for a different name or role.
              </Text>
            </View>
          }
        />
      </View>
    </Modal>
  );
}
