import type { ComponentProps } from "react";
import { useEffect } from "react";
import { View, Text, type LayoutChangeEvent } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tabs } from "expo-router";

import { TactilePressable } from "@/components/ui/tactile-pressable";
import { cn } from "@/lib/cn";
import { getDevUser } from "@/lib/dev-user";
import { CONVERSATIONS } from "@/lib/mock-data";
import {
  conversationsTabBadge,
  unassignedTabBadge,
} from "@/lib/tab-badges";
import { colors } from "@/lib/tokens";

type FloatingTabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

/** Matches capsule `px-1.5` — indicator lives in the padded content box. */
const CAPSULE_PAD = 6;

const INDICATOR_SPRING = {
  damping: 22,
  stiffness: 320,
  mass: 0.55,
};

function labelFor(
  options: FloatingTabBarProps["descriptors"][string]["options"],
  focused: boolean,
  color: string,
): string {
  const raw = options.tabBarLabel;
  if (typeof raw === "string") return raw;
  if (typeof raw === "function") {
    const node = raw({
      focused,
      color,
      position: "below-icon",
      children: options.title ?? "",
    });
    return typeof node === "string" ? node : (options.title ?? "");
  }
  return options.title ?? "";
}

function badgeForRoute(name: string): number | undefined {
  const user = getDevUser();
  if (name === "unassigned") return unassignedTabBadge(CONVERSATIONS);
  if (name === "conversations") {
    return conversationsTabBadge(user.role, user.id, CONVERSATIONS);
  }
  return undefined;
}

/**
 * Floating Clear Desk tab capsule for Agent/Admin.
 * Structure inspired by floating docks; materials stay Enki (surface, Beacon Mist, Enki Blue).
 */
export function FloatingTabBar({
  state,
  descriptors,
  navigation,
}: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const tabCount = state.routes.length;

  const tabWidth = useSharedValue(0);
  const activeIndex = useSharedValue(state.index);

  useEffect(() => {
    if (reduceMotion) {
      activeIndex.value = state.index;
      return;
    }
    activeIndex.value = withSpring(state.index, INDICATOR_SPRING);
  }, [state.index, reduceMotion, activeIndex]);

  const onCapsuleLayout = (e: LayoutChangeEvent) => {
    const inner = e.nativeEvent.layout.width - CAPSULE_PAD * 2;
    if (inner <= 0 || tabCount === 0) return;
    // Width is layout-derived; set once — do not animate layout props.
    tabWidth.value = inner / tabCount;
  };

  const indicatorStyle = useAnimatedStyle(() => ({
    width: tabWidth.value,
    transform: [
      { translateX: CAPSULE_PAD + activeIndex.value * tabWidth.value },
    ],
  }));

  return (
    <View
      className="bg-transparent px-4"
      style={{ paddingBottom: Math.max(insets.bottom, 8) + 8 }}
      pointerEvents="box-none"
    >
      <View
        onLayout={onCapsuleLayout}
        className="relative flex-row items-center rounded-full border border-line bg-surface px-1.5 py-1.5 shadow-lg shadow-black/10"
        accessibilityRole="tablist"
      >
        <Animated.View
          pointerEvents="none"
          className="absolute bottom-1.5 top-1.5 left-0 rounded-full bg-primary-soft"
          style={indicatorStyle}
        />
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const color = focused ? colors.primary : colors.muted;
          const label = labelFor(options, focused, color);
          const badge = badgeForRoute(route.name);

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          return (
            <TactilePressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={
                options.tabBarAccessibilityLabel ??
                (badge != null ? `${label}, ${badge}` : label)
              }
              onPress={onPress}
              onLongPress={onLongPress}
              haptic="selection"
              className="z-10 min-h-11 flex-1"
            >
              <View className="min-h-11 items-center justify-center px-1 py-1.5">
                <View className="relative items-center">
                  {options.tabBarIcon?.({ focused, color, size: 22 })}
                  {badge != null ? (
                    <View className="absolute -right-3 -top-1.5 min-w-4 items-center rounded-full bg-primary px-1 py-px">
                      <Text className="font-sans text-[10px] font-semibold leading-3 text-primary-foreground tabular-nums">
                        {badge > 99 ? "99+" : String(badge)}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  numberOfLines={1}
                  className={cn(
                    "mt-0.5 max-w-full px-0.5 text-center font-sans text-[10px] font-semibold",
                    focused ? "text-primary" : "text-muted",
                  )}
                >
                  {label}
                </Text>
              </View>
            </TactilePressable>
          );
        })}
      </View>
    </View>
  );
}
