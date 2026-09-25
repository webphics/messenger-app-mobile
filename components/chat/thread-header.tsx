import { router } from "expo-router";
import { Pressable, View } from "react-native";

import { Info } from "@/components/icons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { chatDetailsHref } from "@/lib/chat-route-id";
import {
  conversationPeerRole,
  peerPresence,
  supportStatusLabel,
  supportStatusTone,
  type StatusTone,
} from "@/lib/conversation-details";
import { conversationPeer, conversationTitle } from "@/lib/conversation-title";
import { initials } from "@/lib/display";
import { colors } from "@/lib/tokens";
import { isStaffConversation } from "@/lib/types";
import type { Conversation } from "@/lib/types";
import { userRoleLabel } from "@/lib/user-directory";

type ThreadHeaderProps = {
  conversation: Conversation;
  /** Names a Customer's own support thread, which carries no title of its own. */
  organizationNames?: ReadonlyMap<string, string>;
  /** Whether Support DMs are worked by assignment. See `lib/support-assignment`. */
  supportAssignment: boolean;
};

const PILL_STYLE: Record<StatusTone, { style: string; textStyle: string }> = {
  success: { style: "bg-success/15", textStyle: "text-success" },
  attention: { style: "bg-amber/15", textStyle: "text-amber" },
  neutral: { style: "bg-primary-soft", textStyle: "text-primary" },
};

/**
 * The pill beside the name: the assignment state where it says something, and
 * otherwise who the other side is.
 *
 * Staff-only, and null for everyone else: assignment is internal, and a
 * Customer's payload does not carry it, which is the point rather than an
 * omission to work around. In a Shared queue nobody holds a thread, so every
 * live one would read Open, which tells nobody anything. There the pill names
 * the other side's role instead, and a resolved thread still says Resolved.
 * The status words and tone are shared with Conversation details one tap away.
 */
function headerPill(
  conversation: Conversation,
  supportAssignment: boolean,
): { label: string; style: string; textStyle: string } | null {
  if (!isStaffConversation(conversation)) return null;

  const status = conversation.status;
  if (status !== null && (supportAssignment || status === "closed")) {
    return {
      label: supportStatusLabel(status, supportAssignment),
      ...PILL_STYLE[supportStatusTone(status, supportAssignment)],
    };
  }

  const role = conversationPeerRole(conversation);
  return role ? { label: userRoleLabel(role), ...PILL_STYLE.neutral } : null;
}

function memberCount(conversation: Conversation): number | null {
  // Only a group names members. An Announcements thread has none to count.
  if (conversation.type !== "group") {
    return null;
  }
  return conversation.members.length;
}

export function ThreadHeader({
  conversation,
  organizationNames,
  supportAssignment,
}: ThreadHeaderProps) {
  const title = conversationTitle(conversation, organizationNames);
  const peer = conversationPeer(conversation);
  const participants = memberCount(conversation);
  const online = peer?.isOnline === true;
  // The name is the way into details, so a thread with nothing else to say
  // under it says that, the way Messenger and WhatsApp do.
  const subtitle =
    participants !== null
      ? `${participants} participants`
      : (peerPresence(conversation) ?? "Tap for details");
  const pill = headerPill(conversation, supportAssignment);
  const openDetails = () => router.push(chatDetailsHref(conversation.id));

  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-2.5 py-1.5 pr-2">
      {/*
        The avatar and the name are one control, as in Messenger and WhatsApp:
        the person at the top of a thread is where people tap to find out more
        about it. The info button beside it goes to the same screen for anyone
        who does not know that.
      */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, conversation details`}
        onPress={openDetails}
        hitSlop={{ top: 4, bottom: 4 }}
        className="min-w-0 flex-1 flex-row items-center gap-2.5 active:opacity-70"
      >
        <View className="relative">
          <Avatar alt={title} className="size-9">
            <AvatarFallback className="bg-primary-soft">
              <Text variant="label" className="font-semibold text-primary">
                {initials(title)}
              </Text>
            </AvatarFallback>
          </Avatar>
          {online && participants === null ? (
            <View className="absolute bottom-0 right-0 size-2.5 rounded-full border border-surface bg-success" />
          ) : null}
        </View>
        <View className="min-w-0 flex-1">
          <Text
            variant="body"
            className="font-semibold text-ink"
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              variant="label"
              className="font-normal text-muted"
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {pill ? (
        <View className={`rounded-full px-2.5 py-0.5 ${pill.style}`}>
          <Text variant="label" className={`font-semibold ${pill.textStyle}`}>
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
        onPress={openDetails}
        className="size-11 shrink-0 items-center justify-center rounded-full"
      >
        <Info color={colors.ink} size={20} />
      </TactilePressable>
    </View>
  );
}
