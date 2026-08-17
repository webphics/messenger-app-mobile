import { Search, UserX, X } from "@/components/icons";
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";

import { UserRow } from "@/components/hub/user-row";
import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { PEOPLE } from "@/lib/mock-data";
import { colors } from "@/lib/tokens";
import { filterUsers, type UserRoleChip } from "@/lib/user-filter";

const CHIPS: { id: UserRoleChip; label: string }[] = [
  { id: "all", label: "All" },
  { id: "admin", label: "Admin" },
  { id: "agent", label: "Agent" },
  { id: "contact", label: "Contact" },
];

export function UsersScreen() {
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<UserRoleChip>("all");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const visible = useMemo(
    () => filterUsers(PEOPLE, query, chip, onlineOnly),
    [query, chip, onlineOnly],
  );
  const onlineCount = PEOPLE.filter((p) => p.isOnline).length;

  return (
    <View className="flex-1 bg-bg">
      <View className="border-b border-line/60 bg-surface px-4 pb-3.5 pt-2">
        <View className="relative flex-row items-center">
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Search users by name…"
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
              className="absolute right-2 size-7 items-center justify-center rounded-full bg-line/80"
            >
              <X color={colors.inkSoft} size={14} />
            </TactilePressable>
          ) : null}
        </View>

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
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-4 py-3"
        ItemSeparatorComponent={() => <View className="h-3" />}
        renderItem={({ item }) => (
          <UserRow
            person={item}
            open={item.id === openId}
            onPress={() => setOpenId(item.id === openId ? null : item.id)}
          />
        )}
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
      />
    </View>
  );
}
