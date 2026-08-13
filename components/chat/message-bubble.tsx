import { Check, CheckCheck, CornerUpLeft, Reply } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    Extrapolation,
    FadeIn,
    interpolate,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from "react-native-reanimated";

import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { REACT_EMOJIS, replyCaption } from "@/lib/message-react";
import { messageStatusLabel } from "@/lib/message-status";
import { colors } from "@/lib/tokens";
import type { MessageReaction, MessageStatus } from "@/lib/types";

export type QuotedMessage = {
  name: string;
  body: string;
  isMe: boolean;
};

type MessageBubbleProps = {
  body: string;
  outgoing: boolean;
  status: MessageStatus;
  senderName?: string;
  quoted?: QuotedMessage;
  reactions?: MessageReaction[];
  currentUserId: string;
  selected?: boolean;
  enter?: boolean;
  onLongPress: () => void;
  onReply: () => void;
  onToggleReaction: (emoji: string) => void;
};

const SWIPE_REPLY = 56;

function Receipt({
  status,
  outgoing,
}: {
  status: MessageStatus;
  outgoing: boolean;
}) {
  if (!outgoing) return null;
  const read = status === "read";
  const Icon = status === "sent" || status === "sending" ? Check : CheckCheck;
  return (
    <View
      accessibilityLabel={messageStatusLabel(status)}
      className="mt-1 items-end pr-1"
      style={{ opacity: status === "sending" ? 0.4 : 1 }}
    >
      <Icon color={read ? colors.primary : colors.muted} size={13} />
    </View>
  );
}

function QuoteChrome({
  quoted,
  outgoing,
  senderName,
}: {
  quoted: QuotedMessage;
  outgoing: boolean;
  senderName?: string;
}) {
  return (
    <View className={cn("mb-0.5", outgoing ? "items-end" : "items-start")}>
      <View className="mb-0.5 flex-row items-center gap-1 px-1">
        <CornerUpLeft color={colors.muted} size={12} />
        <Text className="font-sans text-[11px] font-medium text-muted" numberOfLines={1}>
          {replyCaption({
            outgoing,
            senderName,
            quotedName: quoted.name,
            quotedIsMe: quoted.isMe,
          })}
        </Text>
      </View>
      <View className="max-w-[92%] rounded-[18px] bg-bubble-in px-3 py-1.5 opacity-80">
        <Text
          className="font-sans text-xs font-normal leading-4 text-muted"
          numberOfLines={2}
        >
          {quoted.body}
        </Text>
      </View>
    </View>
  );
}

function ReactionBadge({
  reactions,
  outgoing,
  currentUserId,
  onToggleReaction,
}: {
  reactions: MessageReaction[];
  outgoing: boolean;
  currentUserId: string;
  onToggleReaction: (emoji: string) => void;
}) {
  if (reactions.length === 0) return null;
  const total = reactions.reduce((n, r) => n + r.userIds.length, 0);
  return (
    <View
      className={cn(
        "absolute -bottom-3 z-10 flex-row items-center rounded-full border border-line bg-surface px-1.5 py-0.5 shadow-sm shadow-black/10",
        outgoing ? "right-2" : "left-2",
      )}
    >
      {reactions.map((reaction) => (
        <Pressable
          key={reaction.emoji}
          accessibilityRole="button"
          accessibilityLabel={`React ${reaction.emoji}`}
          onPress={() => onToggleReaction(reaction.emoji)}
          className="px-0.5"
        >
          <Text className="font-sans text-[13px] leading-4">
            {reaction.emoji}
          </Text>
        </Pressable>
      ))}
      {total > 1 ? (
        <Text
          className={cn(
            "ml-0.5 font-sans text-[11px]",
            reactions.some((r) => r.userIds.includes(currentUserId))
              ? "text-primary"
              : "text-muted",
          )}
        >
          {total}
        </Text>
      ) : null}
    </View>
  );
}

function EmojiPill({
  outgoing,
  onReact,
}: {
  outgoing: boolean;
  onReact: (emoji: string) => void;
}) {
  return (
    <View className={cn("mb-1.5", outgoing ? "items-end" : "items-start")}>
      <View className="flex-row rounded-full border border-line bg-surface px-1.5 py-1 shadow-md shadow-black/15">
        {REACT_EMOJIS.map((emoji) => (
          <Pressable
            key={emoji}
            accessibilityRole="button"
            accessibilityLabel={`React ${emoji}`}
            onPress={() => onReact(emoji)}
            className="size-9 items-center justify-center"
          >
            <Text className="font-sans text-xl leading-6">{emoji}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function MessageBubble({
  body,
  outgoing,
  status,
  senderName,
  quoted,
  reactions = [],
  currentUserId,
  selected,
  enter,
  onLongPress,
  onReply,
  onToggleReaction,
}: MessageBubbleProps) {
  const x = useSharedValue(0);
  const gesture = Gesture.Pan()
    .activeOffsetX(18)
    .failOffsetY([-18, 18])
    .onUpdate((e) => {
      x.value = Math.max(0, Math.min(e.translationX, 80));
    })
    .onEnd(() => {
      if (x.value >= SWIPE_REPLY) runOnJS(onReply)();
      x.value = withSpring(0, { damping: 18, stiffness: 260, mass: 0.55 });
    });

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));
  const iconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      x.value,
      [0, 20, SWIPE_REPLY],
      [0, 0.35, 1],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        scale: interpolate(
          x.value,
          [0, SWIPE_REPLY],
          [0.55, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <Animated.View
      entering={enter ? FadeIn.springify().damping(20).stiffness(220) : undefined}
      className="mb-4"
    >
      <View className="justify-center">
        <Animated.View style={iconStyle} className="absolute left-1 z-0">
          <View className="size-8 items-center justify-center rounded-full bg-primary-soft">
            <Reply color={colors.primary} size={16} />
          </View>
        </Animated.View>
        <GestureDetector gesture={gesture}>
          <Animated.View
            style={bubbleStyle}
            className={cn("max-w-[78%]", outgoing ? "self-end" : "self-start")}
          >
            {senderName ? (
              <Text className="mb-1 px-1 font-sans text-xs text-muted">
                {senderName}
              </Text>
            ) : null}
            {quoted ? (
              <QuoteChrome
                quoted={quoted}
                outgoing={outgoing}
                senderName={senderName}
              />
            ) : null}
            {selected ? (
              <EmojiPill outgoing={outgoing} onReact={onToggleReaction} />
            ) : null}
            <View className={cn("relative", reactions.length > 0 && "mb-2")}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  outgoing ? "Outgoing message" : "Incoming message"
                }
                delayLongPress={250}
                onLongPress={onLongPress}
              >
                <View
                  className={cn(
                    "px-3.5 py-2.5 shadow-sm shadow-black/10",
                    outgoing
                      ? "rounded-[22px] rounded-br-md bg-primary"
                      : "rounded-[22px] rounded-bl-md bg-bubble-in",
                  )}
                >
                  <Text
                    className={cn(
                      "font-sans text-[15px] font-normal leading-5",
                      outgoing ? "text-primary-foreground" : "text-ink",
                    )}
                  >
                    {body}
                  </Text>
                </View>
              </Pressable>
              <ReactionBadge
                reactions={reactions}
                outgoing={outgoing}
                currentUserId={currentUserId}
                onToggleReaction={onToggleReaction}
              />
            </View>
            <Receipt status={status} outgoing={outgoing} />
          </Animated.View>
        </GestureDetector>
      </View>
    </Animated.View>
  );
}
