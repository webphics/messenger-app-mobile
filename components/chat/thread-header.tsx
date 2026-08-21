import { View } from "react-native";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Text } from "@/components/ui/text";
import { conversationTitle } from "@/lib/conversation-title";
import { initials } from "@/lib/display";
import { getDevUserId } from "@/lib/dev-user";
import { LABELS, PEOPLE } from "@/lib/mock-data";
import type { Conversation } from "@/lib/types";

type ThreadHeaderProps = {
  conversation: Conversation;
};

function statusPill(conversation: Conversation): { label: string; style: string; textStyle: string } | null {
  if (
    conversation.labelIds.some((id) => LABELS.find((l) => l.id === id)?.name === "Resolved")
  ) {
    return {
      label: "Resolved",
      style: "bg-success/15",
      textStyle: "text-success",
    };
  }
  if (conversation.assigneeId === null) {
    return {
      label: "Unassigned",
      style: "bg-amber/15",
      textStyle: "text-amber",
    };
  }
  return {
    label: "Assigned",
    style: "bg-primary-soft",
    textStyle: "text-primary",
  };
}

export function ThreadHeader({ conversation }: ThreadHeaderProps) {
  const title = conversationTitle(conversation, PEOPLE, getDevUserId());
  const otherId = conversation.participantIds.find((id) => id !== getDevUserId());
  const other = PEOPLE.find((p) => p.id === otherId);
  const isGroup = conversation.kind === "group" || conversation.id === "offers";
  const subtitle = isGroup
    ? `${conversation.participantIds.length} participants`
    : (other?.isOnline ? "Active now" : (other?.lastActiveLabel ? `Last seen ${other.lastActiveLabel}` : ""));
  const pill = statusPill(conversation);

  return (
    <View className="h-12 min-w-0 flex-1 flex-row items-center gap-2.5 pr-2">
      <View className="relative">
        <Avatar alt={title} className="size-9">
          <AvatarFallback className="bg-primary-soft">
            <Text className="font-sans text-xs font-bold text-primary">
              {initials(title)}
            </Text>
          </AvatarFallback>
        </Avatar>
        {other?.isOnline && !isGroup ? (
          <View className="absolute bottom-0 right-0 size-2.5 rounded-full border border-surface bg-success" />
        ) : null}
      </View>
      <View className="min-w-0 flex-1">
        <Text className="font-sans text-base font-bold leading-5 text-ink" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="font-sans text-xs font-normal leading-4 text-muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {pill ? (
        <View className={`rounded-full px-2.5 py-0.5 ${pill.style}`}>
          <Text className={`font-sans text-xs font-bold ${pill.textStyle}`}>
            {pill.label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
