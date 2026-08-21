import type { Href } from "expo-router";
import { MessageSquare, X } from "@/components/icons";
import { memo, useCallback, useMemo, useState } from "react";
import { FlatList, Modal, View } from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { SearchFieldWithClear } from "@/components/search-field-with-clear";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PresenceDot } from "@/components/ui/presence-dot";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { chatHref } from "@/lib/chat-route-id";
import { initials } from "@/lib/display";
import { getDevUserId } from "@/lib/dev-user";
import { CONVERSATIONS, PEOPLE } from "@/lib/mock-data";
import { listItemEnter, settleEnter } from "@/lib/motion-enter";
import { colors, screenBottomPad, screenTopPad } from "@/lib/tokens";
import type { Person } from "@/lib/types";
import Animated, { useReducedMotion } from "react-native-reanimated";

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
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/*
        A Modal is its own window, so MainActivity's padding of
        android.R.id.content never reaches it and the inherited insets are the
        main window's (zeroed there, since MainActivity consumes them). Its own
        provider reads this window's unconsumed insets, so the sheet locks to
        the safe area like every other screen.
      */}
      <SafeAreaProvider>
        <NewChatSheet onClose={onClose} onSelectChat={onSelectChat} />
      </SafeAreaProvider>
    </Modal>
  );
}

function keyExtractor(item: Person) {
  return item.id;
}

function ContactItemSeparator() {
  return <View className="h-2.5" />;
}

function EmptyContacts() {
  const reduceMotion = useReducedMotion();
  return (
    <Animated.View
      entering={settleEnter(!!reduceMotion)}
      className="items-center px-4 py-12"
    >
      <Text variant="title" className="text-ink">
        No matching contacts
      </Text>
      <Text variant="meta" className="mt-1 text-center text-muted">
        Try searching for a different name or role.
      </Text>
    </Animated.View>
  );
}

type ContactPickerRowProps = {
  person: Person;
  onSelect: (person: Person) => void;
  index?: number;
};

const ContactPickerRow = memo(function ContactPickerRow({
  person,
  onSelect,
  index = 0,
}: ContactPickerRowProps) {
  const reduceMotion = useReducedMotion();
  const handlePress = useCallback(() => {
    onSelect(person);
  }, [onSelect, person]);

  return (
    <Animated.View entering={listItemEnter(!!reduceMotion, index)}>
      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel={`Chat with ${person.displayName}`}
        onPress={handlePress}
        className="flex-row items-center gap-3.5 rounded-2xl border border-line/70 bg-surface p-3.5 shadow-md shadow-black/8"
      >
        <View className="relative">
          <Avatar alt={person.displayName} className="size-11">
            <AvatarFallback className="bg-primary-soft">
              <Text variant="meta" className="font-bold text-primary">
                {initials(person.displayName)}
              </Text>
            </AvatarFallback>
          </Avatar>
          {person.isOnline ? (
            <PresenceDot className="absolute bottom-0 right-0 size-3 border-2 border-surface" />
          ) : null}
        </View>

        <View className="min-w-0 flex-1">
          <Text variant="title" className="text-ink" numberOfLines={1}>
            {person.displayName}
          </Text>
          <Text variant="label" className="mt-0.5 font-normal text-muted">
            {person.lastActiveLabel ?? (person.isOnline ? "Active now" : "Offline")}
          </Text>
        </View>

        <View
          className={`rounded-full px-2.5 py-0.5 ${
            person.role === "admin"
              ? "bg-primary-soft"
              : person.role === "agent"
                ? "bg-success/15"
                : "bg-line/80"
          }`}
        >
          <Text
            variant="label"
            className={`font-bold uppercase tracking-wider ${
              person.role === "admin"
                ? "text-primary"
                : person.role === "agent"
                  ? "text-success"
                  : "text-muted"
            }`}
          >
            {person.role}
          </Text>
        </View>
      </TactilePressable>
    </Animated.View>
  );
});

function NewChatSheet({
  onClose,
  onSelectChat,
}: Omit<NewChatModalProps, "visible">) {
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

  const handleSelect = useCallback(
    (person: Person) => {
      // Find if a 1-on-1 conversation exists with this person
      const existing = CONVERSATIONS.find(
        (c) =>
          c.kind === "direct" &&
          c.participantIds.includes(person.id) &&
          c.participantIds.includes(myId),
      );
      const targetId =
        existing?.id ?? (person.role === "contact" ? "conv-unassigned" : "conv-assigned");
      onClose();
      onSelectChat(chatHref(targetId));
    },
    [myId, onClose, onSelectChat],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Person; index: number }) => (
      <ContactPickerRow person={item} onSelect={handleSelect} index={index} />
    ),
    [handleSelect],
  );

  return (
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
          <Text variant="headline" className="text-ink">
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
        <SearchFieldWithClear
          value={query}
          onChangeText={setQuery}
          placeholder="Search people by name or role…"
          accessibilityLabel="Search people"
        />
      </View>

      {/* Contacts List */}
      <FlatList
        className="flex-1 bg-bg"
        data={filteredPeople}
        keyExtractor={keyExtractor}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={5}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="px-4 py-3"
        contentContainerStyle={{
          paddingBottom: screenBottomPad(insets.bottom, 12),
        }}
        ItemSeparatorComponent={ContactItemSeparator}
        renderItem={renderItem}
        ListEmptyComponent={
          <EmptyContacts />
        }
      />
    </View>
  );
}
