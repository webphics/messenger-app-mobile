import { UserX } from "@/components/icons";
import { useCallback, useMemo, useState } from "react";
import { FlatList, View } from "react-native";

import { UserRow } from "@/components/hub/user-row";
import { SearchFieldWithClear } from "@/components/search-field-with-clear";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { PEOPLE } from "@/lib/mock-data";
import {
  makeRefreshControl,
  useSimulatedRefresh,
} from "@/lib/simulated-refresh";
import { colors } from "@/lib/tokens";
import { filterUsers, type UserRoleChip } from "@/lib/user-filter";
import type { Person } from "@/lib/types";

const CHIPS: { id: UserRoleChip; label: string }[] = [
  { id: "all", label: "All" },
  { id: "admin", label: "Admin" },
  { id: "agent", label: "Agent" },
  { id: "contact", label: "Contact" },
];

function keyExtractor(item: Person) {
  return item.id;
}

function UsersItemSeparator() {
  return <View className="h-3" />;
}

export function UsersScreen() {
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<UserRoleChip>("all");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const { refreshing, onRefresh } = useSimulatedRefresh(() => {
    setEpoch((n) => n + 1);
  });

  const visible = useMemo(() => {
    void epoch;
    return filterUsers(PEOPLE, query, chip, onlineOnly);
  }, [query, chip, onlineOnly, epoch]);
  const onlineCount = PEOPLE.filter((p) => p.isOnline).length;

  const toggleOpen = useCallback((personId: string) => {
    setOpenId((current) => (current === personId ? null : personId));
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: Person; index: number }) => (
      <UserRow
        person={item}
        open={item.id === openId}
        onPress={toggleOpen}
        index={index}
      />
    ),
    [openId, toggleOpen],
  );

  return (
    <View className="flex-1 bg-bg">
      <View className="border-b border-line/60 bg-surface px-4 pb-3.5 pt-2">
        <SearchFieldWithClear
          value={query}
          onChangeText={setQuery}
          placeholder="Search users by name…"
          accessibilityLabel="Search people"
        />

        <View className="mt-3 flex-row flex-wrap items-center gap-2">
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

          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Online only"
            accessibilityState={{ selected: onlineOnly }}
            onPress={() => setOnlineOnly((v) => !v)}
            className={cn(
              "min-h-9 flex-row items-center gap-1.5 justify-center rounded-full border px-3.5",
              onlineOnly
                ? "border-transparent bg-success text-white shadow-sm shadow-black/10"
                : "border-line bg-bg",
            )}
          >
            <View
              className={`size-2 rounded-full ${onlineOnly ? "bg-white" : "bg-success"}`}
            />
            <Text
              className={cn(
                "font-sans text-xs font-semibold",
                onlineOnly ? "text-white" : "text-ink-soft",
              )}
            >
              Online ({onlineCount})
            </Text>
          </TactilePressable>
        </View>

        <Text className="mt-2.5 font-sans text-xs font-medium text-muted">
          Showing {visible.length} of {PEOPLE.length} members
        </Text>
      </View>

      <FlatList
        className="flex-1 bg-bg"
        extraData={openId}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        data={visible}
        keyExtractor={keyExtractor}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={5}
        contentContainerClassName="px-4 py-3"
        ItemSeparatorComponent={UsersItemSeparator}
        renderItem={renderItem}
        ListEmptyComponent={
          <View className="items-center px-4 py-16">
            <View className="size-14 items-center justify-center rounded-full bg-primary-soft">
              <UserX color={colors.primary} size={26} />
            </View>
            <Text className="mt-4 font-sans text-base font-semibold text-ink">
              No matching users found
            </Text>
            <Text className="mt-1 text-center font-sans text-sm font-normal text-muted">
              Try adjusting your search query or role filter.
            </Text>
          </View>
        }
        refreshControl={makeRefreshControl(refreshing, onRefresh)}
      />
    </View>
  );
}
