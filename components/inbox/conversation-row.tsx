import { memo, useCallback } from "react";
import { Megaphone } from "@/components/icons";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { View } from "react-native";

import { PresenceDot } from "@/components/ui/presence-dot";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import {
  isConversationUnread,
  isOffersConversation,
} from "@/lib/conversation-list";
import { conversationPeer, conversationTitle } from "@/lib/conversation-title";
import { formatRelativeTime, initials } from "@/lib/display";
import { listItemEnter, popEnter } from "@/lib/motion-enter";
import { colors } from "@/lib/tokens";
import type { Conversation } from "@/lib/types";

type ConversationRowProps = {
  conversation: Conversation;
  onPress: (conversationId: string) => void;
  /** Names a Customer's own support thread, which carries no title of its own. */
  organizationNames?: ReadonlyMap<string, string>;
  /** FlatList index — capped stagger onto the Clear Desk */
  index?: number;
};

/** A conversation nobody has written in yet is not broken; it says so. */
const NO_MESSAGES = "No messages yet";

export const ConversationRow = memo(function ConversationRow({
  conversation,
  onPress,
  organizationNames,
  index = 0,
}: ConversationRowProps) {
  const reduceMotion = useReducedMotion();
  const title = conversationTitle(conversation, organizationNames);
  const broadcast =
    isOffersConversation(conversation) ||
    conversation.type === "community_announcement";
  const online = conversationPeer(conversation)?.isOnline === true;
  const hasUnread = isConversationUnread(conversation);
  const unreadCount = conversation.unreadCount ?? 0;

  const handlePress = useCallback(() => {
    onPress(conversation.id);
  }, [conversation.id, onPress]);

  return (
    <Animated.View entering={listItemEnter(!!reduceMotion, index)}>
      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel={title}
        onPress={handlePress}
        className="flex-row items-center gap-3.5 rounded-3xl border border-line/70 bg-surface p-4 shadow-md shadow-black/8"
      >
        <View className="relative">
          <Avatar alt={title} className="size-13">
            {broadcast ? (
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
            {conversation.lastMessageAt ? (
              <Text
                variant="label"
                className={
                  hasUnread ? "text-ink-soft" : "font-normal text-muted"
                }
              >
                {formatRelativeTime(conversation.lastMessageAt)}
              </Text>
            ) : null}
          </View>
          <Text
            variant="meta"
            className={
              hasUnread ? "mt-1 font-medium text-ink" : "mt-1 text-muted"
            }
            numberOfLines={1}
          >
            {conversation.lastMessagePreview?.trim() || NO_MESSAGES}
          </Text>
        </View>

        {hasUnread && unreadCount > 0 ? (
          <Animated.View
            entering={popEnter(!!reduceMotion)}
            className="min-h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5"
          >
            <Text variant="label" className="font-bold text-primary-foreground">
              {unreadCount}
            </Text>
          </Animated.View>
        ) : null}
      </TactilePressable>
    </Animated.View>
  );
});
