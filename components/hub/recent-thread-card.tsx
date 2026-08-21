import { router } from "expo-router";
import { ChevronRight } from "@/components/icons";
import { View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { PresenceDot } from "@/components/ui/presence-dot";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { chatHref } from "@/lib/chat-route-id";
import { conversationTitle, otherParticipant } from "@/lib/conversation-title";
import { formatRelativeTime, initials } from "@/lib/display";
import { settleEnter } from "@/lib/motion-enter";
import { PEOPLE } from "@/lib/mock-data";
import { colors } from "@/lib/tokens";
import type { Conversation } from "@/lib/types";

type RecentThreadCardProps = {
  conversation: Conversation;
  selfId: string;
};

export function RecentThreadCard({ conversation, selfId }: RecentThreadCardProps) {
  const reduceMotion = useReducedMotion();
  const title = conversationTitle(conversation, PEOPLE, selfId);
  const other = otherParticipant(conversation, PEOPLE, selfId);
  const online = conversation.id === "offers" ? false : Boolean(other?.isOnline);

  return (
    <Animated.View entering={settleEnter(!!reduceMotion, 80)}>
      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel="Open recent message"
        onPress={() => router.push(chatHref(conversation.id))}
        className="flex-row items-center gap-3.5 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5"
      >
        <View className="relative">
          <Avatar alt={title} className="size-12">
            <AvatarFallback className="bg-primary-soft">
              <Text variant="label" className="text-primary">
                {initials(title)}
              </Text>
            </AvatarFallback>
          </Avatar>
          {online ? (
            <PresenceDot className="absolute bottom-0 right-0 size-3.5 border-2 border-surface" />
          ) : null}
        </View>

        <View className="min-w-0 flex-1">
          <Text variant="title" className="text-ink" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="meta" className="mt-0.5 text-muted" numberOfLines={1}>
            {conversation.lastMessagePreview} · {formatRelativeTime(conversation.updatedAt)}
          </Text>
        </View>
        <ChevronRight color={colors.muted} size={18} />
      </TactilePressable>
    </Animated.View>
  );
}
