import { router, type Href } from "expo-router";
import { Bell, Settings } from "@/components/icons";
import { Image, View } from "react-native";

// import { Avatar, AvatarFallback } from "@/components/ui/avatar"; // hidden with the agent stack
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
// import { initials } from "@/lib/display"; // hidden with the agent stack
// import { getSession } from "@/lib/session"; // hidden with the agent stack
// import { PEOPLE } from "@/lib/mock-data"; // hidden with the agent stack
import { useNotificationBadge } from "@/lib/notification-badge";
import { unreadBadgeLabel } from "@/lib/notification-feed";
import { colors } from "@/lib/tokens";

/** The feed, which every role reaches the same way. */
const NOTIFICATIONS_HREF = "/notifications" as Href;

/** Intrinsic ratios of `brand-mark.png` (600x447) and `brand-wordmark.png` (1200x196). */
const BRAND_MARK_ASPECT = 600 / 447;
const BRAND_WORDMARK_ASPECT = 1200 / 196;

type HubHeaderProps = {
  settingsHref: Href;
};

export function HubHeader({ settingsHref }: HubHeaderProps) {
  const { unreadCount } = useNotificationBadge();
  const badge = unreadBadgeLabel(unreadCount);

  // Hidden with the agent stack below — it read `PEOPLE` from `lib/mock-data`.
  // const showAgentStack = getSession().role !== "customer";
  // const agents = showAgentStack
  //   ? PEOPLE.filter((p) => p.role === "agent")
  //   : [];

  return (
    <View className="flex-row items-center justify-between">
      {/* The mark and the wordmark, side by side. Both are images: the
          wordmark's R is drawn, so typing the name would lose it. One label for
          the pair, since they say one thing. */}
      <View
        className="flex-row items-center gap-2"
        accessible
        accessibilityRole="image"
        accessibilityLabel="ChatRoute"
      >
        <Image
          source={require("../../assets/images/brand-mark.png")}
          style={{ height: 28, width: 28 * BRAND_MARK_ASPECT }}
          resizeMode="contain"
        />
        <Image
          source={require("../../assets/images/brand-wordmark.png")}
          style={{ height: 18, width: 18 * BRAND_WORDMARK_ASPECT }}
          resizeMode="contain"
        />
      </View>

      {/* Right Actions: Notifications, Settings */}
      <View className="flex-row items-center gap-3">
        {/* The "agents online" avatar stack is hidden for now. It was drawn from
            `PEOPLE` in `lib/mock-data` rather than from anything the API knows,
            so it showed three invented names and claimed a presence feature this
            app does not have. Restore by uncommenting. */}
        {/* {agents.length > 0 ? (
          <View className="flex-row">
            {agents.map((agent, i) => (
              <Avatar
                key={agent.id}
                alt={agent.displayName}
                className="size-9 border-2 border-bg shadow-sm shadow-black/10"
                style={{ marginLeft: i === 0 ? 0 : -10 }}
              >
                <AvatarFallback className="bg-primary-soft">
                  <Text variant="label" className="text-primary">
                    {initials(agent.displayName)}
                  </Text>
                </AvatarFallback>
              </Avatar>
            ))}
          </View>
        ) : null} */}
        {/* The bell, rather than a fifth slot on the Tab capsule: the capsule
            is where somebody works, and this is where they catch up. The count
            is in the accessible name because a pressable collapses what it
            contains, so a badge drawn inside it is a number nobody can reach. */}
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel={badge ? `Notifications, ${badge} unread` : "Notifications"}
          onPress={() => router.push(NOTIFICATIONS_HREF)}
          className="size-11 items-center justify-center rounded-full bg-surface border border-line/60 shadow-sm shadow-black/5"
        >
          <Bell color={colors.ink} size={20} />
          {badge ? (
            <View
              pointerEvents="none"
              className="absolute -right-1 -top-1 min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-bg bg-primary px-1"
            >
              <Text variant="label" className="text-[10px] font-bold tabular-nums text-primary-foreground">
                {badge}
              </Text>
            </View>
          ) : null}
        </TactilePressable>
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push(settingsHref)}
          className="size-11 items-center justify-center rounded-full bg-surface border border-line/60 shadow-sm shadow-black/5"
        >
          <Settings color={colors.ink} size={20} />
        </TactilePressable>
      </View>
    </View>
  );
}
