import type { ComponentProps } from "react";
import type { Conversation } from "@/lib/types";
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
import { useConversationInbox } from "@/lib/conversation-inbox";
import { motion } from "@/lib/motion";
import { getSessionUser } from "@/lib/session";
import { inboxTabBadge, unassignedTabBadge } from "@/lib/tab-badges";
import { useSupportAssignment } from "@/lib/use-support-assignment";
import { colors } from "@/lib/tokens";

type FloatingTabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

/** Matches capsule `px-1.5` — indicator lives in the padded content box. */
const CAPSULE_PAD = 6;

/**
 * The count on a tab, where there is one to show.
 *
 * Every count is real and every one clears as soon as the thread behind it is
 * opened, because they are all read off the single list
 * `ConversationInboxProvider` holds for every screen — a Customer's unread
 * total, an Agent's and an Admin's, and the size of the unassigned pool beside
 * them.
 *
 * Nothing while the first fetch is out: an empty list is not yet a fact, and a
 * badge that appears a moment later is better than one that says zero and then
 * disagrees with the screen it sits under.
 */
function badgeForRoute(
  name: string,
  conversations: Conversation[] | null,
  supportAssignment: boolean,
): number | undefined {
  const user = getSessionUser();
  if (!conversations || !user) return undefined;

  if (name === "unassigned") {
    return user.role === "customer"
      ? undefined
      : unassignedTabBadge(conversations, supportAssignment);
  }
  if (name === "conversations" || name === "messages") return inboxTabBadge(conversations);
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
  const inbox = useConversationInbox();
  const conversations = inbox.status === "ready" ? inbox.conversations : null;
  const supportAssignment = useSupportAssignment();

  const tabWidth = useSharedValue(0);
  const activeIndex = useSharedValue(state.index);

  useEffect(() => {
    if (reduceMotion) {
      activeIndex.set(state.index);
      return;
    }
    activeIndex.set(withSpring(state.index, motion.springs.overlay));
  }, [state.index, reduceMotion, activeIndex]);

  const onCapsuleLayout = (e: LayoutChangeEvent) => {
    const inner = e.nativeEvent.layout.width - CAPSULE_PAD * 2;
    if (inner <= 0 || tabCount === 0) return;
    // Width is layout-derived; set once — do not animate layout props.
    tabWidth.set(inner / tabCount);
  };

  const indicatorStyle = useAnimatedStyle(() => ({
    width: tabWidth.get(),
    transform: [
      { translateX: CAPSULE_PAD + activeIndex.get() * tabWidth.get() },
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
          const badge = badgeForRoute(route.name, conversations, supportAssignment);

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
