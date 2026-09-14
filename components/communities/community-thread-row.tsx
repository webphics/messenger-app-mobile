import { memo, useCallback } from "react";
import { View } from "react-native";

import { BellOff, Megaphone } from "@/components/icons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { formatRelativeTime, initials } from "@/lib/display";
import { colors } from "@/lib/tokens";
import type { CommunityThreadRow } from "@/lib/types";

type CommunityThreadRowProps = {
  row: CommunityThreadRow;
  onPress: (conversationId: string) => void;
  /** Inside a Community, the rows are indented under it; on its own screen they are not. */
  inset?: boolean;
};

/** A room nobody has written in yet is not broken; it says so. */
const NO_MESSAGES = "No messages yet";

/**
 * One conversation inside a Community: its Announcements thread, or a Group the
 * viewer is in.
 *
 * Not `ConversationRow`. That component is keyed to a `Conversation` — presence,
 * labels, the staff and customer shapes — and a feed row carries none of it;
 * this is the narrower row `GET /communities/:id/groups` actually hands over.
 * What it draws is the same four things a conversation row draws, because to
 * whoever is looking it is the same kind of thing: a name, what was last said in
 * it, when, and how much of it they have not read.
 *
 * A tap opens the conversation rather than the Community. That is the whole
 * point of expanding one in place.
 */
export const CommunityThreadRowView = memo(function CommunityThreadRowView({
  row,
  onPress,
  inset = true,
}: CommunityThreadRowProps) {
  const announcements = row.kind === "announcements";
  const { unreadCount } = row;
  const hasUnread = unreadCount > 0;
  // Only a Group is ever muted. The feed says so for one, and says nothing at
  // all about the Announcements thread — which is the honest answer, because
  // nothing else in the payload does either.
  const muted = !announcements && row.muted;

  const handlePress = useCallback(() => {
    onPress(row.id);
  }, [row.id, onPress]);

  return (
    <TactilePressable
      accessibilityRole="button"
      accessibilityLabel={
        hasUnread ? `${row.title}, ${unreadCount} unread` : row.title
      }
      onPress={handlePress}
      className={`mt-1.5 flex-row items-center gap-3 rounded-2xl border border-line/50 bg-surface/80 p-3 ${
        inset ? "ml-5" : ""
      }`}
    >
      <Avatar alt={row.title} className="size-11">
        <AvatarFallback className={announcements ? "bg-primary-soft" : "bg-line"}>
          {announcements ? (
            <Megaphone color={colors.primary} size={19} />
          ) : (
            <Text variant="label" className="font-bold text-ink-soft">
              {initials(row.title)}
            </Text>
          )}
        </AvatarFallback>
      </Avatar>

      <View className="min-w-0 flex-1">
        <View className="flex-row items-center justify-between gap-1">
          <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
            <Text
              variant="meta"
              className={hasUnread ? "font-bold text-ink" : "font-medium text-ink"}
              numberOfLines={1}
            >
              {row.title}
            </Text>
            {muted ? (
              <BellOff
                color={colors.muted}
                size={13}
                accessibilityLabel="Muted"
              />
            ) : null}
          </View>
          {row.lastMessageAt ? (
            <Text variant="label" className={hasUnread ? "text-ink-soft" : "font-normal text-muted"}>
              {formatRelativeTime(row.lastMessageAt)}
            </Text>
          ) : null}
        </View>

        <View className="mt-0.5 flex-row items-center justify-between gap-2">
          <Text
            variant="label"
            className={hasUnread ? "flex-1 font-semibold text-ink" : "flex-1 font-normal text-muted"}
            numberOfLines={1}
          >
            {row.lastMessagePreview?.trim() || NO_MESSAGES}
          </Text>
          {hasUnread ? (
            <View className="min-h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5">
              <Text variant="label" className="font-bold text-primary-foreground tabular-nums">
                {unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </TactilePressable>
  );
});
