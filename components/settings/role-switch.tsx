import { router } from "expo-router";
import { Check, Headphones, ShieldCheck, User } from "@/components/icons";
import { View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { ROLE_HREF } from "@/lib/hub-routes";
import { popEnter } from "@/lib/motion-enter";
import { getSession, setSessionRole } from "@/lib/session";
import { colors } from "@/lib/tokens";
import type { UserRole } from "@/lib/types";

const ROLES: {
  id: UserRole;
  label: string;
  desc: string;
  icon: typeof User;
}[] = [
  {
    id: "contact",
    label: "Contact",
    desc: "Customer view — access personal messages & help center",
    icon: User,
  },
  {
    id: "agent",
    label: "Agent",
    desc: "Support view — manage your assigned queue & unassigned pool",
    icon: Headphones,
  },
  {
    id: "admin",
    label: "Admin",
    desc: "Executive view — global oversight, user management & charts",
    icon: ShieldCheck,
  },
];

export function RoleSwitch() {
  const selected = getSession().role;
  const reduceMotion = useReducedMotion();

  return (
    <View className="mt-2 gap-2.5">
      <Text className="font-sans text-xs font-semibold uppercase tracking-wider text-muted">
        Select Active Role (Mock Switcher)
      </Text>
      {ROLES.map((item) => {
        const active = item.id === selected;
        const Icon = item.icon;
        return (
          <TactilePressable
            key={item.id}
            haptic="selection"
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            onPress={() => {
              void setSessionRole(item.id).then((blob) => {
                router.replace(ROLE_HREF[blob.role]);
              });
            }}
            className={cn(
              "flex-row items-center gap-3.5 rounded-2xl border p-3.5",
              active
                ? "border-primary bg-primary-soft/50 shadow-sm shadow-black/5"
                : "border-line bg-bg",
            )}
          >
            <View
              className={`size-10 items-center justify-center rounded-xl ${
                active ? "bg-primary" : "bg-surface border border-line"
              }`}
            >
              <Icon
                color={active ? colors.primaryForeground : colors.inkSoft}
                size={20}
              />
            </View>

            <View className="min-w-0 flex-1">
              <Text
                className={cn(
                  "font-sans text-base font-bold",
                  active ? "text-primary" : "text-ink",
                )}
              >
                {item.label}
              </Text>
              <Text
                className="mt-0.5 font-sans text-xs font-normal text-muted"
                numberOfLines={2}
              >
                {item.desc}
              </Text>
            </View>

            {active ? (
              <Animated.View
                entering={popEnter(!!reduceMotion)}
                className="size-6 items-center justify-center rounded-full bg-primary"
              >
                <Check color={colors.primaryForeground} size={14} />
              </Animated.View>
            ) : null}
          </TactilePressable>
        );
      })}
    </View>
  );
}
