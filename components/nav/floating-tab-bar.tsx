import type { ComponentProps } from "react";
import { useEffect } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tabs } from "expo-router";

import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { useCustomerInbox } from "@/lib/customer-inbox";
import { getDevUser } from "@/lib/dev-user";
import { CONVERSATIONS } from "@/lib/mock-data";
import { motion } from "@/lib/motion";
import {
  conversationsTabBadge,
  customerMessagesBadge,
  unassignedTabBadge,
} from "@/lib/tab-badges";
import { colors } from "@/lib/tokens";

type FloatingTabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

/** Matches capsule `px-1.5` — indicator lives in the padded content box. */
const CAPSULE_PAD = 6;

/**
 * The count on a tab, where there is one to show.
 *
 * A Customer's is the real unread total the API sends with their conversation
 * list, and it clears as soon as a thread is opened because the list it is
 * counted from is the one `CustomerInboxProvider` holds for every screen.
 *
 * The staff tabs still read the mock list, which is what their screens read
 * until #32.
 */
function badgeForRoute(
  name: string,
  /** A Customer's unread total, already summed. Undefined for every other role. */
  customerUnread: number | undefined,
): number | undefined {
  const user = getDevUser();
  if (user.role === "customer") {
    return name === "messages" ? customerUnread : undefined;
  }
  if (name === "unassigned") return unassignedTabBadge(CONVERSATIONS);
  if (name === "conversations" || name === "messages") {
    return conversationsTabBadge(user.role, user.id, CONVERSATIONS);
  }
  return undefined;
}

/**
 * Floating Clear Desk tab capsule for Customer/Agent/Admin.
 * Icon-only: `options.title` is not rendered, but still feeds the
 * `accessibilityLabel` below so screen readers keep every destination name.
 */
export function FloatingTabBar({
  state,
  descriptors,
  navigation,
}: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const tabCount = state.routes.length;
  const inbox = useCustomerInbox();
  const customerUnread =
    inbox.status === "ready" ? customerMessagesBadge(inbox.conversations) : undefined;

  const tabWidth = useSharedValue(0);
  const activeIndex = useSharedValue(state.index);

  useEffect(() => {
    if (reduceMotion) {
      activeIndex.value = state.index;
      return;
    }
    activeIndex.value = withSpring(state.index, motion.springs.overlay);
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
        className="relative flex-row items-center rounded-full border border-line/80 bg-surface/95 px-1.5 py-1.5 shadow-xl shadow-black/15"
        accessibilityRole="tablist"
      >
        <Animated.View
          pointerEvents="none"
          className="absolute bottom-1.5 top-1.5 left-0 rounded-full bg-primary-soft border border-primary/20 shadow-xs shadow-primary/10"
          style={indicatorStyle}
        />
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const color = focused ? colors.primary : colors.muted;
          const label = options.title ?? route.name;
          const badge = badgeForRoute(route.name, customerUnread);

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
              className="z-10 min-h-12 flex-1"
            >
              <View className="min-h-12 items-center justify-center px-1 py-2.5">
                <View className="relative items-center">
                  {options.tabBarIcon?.({ focused, color, size: 24 })}
                  {badge != null ? (
                    <View className="absolute -right-2.5 -top-1 min-w-4 items-center rounded-full bg-primary px-1 py-px">
                      <Text variant="label" className="text-primary-foreground tabular-nums">
                        {badge > 99 ? "99+" : String(badge)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </TactilePressable>
          );
        })}
      </View>
    </View>
  );
}
