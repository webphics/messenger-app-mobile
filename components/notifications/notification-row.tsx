import { memo, useCallback } from "react";
import { View } from "react-native";

import {
  ArrowLeftRight,
  Bell,
  Building2,
  Megaphone,
  MessageCircle,
  Newspaper,
  SmilePlus,
  UserPlus,
  Users,
  type IconComponent,
} from "@/components/icons";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { formatRelativeTime } from "@/lib/display";
import { colors } from "@/lib/tokens";
import type { AppNotification } from "@/lib/types";

/** What each kind is drawn with. A kind this build does not know is a bell. */
const KIND_ICON: Readonly<Record<string, IconComponent>> = {
  message: MessageCircle,
  message_reaction: SmilePlus,
  wall_post_reaction: SmilePlus,
  conversation_engaged: ArrowLeftRight,
  conversation_transferred: ArrowLeftRight,
  broadcast: Megaphone,
  organization_invitation: Building2,
  group_member_added: Users,
  group_join_requested: Users,
  group_join_request_approved: Users,
  group_join_request_declined: Users,
  wall_post: Newspaper,
  customer_registered: UserPlus,
  customer_joined_organization: UserPlus,
};

type NotificationRowProps = {
  notification: AppNotification;
  onPress: (notification: AppNotification) => void;
};

/**
 * One row of the feed. Unread is said three ways — a dot, a heavier title and a
 * tinted tile — so it is never carried by colour alone, and said once more in
 * the accessible name, since a pressable collapses what it contains.
 *
 * No entrance, for the reason a conversation row has none: the list window
 * mounts rows as they scroll in, and an animation would replay every time.
 */
export const NotificationRow = memo(function NotificationRow({
  notification,
  onPress,
}: NotificationRowProps) {
  const unread = notification.readAt === null;
  const Icon = KIND_ICON[notification.kind] ?? Bell;
  const time = formatRelativeTime(notification.createdAt);

  const handlePress = useCallback(() => onPress(notification), [notification, onPress]);

  return (
    <TactilePressable
      accessibilityRole="button"
      accessibilityLabel={[unread ? "Unread" : null, notification.title, notification.body, time]
        .filter(Boolean)
        .join(", ")}
      onPress={handlePress}
      className={cn(
        "flex-row items-start gap-3 rounded-3xl border p-4",
        unread
          ? "border-primary/20 bg-primary-soft/40"
          : "border-line/70 bg-surface",
      )}
    >
      <View
        className={cn(
          "size-11 items-center justify-center rounded-full",
          unread ? "bg-primary-soft" : "bg-line/40",
        )}
      >
        <Icon color={unread ? colors.primary : colors.muted} size={20} />
      </View>

      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Text
            variant="title"
            className={cn("min-w-0 flex-1", unread ? "font-bold text-ink" : "text-ink-soft")}
            numberOfLines={1}
          >
            {notification.title || "Notification"}
          </Text>
          {time ? (
            <Text
              variant="label"
              className={cn("tabular-nums", unread ? "text-ink-soft" : "font-normal text-muted")}
            >
              {time}
            </Text>
          ) : null}
        </View>
        {notification.body ? (
          <Text
            variant="meta"
            className={cn("mt-1", unread ? "text-ink" : "text-muted")}
            numberOfLines={2}
          >
            {notification.body}
          </Text>
        ) : null}
      </View>

      {unread ? <View className="mt-2 size-2.5 rounded-full bg-primary" /> : null}
    </TactilePressable>
  );
});
