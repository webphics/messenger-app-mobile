import { memo, useCallback } from "react";
import { Megaphone } from "@/components/icons";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { View } from "react-native";

import { PresenceDot } from "@/components/ui/presence-dot";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { conversationTitle, otherParticipant } from "@/lib/conversation-title";
import { formatRelativeTime, initials } from "@/lib/display";
import { getDevUserId } from "@/lib/dev-user";
import { listItemEnter, popEnter } from "@/lib/motion-enter";
import { PEOPLE } from "@/lib/mock-data";
import { colors } from "@/lib/tokens";
import type { Conversation } from "@/lib/types";

type ConversationRowProps = {
  conversation: Conversation;
  onPress: (conversationId: string) => void;
  /** FlatList index — capped stagger onto the Clear Desk */
  index?: number;
};

export const ConversationRow = memo(function ConversationRow({
  conversation,
  onPress,
  index = 0,
}: ConversationRowProps) {
  const reduceMotion = useReducedMotion();
  const title = conversationTitle(conversation, PEOPLE, getDevUserId());
  const isOffers = conversation.id === "offers";
  const other = otherParticipant(conversation, PEOPLE, getDevUserId());
  const online = isOffers ? false : Boolean(other?.isOnline);
  const hasUnread = conversation.unreadCount > 0;

  const handlePress = useCallback(() => {
    onPress(conversation.id);
  }, [conversation.id, onPress]);

  return (
    <Animated.View entering={listItemEnter(!!reduceMotion, index)}>
      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel={title}
        onPress={handlePress}
        className="flex-row items-center gap-3.5 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5"
      >
        <View className="relative">
          <Avatar alt={title} className="size-13">
            {isOffers ? (
              <AvatarFallback className="bg-primary-soft">
                <Megaphone color={colors.primary} size={22} />
              </AvatarFallback>
            ) : (
              <AvatarFallback className="bg-primary-soft">
                <Text variant="title" className="font-bold text-primary">
                  {initials(title)}
                </Text>
              </AvatarFallback>
            )}
          </Avatar>
          {online ? (
            <PresenceDot className="absolute bottom-0 right-0 size-3.5 border-2 border-surface" />
          ) : null}
        </View>

        <View className="min-w-0 flex-1">
          <View className="flex-row items-center justify-between gap-1">
            <Text
              variant="title"
              className={hasUnread ? "font-bold text-ink" : "text-ink"}
              numberOfLines={1}
            >
              {title}
            </Text>
            <Text
              variant="label"
              className={
                hasUnread ? "text-ink-soft" : "font-normal text-muted"
              }
            >
              {formatRelativeTime(conversation.updatedAt)}
            </Text>
          </View>
          <Text
            variant="meta"
            className={
              hasUnread ? "mt-1 font-medium text-ink" : "mt-1 text-muted"
            }
            numberOfLines={1}
          >
            {conversation.lastMessagePreview}
          </Text>
        </View>

        {hasUnread ? (
          <Animated.View
            entering={popEnter(!!reduceMotion)}
            className="min-h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5"
          >
            <Text variant="label" className="font-bold text-primary-foreground">
              {conversation.unreadCount}
            </Text>
          </Animated.View>
        ) : null}
      </TactilePressable>
    </Animated.View>
  );
});
