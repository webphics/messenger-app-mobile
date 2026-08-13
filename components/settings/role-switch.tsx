import { router } from "expo-router";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { ROLE_HREF } from "@/lib/hub-routes";
import { getSession, setSessionRole } from "@/lib/session";
import type { UserRole } from "@/lib/types";

const ROLES: { id: UserRole; label: string }[] = [
  { id: "contact", label: "Contact" },
  { id: "agent", label: "Agent" },
  { id: "admin", label: "Admin" },
];

export function RoleSwitch() {
  const selected = getSession().role;

  return (
    <View className="mt-4 gap-2">
      <Text className="font-sans text-sm font-semibold text-ink">Role</Text>
      {ROLES.map((item) => {
        const active = item.id === selected;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            onPress={() => {
              void setSessionRole(item.id).then((blob) => {
                router.replace(ROLE_HREF[blob.role]);
              });
            }}
            className={cn(
              "min-h-11 justify-center rounded-xl border px-4",
              active
                ? "border-transparent bg-primary-soft"
                : "border-line bg-bg",
            )}
          >
            <Text
              className={cn(
                "font-sans text-base font-medium",
                active ? "text-primary" : "text-ink",
              )}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
