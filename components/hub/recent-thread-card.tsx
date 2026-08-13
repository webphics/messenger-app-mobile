import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Text } from "@/components/ui/text";
import { chatHref } from "@/lib/chat-route-id";
import { conversationTitle } from "@/lib/conversation-title";
import { formatRelativeTime, initials } from "@/lib/display";
import { PEOPLE } from "@/lib/mock-data";
import { colors } from "@/lib/tokens";
import type { Conversation } from "@/lib/types";

type RecentThreadCardProps = {
  conversation: Conversation;
  selfId: string;
};

export function RecentThreadCard({ conversation, selfId }: RecentThreadCardProps) {
  const title = conversationTitle(conversation, PEOPLE, selfId);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open recent message"
      onPress={() => router.push(chatHref(conversation.id))}
      className="mt-4 flex-row items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-md shadow-black/10"
    >
      <Avatar alt={title} className="size-11">
        <AvatarFallback className="bg-primary-soft">
          <Text className="font-sans text-sm font-semibold text-primary">
            {initials(title)}
          </Text>
        </AvatarFallback>
      </Avatar>
      <View className="min-w-0 flex-1">
        <Text className="font-sans text-base font-medium text-ink" numberOfLines={1}>
          {title}
        </Text>
        <Text className="mt-0.5 font-sans text-sm font-normal text-muted" numberOfLines={1}>
          {conversation.lastMessagePreview} · {formatRelativeTime(conversation.updatedAt)}
        </Text>
      </View>
      <ChevronRight color={colors.muted} size={18} />
    </Pressable>
  );
}
