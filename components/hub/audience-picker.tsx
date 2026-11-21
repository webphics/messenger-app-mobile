import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View, type ListRenderItem } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Check, ChevronLeft } from "@/components/icons";
import { SearchFieldWithClear } from "@/components/search-field-with-clear";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { toggleInSet, type AudienceOption } from "@/lib/broadcast-audience";
import { cn } from "@/lib/cn";
import { colors, screenBottomPad } from "@/lib/tokens";

/**
 * Choosing one kind of Broadcast audience, drawn inside the composer's sheet in
 * place of its step rather than as a sheet of its own.
 *
 * Picking runs on a draft, as on web: Done commits it and Back throws it away.
 * The list is virtualised and its rows are plain `Pressable`s, memoised on
 * whether they are checked, because the list can be every group there is and
 * an animated node per row is what froze the phone in #25. The search belongs
 * to whoever owns the rows — groups are searched on the API, the rest here.
 */

type AudiencePickerProps = {
  title: string;
  searchPlaceholder: string;
  search: string;
  onSearchChange: (search: string) => void;
  options: readonly AudienceOption[];
  status: "loading" | "ready" | "failed";
  /** What an empty list says, given whether something was searched for. */
  emptyHint: (searching: boolean) => string;
  failedHint: string;
  onRetry?: () => void;
  loadingMore?: boolean;
  onEndReached?: () => void;
  initial: readonly string[];
  onCancel: () => void;
  /** The chosen ids, and the names of every row this picker drew. */
  onDone: (ids: string[], names: ReadonlyMap<string, string>) => void;
};

export function AudiencePicker({
  title,
  searchPlaceholder,
  search,
  onSearchChange,
  options,
  status,
  emptyHint,
  failedHint,
  onRetry,
  loadingMore = false,
  onEndReached,
  initial,
  onCancel,
  onDone,
}: AudiencePickerProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<ReadonlySet<string>>(() => new Set(initial));
  // Names of the rows drawn so far, so a choice made before the search changed is still named.
  const names = useRef(new Map<string, string>());
  useEffect(() => {
    for (const option of options) names.current.set(option.id, option.name);
  }, [options]);

  const toggle = useCallback((id: string) => setDraft((held) => toggleInSet(held, id)), []);

  const renderItem = useCallback<ListRenderItem<AudienceOption>>(
    ({ item }) => <AudienceRow option={item} checked={draft.has(item.id)} onToggle={toggle} />,
    [draft, toggle],
  );

  return (
    <View className="flex-1 bg-bg">
      <View className="flex-row items-center gap-2 border-b border-line/60 bg-surface px-2 pb-3">
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Back without saving"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={onCancel}
          className="size-11 items-center justify-center rounded-full"
        >
          <ChevronLeft color={colors.inkSoft} size={22} />
        </TactilePressable>
        <Text variant="headline" className="min-w-0 flex-1 text-ink" numberOfLines={1}>
          {title}
        </Text>
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel={`Done, ${draft.size} chosen`}
          onPress={() => onDone([...draft], names.current)}
          className="min-h-11 justify-center rounded-full bg-primary px-4"
        >
          <Text variant="label" className="font-semibold text-primary-foreground">
            Done
          </Text>
        </TactilePressable>
      </View>

      <View className="gap-2 px-4 pt-3 pb-2">
        <SearchFieldWithClear
          value={search}
          onChangeText={onSearchChange}
          placeholder={searchPlaceholder}
          accessibilityLabel={`Search ${title.toLowerCase()}`}
          returnKeyType="search"
        />
        <View className="flex-row items-center justify-between">
          <Text variant="meta" className="tabular-nums text-muted">
            {draft.size} chosen
          </Text>
          {draft.size > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear all chosen"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              onPress={() => setDraft(new Set())}
            >
              <Text variant="meta" className="font-semibold text-primary">
                Clear
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {status === "loading" ? (
        <View className="items-center py-8" accessibilityLabel="Loading…">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : status === "failed" ? (
        <View className="items-center gap-3 px-6 py-8">
          <Text variant="meta" className="text-center text-muted">
            {failedHint}
          </Text>
          {onRetry ? (
            <TactilePressable
              accessibilityRole="button"
              onPress={onRetry}
              className="min-h-11 justify-center rounded-full border border-line/80 px-4"
            >
              <Text variant="label" className="text-ink">
                Try again
              </Text>
            </TactilePressable>
          ) : null}
        </View>
      ) : (
        <FlatList
          className="flex-1"
          data={options as AudienceOption[]}
          extraData={draft}
          keyExtractor={keyOf}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={16}
          maxToRenderPerBatch={16}
          windowSize={7}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          contentContainerStyle={{ paddingBottom: screenBottomPad(insets.bottom, 12) }}
          ListEmptyComponent={
            <Text variant="meta" className="px-4 py-6 text-center text-muted">
              {emptyHint(search.trim() !== "")}
            </Text>
          }
          ListFooterComponent={
            loadingMore ? (
              <View className="py-4">
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : undefined
          }
        />
      )}
    </View>
  );
}

const keyOf = (option: AudienceOption) => option.id;

const AudienceRow = memo(function AudienceRow({
  option,
  checked,
  onToggle,
}: {
  option: AudienceOption;
  checked: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={option.meta ? `${option.name}, ${option.meta}` : option.name}
      accessibilityState={{ checked }}
      onPress={() => onToggle(option.id)}
      className="min-h-14 flex-row items-center gap-3 px-4 py-2 active:bg-line/40"
    >
      <View className="min-w-0 flex-1">
        <Text variant="label" numberOfLines={1} className="text-ink">
          {option.name}
        </Text>
        {option.meta ? (
          <Text variant="meta" numberOfLines={1} className="text-muted">
            {option.meta}
          </Text>
        ) : null}
      </View>
      <View
        className={cn(
          "size-6 items-center justify-center rounded-md border",
          checked ? "border-transparent bg-primary" : "border-line bg-surface",
        )}
      >
        {checked ? <Check color={colors.primaryForeground} size={16} /> : null}
      </View>
    </Pressable>
  );
});
