import { memo, useCallback } from "react";
import { Megaphone } from "@/components/icons";
import { View } from "react-native";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { conversationTitle, otherParticipant } from "@/lib/conversation-title";
import { formatRelativeTime, initials } from "@/lib/display";
import { getDevUserId } from "@/lib/dev-user";
import { PEOPLE } from "@/lib/mock-data";
import { colors } from "@/lib/tokens";
import type { Conversation } from "@/lib/types";

type ConversationRowProps = {
  conversation: Conversation;
  onPress: (conversationId: string) => void;
};

export const ConversationRow = memo(function ConversationRow({
  conversation,
  onPress,
}: ConversationRowProps) {
  const title = conversationTitle(conversation, PEOPLE, getDevUserId());
  const isOffers = conversation.id === "offers";
  const other = otherParticipant(conversation, PEOPLE, getDevUserId());
  const online = isOffers ? false : Boolean(other?.isOnline);
  const hasUnread = conversation.unreadCount > 0;

  const handlePress = useCallback(() => {
    onPress(conversation.id);
  }, [conversation.id, onPress]);

  return (
    <TactilePressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={handlePress}
      className="flex-row items-center gap-3.5 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5"
    >
      <View className="relative">
        <Avatar alt={title} className="size-13">
          {isOffers ? (
            <AvatarFallback className="bg-primary">
              <Megaphone color={colors.primaryForeground} size={22} />
            </AvatarFallback>
          ) : (
            <AvatarFallback className="bg-primary-soft">
              <Text className="font-sans text-base font-bold text-primary">
                {initials(title)}
              </Text>
            </AvatarFallback>
          )}
        </Avatar>
        {online ? (
          <View
            accessibilityLabel="Online"
            className="absolute bottom-0 right-0 size-3.5 rounded-full border-2 border-surface bg-success"
          />
        ) : null}
      </View>

      <View className="min-w-0 flex-1">
        <View className="flex-row items-center justify-between gap-1">
          <Text
            className={`font-sans text-base leading-5 ${
              hasUnread ? "font-bold text-ink" : "font-semibold text-ink"
            }`}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text
            className={`font-sans text-xs ${
              hasUnread ? "font-semibold text-primary" : "font-normal text-muted"
            }`}
          >
            {formatRelativeTime(conversation.updatedAt)}
          </Text>
        </View>
        <Text
          className={`mt-1 font-sans text-sm ${
            hasUnread ? "font-medium text-ink" : "font-normal text-muted"
          }`}
          numberOfLines={1}
        >
          {conversation.lastMessagePreview}
        </Text>
      </View>

      {hasUnread ? (
        <View className="min-h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 shadow-sm shadow-black/10">
          <Text className="font-sans text-[11px] font-bold text-primary-foreground">
            {conversation.unreadCount}
          </Text>
        </View>
      ) : null}
    </TactilePressable>
  );
});
