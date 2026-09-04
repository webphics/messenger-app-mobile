import { MessageSquare, X } from "@/components/icons";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Modal, View } from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { SearchFieldWithClear } from "@/components/search-field-with-clear";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PresenceDot } from "@/components/ui/presence-dot";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { createStaffDm, listStaffDirectory } from "@/lib/conversation-api";
import { useConversationInbox } from "@/lib/conversation-inbox";
import { failureNotice } from "@/lib/conversation-failure";
import { initials } from "@/lib/display";
import { listItemEnter, settleEnter } from "@/lib/motion-enter";
import {
  filterStaff,
  presenceLabel,
  staffDmIntent,
  type StaffDmIntent,
} from "@/lib/staff-directory";
import { colors, screenBottomPad, screenTopPad } from "@/lib/tokens";
import type { Conversation, StaffDirectoryUser } from "@/lib/types";
import Animated, { useReducedMotion } from "react-native-reanimated";

/**
 * Starting a conversation with another staff member.
 *
 * The directory is real (`GET /conversations/staff`) and so is what a tap does:
 * `POST /conversations/staff` is get-or-create, so picking someone this person
 * already writes to resumes that thread rather than starting a second one
 * beside it. The row that comes back joins the shared list directly — refetching
 * the whole inbox to learn about a conversation the API has just handed over
 * would put the largest request in the app between the tap and the thread.
 *
 * A staff DM belongs to an organization the two share. One is bound silently,
 * several are offered as a second tap on the row itself, and none disables the
 * row with the reason on it — see `staffDmIntent`.
 */

type NewChatModalProps = {
  visible: boolean;
  onClose: () => void;
  /** Where the conversation the API answered with should be opened. */
  onOpenConversation: (conversation: Conversation) => void;
};

export function NewChatModal({
  visible,
  onClose,
  onOpenConversation,
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
        <NewChatSheet onClose={onClose} onOpenConversation={onOpenConversation} />
      </SafeAreaProvider>
    </Modal>
  );
}

function keyExtractor(item: StaffDirectoryUser) {
  return item.id;
}

function ContactItemSeparator() {
  return <View className="h-2.5" />;
}

function DirectoryNotice({
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
      className="items-center px-4 py-12"
    >
      <Text variant="title" className="text-ink">
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
          <Text variant="label" className="font-semibold text-primary-foreground">
            Try again
          </Text>
        </TactilePressable>
      ) : null}
    </Animated.View>
  );
}

/** One row-shaped placeholder, matching ContactPickerRow's layout so the list doesn't reflow when the directory lands. */
function DirectoryLoadingRow() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="flex-row items-center gap-3.5 rounded-2xl border border-line/70 bg-surface p-3.5"
    >
      <View className="size-11 rounded-full bg-muted/15" />
      <View className="flex-1 gap-2">
        <View className="h-3.5 w-1/3 rounded-full bg-muted/15" />
        <View className="h-3 w-1/2 rounded-full bg-muted/10" />
      </View>
    </View>
  );
}

type ContactPickerRowProps = {
  person: StaffDirectoryUser;
  onSelect: (person: StaffDirectoryUser) => void;
  onPickOrganization: (person: StaffDirectoryUser, organizationId: string) => void;
  /** Set while this row's request is out, so a second tap cannot start a second one. */
  busy: boolean;
  /** Whether this row is showing the organizations to choose between. */
  expanded: boolean;
  /** What the API said when this row's request was refused. */
  refusal: string | null;
  index?: number;
};

/**
 * What the row's accessible name promises, which is what its tap does.
 *
 * Three different actions wear the same row: starting a conversation, opening
 * the organizations to choose between, and nothing at all. A single "Chat with
 * …" would be a promise the second and third do not keep.
 */
function rowLabel(person: StaffDirectoryUser, intent: StaffDmIntent): string {
  if (intent.kind === "impossible") {
    return `${person.name}, unavailable: you share no organization`;
  }
  if (intent.kind === "choose") return `Chat with ${person.name}, choose an organization`;
  return `Chat with ${person.name}`;
}

const ContactPickerRow = memo(function ContactPickerRow({
  person,
  onSelect,
  onPickOrganization,
  busy,
  expanded,
  refusal,
  index = 0,
}: ContactPickerRowProps) {
  const reduceMotion = useReducedMotion();
  const intent = staffDmIntent(person);
  const disabled = intent.kind === "impossible" || busy;
  const subtitle =
    intent.kind === "impossible"
      ? "You share no organization"
      : presenceLabel(person);

  const handlePress = useCallback(() => {
    onSelect(person);
  }, [onSelect, person]);

  return (
    <Animated.View entering={listItemEnter(!!reduceMotion, index)}>
      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel={rowLabel(person, intent)}
        accessibilityState={
          intent.kind === "choose" ? { disabled, expanded } : { disabled }
        }
        disabled={disabled}
        onPress={handlePress}
        className={`flex-row items-center gap-3.5 rounded-2xl border border-line/70 bg-surface p-3.5 shadow-md shadow-black/8 ${
          disabled ? "opacity-60" : ""
        }`}
      >
        <View className="relative">
          <Avatar alt={person.name} className="size-11">
            <AvatarFallback className="bg-primary-soft">
              <Text variant="meta" className="font-bold text-primary">
                {initials(person.name)}
              </Text>
            </AvatarFallback>
          </Avatar>
          {person.isOnline ? (
            <PresenceDot className="absolute bottom-0 right-0 size-3 border-2 border-surface" />
          ) : null}
        </View>

        <View className="min-w-0 flex-1">
          <Text variant="title" className="text-ink" numberOfLines={1}>
            {person.name}
          </Text>
          {subtitle ? (
            <Text
              variant="label"
              className="mt-0.5 font-normal text-muted"
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        {busy ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View
            className={`rounded-full px-2.5 py-0.5 ${
              person.role === "admin" ? "bg-primary-soft" : "bg-success/15"
            }`}
          >
            <Text
              variant="label"
              className={`font-bold uppercase tracking-wider ${
                person.role === "admin" ? "text-primary" : "text-success"
              }`}
            >
              {person.role}
            </Text>
          </View>
        )}
      </TactilePressable>

      {refusal ? (
        <View
          accessibilityLiveRegion="polite"
          className="mt-1.5 rounded-2xl border border-danger/30 bg-danger/10 px-3.5 py-2.5"
        >
          <Text variant="meta" className="text-ink-soft">
            {refusal}
          </Text>
        </View>
      ) : null}

      {expanded && intent.kind === "choose" ? (
        <View accessibilityLiveRegion="polite">
        <View className="mt-1.5 gap-1.5 pl-6">
          <Text variant="label" className="text-muted">
            Which organization?
          </Text>
          {intent.organizations.map((organization) => (
            <TactilePressable
              key={organization.id}
              accessibilityRole="button"
              accessibilityLabel={`Start in ${organization.name}`}
              onPress={() => onPickOrganization(person, organization.id)}
              className="min-h-11 justify-center rounded-2xl border border-line/70 bg-surface px-3.5"
            >
              <Text variant="label" className="text-ink">
                {organization.name}
              </Text>
            </TactilePressable>
          ))}
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
});

/** Shared, so a sheet that has nothing to list hands the same array every render. */
const NO_STAFF: StaffDirectoryUser[] = [];

type Directory =
  | { status: "loading" }
  | { status: "failed"; title: string; hint: string }
  | { status: "ready"; people: StaffDirectoryUser[] };

function NewChatSheet({
  onClose,
  onOpenConversation,
}: Omit<NewChatModalProps, "visible">) {
  const insets = useSafeAreaInsets();
  const { addConversation } = useConversationInbox();
  const [query, setQuery] = useState("");
  const [directory, setDirectory] = useState<Directory>({ status: "loading" });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Whose request was refused, and what the API said about it. */
  const [refusal, setRefusal] = useState<{ id: string; message: string } | null>(null);

  const fetchDirectory = useCallback(() => {
    let live = true;
    void listStaffDirectory().then((result) => {
      if (!live) return;
      if (result.ok) {
        setDirectory({ status: "ready", people: result.value });
        return;
      }
      const notice = failureNotice(result.failure, "Could not load the staff directory");
      setDirectory({ status: "failed", title: notice.title, hint: notice.hint });
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => fetchDirectory(), [fetchDirectory]);

  /** The retry button's handler — unlike the mount effect, this needs to visibly reset to loading first. */
  const retryDirectory = useCallback(() => {
    setDirectory({ status: "loading" });
    fetchDirectory();
  }, [fetchDirectory]);

  const people = useMemo(
    () => (directory.status === "ready" ? directory.people : NO_STAFF),
    [directory],
  );
  const filtered = useMemo(() => filterStaff(people, query), [people, query]);

  const start = useCallback(
    async (person: StaffDirectoryUser, organizationId?: string) => {
      setBusyId(person.id);
      setRefusal(null);
      const result = await createStaffDm(person.id, organizationId);
      setBusyId(null);

      if (!result.ok) {
        setRefusal({ id: person.id, message: failureNotice(result.failure).hint });
        return;
      }

      addConversation(result.value);
      onClose();
      onOpenConversation(result.value);
    },
    [addConversation, onClose, onOpenConversation],
  );

  const handleSelect = useCallback(
    (person: StaffDirectoryUser) => {
      const intent = staffDmIntent(person);
      if (intent.kind === "impossible") return;
      if (intent.kind === "choose") {
        setExpandedId((current) => (current === person.id ? null : person.id));
        return;
      }
      void start(person, intent.organizationId);
    },
    [start],
  );

  const handlePickOrganization = useCallback(
    (person: StaffDirectoryUser, organizationId: string) => {
      setExpandedId(null);
      void start(person, organizationId);
    },
    [start],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: StaffDirectoryUser; index: number }) => (
      <ContactPickerRow
        person={item}
        onSelect={handleSelect}
        onPickOrganization={handlePickOrganization}
        busy={busyId === item.id}
        expanded={expandedId === item.id}
        refusal={refusal?.id === item.id ? refusal.message : null}
        index={index}
      />
    ),
    [busyId, expandedId, handlePickOrganization, handleSelect, refusal],
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
          placeholder="Search staff by name or role…"
          accessibilityLabel="Search staff"
        />
      </View>

      <FlatList
        className="flex-1 bg-bg"
        data={filtered}
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
          directory.status === "loading" ? (
            <View accessibilityLabel="Loading directory" className="gap-2.5">
              <DirectoryLoadingRow />
              <DirectoryLoadingRow />
              <DirectoryLoadingRow />
            </View>
          ) : directory.status === "failed" ? (
            <DirectoryNotice
              title={directory.title}
              hint={directory.hint}
              onRetry={retryDirectory}
            />
          ) : (
            <DirectoryNotice
              title="No matching staff"
              hint={
                people.length === 0
                  ? "There is nobody else on the team to write to yet."
                  : "Try searching for a different name or role."
              }
            />
          )
        }
      />
    </View>
  );
}
