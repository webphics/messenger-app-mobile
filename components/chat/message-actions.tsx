import { useLayoutEffect } from "react";
import { Reply } from "@/components/icons";
import { Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { motion } from "@/lib/motion";
import { REACT_EMOJIS } from "@/lib/message-react";
import {
  replyStyle,
  trayStyle,
  type ReactionAnchor,
} from "@/lib/overlay-frame";
import { colors } from "@/lib/tokens";

export type { ReactionAnchor };

type MessageActionsProps = {
  anchor: ReactionAnchor;
  onDismiss: () => void;
  /** Absent where the message cannot be reacted to — see `MessageBubble`. */
  onReact?: (emoji: string) => void;
  /** Absent where the thread has no composer to open a reply in. */
  onReply?: () => void;
};

export function MessageActions({
  anchor,
  onDismiss,
  onReact,
  onReply,
}: MessageActionsProps) {
  const scale = useSharedValue(0.85);
  const opacity = useSharedValue(0);

  useLayoutEffect(() => {
    scale.value = withSpring(1, motion.springs.tray);
    opacity.value = withTiming(1, { duration: motion.durations.flash });
  }, [opacity, scale]);

  const trayAnim = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  const replyAnim = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const trayPos = trayStyle(anchor, anchor.outgoing, anchor.hostWidth);
  const replyPos = replyStyle(anchor, anchor.outgoing, anchor.hostWidth);

  return (
    <View className="absolute inset-0">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss reactions"
        onPressIn={onDismiss}
        className="absolute inset-0"
      />
      {/* Absent where nothing can come of a tap: a message the server has never
          seen has no id to react to, and a thread this person may only read is
          one the API refuses a reaction in. */}
      {onReact ? (
      <Animated.View
        pointerEvents="auto"
        style={[
          {
            position: "absolute",
            elevation: 24,
            zIndex: 30,
            ...trayPos,
          },
          trayAnim,
        ]}
        className="flex-row rounded-full border border-line/80 bg-surface px-2 py-1 shadow-2xl shadow-black/20"
      >
        {REACT_EMOJIS.map((emoji) => (
          <TactilePressable
            key={emoji}
            haptic="selection"
            accessibilityRole="button"
            accessibilityLabel={`React ${emoji}`}
            onPress={() => {
              onReact(emoji);
            }}
            className="size-10 items-center justify-center rounded-full"
          >
            <Text variant="display">{emoji}</Text>
          </TactilePressable>
        ))}
      </Animated.View>
      ) : null}

      {/* Absent where the thread is read-only: a Reply with no composer to open
          would be a control that does nothing. */}
      {onReply ? (
      <Animated.View
        pointerEvents="auto"
        style={[
          {
            position: "absolute",
            elevation: 24,
            zIndex: 30,
            ...replyPos,
          },
          replyAnim,
        ]}
      >
        <TactilePressable
          haptic="selection"
          accessibilityRole="button"
          accessibilityLabel="Reply"
          onPress={() => {
            onReply();
          }}
          className="mt-2 min-h-11 flex-row items-center gap-2 rounded-full border border-line/80 bg-surface px-5 py-2 shadow-2xl shadow-black/20"
        >
          <Reply color={colors.primary} size={18} />
          <Text variant="meta" className="font-semibold text-primary">
            Reply
          </Text>
        </TactilePressable>
      </Animated.View>
      ) : null}
    </View>
  );
}
