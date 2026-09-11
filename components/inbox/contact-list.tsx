import { Users } from "@/components/icons";
import { useCallback, useMemo, useState } from "react";
import { FlatList, View, type ViewStyle } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { ContactRow } from "@/components/inbox/contact-row";
import { SearchFieldWithClear } from "@/components/search-field-with-clear";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import {
  contactChipLabel,
  contactChips,
  narrowContacts,
  type ContactChip,
} from "@/lib/contact-directory";
import { settleEnter } from "@/lib/motion-enter";
import { makeRefreshControl } from "@/lib/simulated-refresh";
import { colors } from "@/lib/tokens";
import type { ContactDirectoryView } from "@/lib/use-contact-directory";
import type { Contact } from "@/lib/types";

/**
 * The contact directory as a screen's worth of list: the search field, the
 * kind chips, and the rows.
 *
 * One component for the People tab and the compose sheet. They differ in their
 * chrome and in where the thread opens, and in nothing else — the same rows,
 * the same taps, the same three states behind them — so the difference is a
 * header prop rather than a second list.
 */

function keyExtractor(item: Contact) {
  return `${item.kind}-${item.id}`;
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
      className="items-center px-4 py-14"
    >
      <View className="size-14 items-center justify-center rounded-full bg-primary-soft">
        <Users color={colors.primary} size={26} />
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
          <Text variant="label" className="font-semibold text-primary-foreground">
            Try again
          </Text>
        </TactilePressable>
      ) : null}
    </Animated.View>
  );
}

/** One row-shaped placeholder, matching ContactRow so the list does not reflow when the directory lands. */
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

type ContactListProps = {
  view: ContactDirectoryView;
  /** What the search field says it searches. */
  searchPlaceholder?: string;
  /** Extra space under the last row — a tab bar, a home indicator. */
  contentStyle?: ViewStyle;
  /** Pull-to-refresh. The compose sheet has no room for the gesture; the tab does. */
  pullToRefresh?: boolean;
};

export function ContactList({
  view,
  searchPlaceholder = "Search people…",
  contentStyle,
  pullToRefresh = false,
}: ContactListProps) {
  const [chip, setChip] = useState<ContactChip>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { contacts, directory, intentFor, start, busyId, refusal } = view;

  const chips = useMemo(() => contactChips(contacts), [contacts]);
  // A chip the narrowed list no longer offers would filter to nothing with no
  // way back, so the fallback is the whole list rather than an empty one.
  const active = chips.includes(chip) ? chip : "all";
  const visible = useMemo(() => narrowContacts(contacts, active), [contacts, active]);

  const handlePress = useCallback(
    (contact: Contact) => {
      const intent = intentFor(contact);
      if (intent.kind === "choose") {
        setExpandedId((current) => (current === contact.id ? null : contact.id));
        return;
      }
      start(contact);
    },
    [intentFor, start],
  );

  const handlePickOrganization = useCallback(
    (contact: Contact, organizationId: string) => {
      setExpandedId(null);
      start(contact, organizationId);
    },
    [start],
  );

  const renderItem = useCallback(
    ({ item }: { item: Contact }) => (
      <ContactRow
        contact={item}
        intent={intentFor(item)}
        onPress={handlePress}
        onPickOrganization={handlePickOrganization}
        busy={busyId === item.id}
        expanded={expandedId === item.id}
        refusal={refusal?.id === item.id ? refusal.message : null}
      />
    ),
    [busyId, expandedId, handlePickOrganization, handlePress, intentFor, refusal],
  );

  return (
    <View className="flex-1 bg-bg">
      <View className="border-b border-line/60 bg-surface px-4 pb-3.5 pt-2">
        <SearchFieldWithClear
          value={view.query}
          onChangeText={view.setQuery}
          placeholder={searchPlaceholder}
          accessibilityLabel="Search people"
        />

        {chips.length > 0 ? (
          <View className="mt-3 flex-row flex-wrap gap-2">
            {chips.map((item) => {
              const selected = item === active;
              return (
                <TactilePressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityLabel={contactChipLabel(item)}
                  accessibilityState={{ selected }}
                  onPress={() => setChip(item)}
                  className={cn(
                    "min-h-9 justify-center rounded-full border px-3.5",
                    selected
                      ? "border-transparent bg-primary shadow-sm shadow-primary/25"
                      : "border-line/80 bg-line/35",
                  )}
                >
                  <Text
                    variant="label"
                    className={selected ? "text-primary-foreground" : "text-ink-soft"}
                  >
                    {contactChipLabel(item)}
                  </Text>
                </TactilePressable>
              );
            })}
          </View>
        ) : null}
      </View>

      <FlatList
        className="flex-1 bg-bg"
        data={visible}
        keyExtractor={keyExtractor}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={5}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-4 py-3"
        contentContainerStyle={contentStyle}
        ItemSeparatorComponent={ContactItemSeparator}
        renderItem={renderItem}
        refreshControl={
          pullToRefresh ? makeRefreshControl(view.refreshing, view.refresh) : undefined
        }
        ListEmptyComponent={
          directory.status === "loading" ? (
            <View accessibilityLabel="Loading contacts" className="gap-2.5">
              <DirectoryLoadingRow />
              <DirectoryLoadingRow />
              <DirectoryLoadingRow />
            </View>
          ) : directory.status === "failed" ? (
            <DirectoryNotice
              title={directory.title}
              hint={directory.hint}
              onRetry={view.retry}
            />
          ) : view.query.trim() ? (
            <DirectoryNotice
              title="No people match your search"
              hint="Check the spelling, or try a shorter name."
            />
          ) : (
            <DirectoryNotice
              title="Nobody to message yet"
              hint="People from your organizations appear here once they join."
            />
          )
        }
      />
    </View>
  );
}
