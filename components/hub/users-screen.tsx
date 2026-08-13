import { useMemo, useState } from "react";
import { FlatList, Pressable, View } from "react-native";

import { UserRow } from "@/components/hub/user-row";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { PEOPLE } from "@/lib/mock-data";
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
      <View className="bg-surface px-4 pb-3 pt-2">
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search people"
          accessibilityLabel="Search people"
          className="h-11 rounded-full border-line bg-bg shadow-none"
        />
        <View className="mt-3 flex-row flex-wrap gap-2">
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
                  selected ? "border-transparent bg-primary-soft" : "border-line bg-bg",
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Online only"
            accessibilityState={{ selected: onlineOnly }}
            onPress={() => setOnlineOnly((v) => !v)}
            className={cn(
              "min-h-11 justify-center rounded-full border px-4",
              onlineOnly ? "border-transparent bg-primary-soft" : "border-line bg-bg",
            )}
          >
            <Text
              className={cn(
                "font-sans text-sm font-medium",
                onlineOnly ? "text-primary" : "text-ink-soft",
              )}
            >
              Online
            </Text>
          </Pressable>
        </View>
        <Text className="mt-3 font-sans text-sm font-normal text-muted">
          {visible.length} shown · {onlineCount} online
        </Text>
      </View>
      <FlatList
        className="flex-1 bg-bg"
        extraData={openId}
        showsVerticalScrollIndicator={false}
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
          <Text className="px-4 py-8 text-center font-sans text-sm font-normal text-muted">
            No people
          </Text>
        }
      />
    </View>
  );
}
