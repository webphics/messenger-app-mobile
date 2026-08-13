import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { Check, CheckCheck, CornerUpLeft, Reply } from "lucide-react-native";
import { Dimensions, Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Extrapolation,
  FadeIn,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { hapticLight, hapticMedium, hapticSelection } from "@/lib/haptics";
import { replyCaption } from "@/lib/message-react";
import { messageStatusLabel } from "@/lib/message-status";
import {
  measureWindowOrPage,
  type OpenMenuPayload,
} from "@/lib/overlay-frame";
import { colors } from "@/lib/tokens";
import type { MessageReaction, MessageStatus } from "@/lib/types";

export type { OpenMenuPayload };

export type QuotedMessage = {
  name: string;
  body: string;
  isMe: boolean;
};

type MessageBubbleProps = {
  messageId: string;
  body: string;
  outgoing: boolean;
  status: MessageStatus;
  senderName?: string;
  quoted?: QuotedMessage;
  reactions?: MessageReaction[];
  currentUserId: string;
  selected?: boolean;
  enter?: boolean;
  onOpenMenu: (payload: OpenMenuPayload) => void;
  onReply: (messageId: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
};

const SWIPE_REPLY = 56;
const LONG_PRESS_MS = 150;

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

const QuoteChrome = memo(function QuoteChrome({
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
      <View className="max-w-[92%] rounded-[18px] border border-line bg-bubble-in px-3 py-1.5 opacity-85 shadow-sm shadow-black/5">
        <Text
          className="font-sans text-xs font-normal leading-4 text-muted"
          numberOfLines={2}
        >
          {quoted.body}
        </Text>
      </View>
    </View>
  );
});

const ReactionBadge = memo(function ReactionBadge({
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
        "absolute -bottom-3.5 z-10 flex-row items-center rounded-full border border-line bg-surface px-2 py-0.5 shadow-md shadow-black/10",
        outgoing ? "right-2" : "left-2",
      )}
    >
      {reactions.map((reaction) => (
        <Pressable
          key={reaction.emoji}
          accessibilityRole="button"
          accessibilityLabel={`React ${reaction.emoji}`}
          onPress={() => {
            hapticSelection();
            onToggleReaction(reaction.emoji);
          }}
          className="px-0.5 active:opacity-60"
        >
          <Text className="font-sans text-[13px] leading-4">
            {reaction.emoji}
          </Text>
        </Pressable>
      ))}
      {total > 1 ? (
        <Text
          className={cn(
            "ml-1 font-sans text-[11px] font-bold",
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
});

export const MessageBubble = memo(function MessageBubble({
  messageId,
  body,
  outgoing,
  status,
  senderName,
  quoted,
  reactions = [],
  currentUserId,
  selected,
  enter,
  onOpenMenu,
  onReply,
  onToggleReaction,
}: MessageBubbleProps) {
  const bubbleRef = useRef<View>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const isFirstMount = useRef(true);
  const x = useSharedValue(0);
  const tint = useSharedValue(0);
  const swipedHaptic = useSharedValue(false);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    if (!selected && tint.value !== 0) {
      tint.value = withTiming(0, { duration: 60 });
    }
  }, [selected, tint]);

  useEffect(() => {
    return () => {
      cancelAnimation(tint);
      cancelAnimation(x);
    };
  }, [tint, x]);

  const reportOpen = useCallback(
    (absX: number, absY: number) => {
      const size = sizeRef.current;
      const fallback = () => {
        onOpenMenu({
          messageId,
          outgoing,
          pageX: absX - size.width / 2,
          pageY: absY - size.height / 2,
          width: size.width,
          height: size.height,
        });
      };
      const node = bubbleRef.current;
      if (!node) {
        fallback();
        return;
      }
      void measureWindowOrPage(node, Dimensions.get("window")).then((rect) => {
        onOpenMenu({
          messageId,
          outgoing,
          pageX: rect.x,
          pageY: rect.y,
          width: rect.width,
          height: rect.height,
        });
      });
    },
    [messageId, onOpenMenu, outgoing],
  );

  const handleReply = useCallback(() => {
    onReply(messageId);
  }, [messageId, onReply]);

  const handleToggleReaction = useCallback(
    (emoji: string) => {
      onToggleReaction(messageId, emoji);
    },
    [messageId, onToggleReaction],
  );

  const gesture = useMemo(
    () =>
      Gesture.Race(
        Gesture.LongPress()
          .minDuration(LONG_PRESS_MS)
          .maxDistance(12)
          .onBegin(() => {
            tint.value = withTiming(0.55, { duration: 80 });
          })
          .onStart((e) => {
            tint.value = 1;
            runOnJS(hapticMedium)();
            runOnJS(reportOpen)(e.absoluteX, e.absoluteY);
          })
          .onFinalize((_, ok) => {
            if (!ok) tint.value = withTiming(0, { duration: 60 });
          }),
        Gesture.Pan()
          .activeOffsetX(18)
          .failOffsetY([-18, 18])
          .onUpdate((e) => {
            x.value = Math.max(0, Math.min(e.translationX, 80));
            if (x.value >= SWIPE_REPLY && !swipedHaptic.value) {
              swipedHaptic.value = true;
              runOnJS(hapticLight)();
            } else if (x.value < SWIPE_REPLY) {
              swipedHaptic.value = false;
            }
          })
          .onEnd(() => {
            if (x.value >= SWIPE_REPLY) runOnJS(handleReply)();
            x.value = withSpring(0, { damping: 18, stiffness: 260, mass: 0.55 });
            swipedHaptic.value = false;
          }),
      ),
    [handleReply, reportOpen, swipedHaptic, tint, x],
  );

  const swipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));
  const tintStyle = useAnimatedStyle(() => ({
    opacity: tint.value,
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
      className="pb-3.5"
    >
      <View className="justify-center" pointerEvents="box-none">
        <Animated.View style={iconStyle} className="absolute left-1 z-0">
          <View className="size-8 items-center justify-center rounded-full bg-primary-soft">
            <Reply color={colors.primary} size={16} />
          </View>
        </Animated.View>
        <GestureDetector gesture={gesture}>
          <Animated.View
            style={swipeStyle}
            className={cn(
              "max-w-[78%]",
              outgoing ? "self-end items-end" : "self-start items-start",
            )}
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
            <View
              className={cn(
                "relative overflow-visible",
                outgoing ? "self-end" : "self-start",
                reactions.length > 0 && "mb-2",
              )}
            >
              <View
                ref={bubbleRef}
                collapsable={false}
                accessibilityRole="button"
                accessibilityLabel={
                  outgoing ? "Outgoing message" : "Incoming message"
                }
                onLayout={(e) => {
                  sizeRef.current = {
                    width: e.nativeEvent.layout.width,
                    height: e.nativeEvent.layout.height,
                  };
                }}
                className={cn(
                  "overflow-hidden px-4 py-2.5 shadow-sm shadow-black/10",
                  outgoing
                    ? "rounded-[22px] rounded-br-md bg-primary"
                    : "rounded-[22px] rounded-bl-md border border-line bg-bubble-in",
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
                <Animated.View
                  pointerEvents="none"
                  className={cn(
                    "absolute inset-0",
                    outgoing ? "bg-ink/25" : "bg-ink/12",
                  )}
                  style={tintStyle}
                />
              </View>
              <ReactionBadge
                reactions={reactions}
                outgoing={outgoing}
                currentUserId={currentUserId}
                onToggleReaction={handleToggleReaction}
              />
            </View>
            <Receipt status={status} outgoing={outgoing} />
          </Animated.View>
        </GestureDetector>
      </View>
    </Animated.View>
  );
});
