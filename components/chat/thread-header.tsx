import { router } from "expo-router";
import { View } from "react-native";

import { Info } from "@/components/icons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { chatDetailsHref } from "@/lib/chat-route-id";
import { conversationPeer, conversationTitle } from "@/lib/conversation-title";
import { initials } from "@/lib/display";
import { colors } from "@/lib/tokens";
import { isStaffConversation } from "@/lib/types";
import type { Conversation } from "@/lib/types";

type ThreadHeaderProps = {
  conversation: Conversation;
  /** Names a Customer's own support thread, which carries no title of its own. */
  organizationNames?: ReadonlyMap<string, string>;
};

/**
 * The assignment pill.
 *
 * Staff-only, and null for everyone else: assignment is internal, and a
 * Customer's payload does not carry it — which is the point, not an omission to
 * work around. Closed reads as Resolved because that is the word the product
 * uses for a thread that is done with.
 */
function statusPill(
  conversation: Conversation,
): { label: string; style: string; textStyle: string } | null {
  if (!isStaffConversation(conversation) || conversation.status === null) return null;

  if (conversation.status === "closed") {
    return { label: "Resolved", style: "bg-success/15", textStyle: "text-success" };
  }
  if (conversation.status === "unassigned") {
    return { label: "Unassigned", style: "bg-amber/15", textStyle: "text-amber" };
  }
  return { label: "Assigned", style: "bg-primary-soft", textStyle: "text-primary" };
}

function memberCount(conversation: Conversation): number | null {
  // Only a group names members. An Announcements thread has none to count.
  if (conversation.type !== "group") {
    return null;
  }
  return conversation.members.length;
}

export function ThreadHeader({ conversation, organizationNames }: ThreadHeaderProps) {
  const title = conversationTitle(conversation, organizationNames);
  const peer = conversationPeer(conversation);
  const participants = memberCount(conversation);
  const online = peer?.isOnline === true;
  const subtitle =
    participants !== null
      ? `${participants} participants`
      : online
        ? "Active now"
        : "";
  const pill = statusPill(conversation);

  return (
    <View className="h-12 min-w-0 flex-1 flex-row items-center gap-2.5 pr-2">
      <View className="relative">
        <Avatar alt={title} className="size-9">
          <AvatarFallback className="bg-primary-soft">
            <Text variant="label" className="font-bold text-primary">
              {initials(title)}
            </Text>
          </AvatarFallback>
        </Avatar>
        {online && participants === null ? (
          <View className="absolute bottom-0 right-0 size-2.5 rounded-full border border-surface bg-success" />
        ) : null}
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="body" className="font-semibold text-ink" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="label" className="font-normal text-muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {pill ? (
        <View className={`rounded-full px-2.5 py-0.5 ${pill.style}`}>
          <Text variant="label" className={`font-bold ${pill.textStyle}`}>
            {pill.label}
          </Text>
        </View>
      ) : null}
      {/*
        The way into everything this thread is besides its messages: who it is
        with, what state it is in, the labels and notes on it, and everything
        shared in it. One control rather than several, because they are one
        screen — the web client's Conversation Details pane, which this mirrors.

        In the header rather than in the composer's attachment sheet: that sheet
        is for adding a file, and a read-only thread has no composer at all while
        still having details worth reading.
      */}
      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel="Conversation details"
        onPress={() => router.push(chatDetailsHref(conversation.id))}
        className="size-11 shrink-0 items-center justify-center rounded-full"
      >
        <Info color={colors.ink} size={20} />
      </TactilePressable>
    </View>
  );
}
