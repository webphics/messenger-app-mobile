import { useLayoutEffect } from "react";
import { Reply } from "lucide-react-native";
import { Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
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
  onReact: (emoji: string) => void;
  onReply: () => void;
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
    scale.value = withSpring(1, { damping: 14, stiffness: 340, mass: 0.4 });
    opacity.value = withTiming(1, { duration: 80 });
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
        className="flex-row rounded-full border border-line bg-surface px-2 py-1 shadow-lg shadow-black/20"
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
            <Text className="font-sans text-2xl leading-7">{emoji}</Text>
          </TactilePressable>
        ))}
      </Animated.View>

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
          className="mt-2 min-h-11 flex-row items-center gap-2 rounded-full border border-line bg-surface px-5 py-2 shadow-lg shadow-black/20"
        >
          <Reply color={colors.primary} size={18} />
          <Text className="font-sans text-sm font-semibold text-primary">
            Reply
          </Text>
        </TactilePressable>
      </Animated.View>
    </View>
  );
}
