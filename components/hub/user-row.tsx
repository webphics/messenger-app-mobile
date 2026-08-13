import { Pressable, View } from "react-native";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Text } from "@/components/ui/text";
import { initials } from "@/lib/display";
import { mockEmail } from "@/lib/user-filter";
import type { Person } from "@/lib/types";

const ROLE_LABEL = {
  admin: "Admin",
  agent: "Agent",
  contact: "Contact",
} as const;

type UserRowProps = {
  person: Person;
  open: boolean;
  onPress: () => void;
};

export function UserRow({ person, open, onPress }: UserRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={person.displayName}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      className="rounded-2xl border border-line bg-surface p-4 shadow-md shadow-black/10"
    >
      <View className="flex-row items-center gap-3">
        <View className="relative">
          <Avatar alt={person.displayName} className="size-12">
            <AvatarFallback className="bg-primary-soft">
              <Text className="font-sans text-sm font-semibold text-primary">
                {initials(person.displayName)}
              </Text>
            </AvatarFallback>
          </Avatar>
          {person.isOnline ? (
            <View
              accessibilityLabel="Online"
              className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-surface bg-success"
            />
          ) : null}
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-sans text-base font-medium text-ink" numberOfLines={1}>
            {person.displayName}
          </Text>
          <Text className="mt-0.5 font-sans text-sm font-normal text-muted" numberOfLines={1}>
            {ROLE_LABEL[person.role]} · {person.lastActiveLabel}
          </Text>
        </View>
      </View>
      {open ? (
        <View className="mt-3 border-t border-line pt-3">
          <Text className="font-sans text-sm font-normal text-ink-soft" selectable>
            {mockEmail(person.displayName)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
