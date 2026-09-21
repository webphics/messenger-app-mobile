import { useLayoutEffect } from "react";
import { Info, Pencil, Reply } from "@/components/icons";
import { Pressable, View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { easing } from "@/lib/motion-easing";
import { motion } from "@/lib/motion";
import { REACT_EMOJIS } from "@/lib/message-react";
import {
  replyStyle,
  trayStyle,
  type ReactionAnchor,
} from "@/lib/overlay-frame";
import { colors } from "@/lib/tokens";

export type { ReactionAnchor };

/** One row's worth, so each pill clears the one it sits under. */
const PILL_OFFSET = 52;

type MessageActionsProps = {
  anchor: ReactionAnchor;
  onDismiss: () => void;
  /** Absent where the message cannot be reacted to — see `MessageBubble`. */
  onReact?: (emoji: string) => void;
  /** Absent where the thread has no composer to open a reply in. */
  onReply?: () => void;
  /**
   * Message info. Absent on anybody else's message and on one this device is
   * still carrying — the API answers 403 for the first and knows nothing of the
   * second, so neither is offered rather than offered and refused.
   */
  onInfo?: () => void;
  /**
   * Rewrite the message. Absent on anybody else's, on one still being carried,
   * on anything that is not text, and once the API's edit window has closed —
   * `canEditMessage` decides all four, so this is offered only where it works.
   */
  onEdit?: () => void;
};

export function MessageActions({
  anchor,
  onDismiss,
  onReact,
  onReply,
  onInfo,
  onEdit,
}: MessageActionsProps) {
  const reduceMotion = useReducedMotion();
  // The tray appears where a finger just was, so Reduce Motion keeps the fade
  // — it is what says something opened — and drops only the scale.
  const scale = useSharedValue(reduceMotion ? 1 : 0.85);
  const opacity = useSharedValue(0);

  useLayoutEffect(() => {
    scale.set(
      withSpring(1, { ...motion.springs.tray, reduceMotion: ReduceMotion.System }),
    );
    opacity.set(
      withTiming(1, { duration: motion.durations.flash, easing: easing.out }),
    );
  }, [opacity, scale]);

  const trayAnim = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ scale: scale.get() }],
  }));
  const replyAnim = useAnimatedStyle(() => ({
    opacity: opacity.get(),
  }));

  /*
    Reply, then Edit, then Info: most often wanted first, and the one that
    leaves the thread for a screen of its own last. Each is absent rather than
    disabled where it does not apply, which is `wall-post-actions`' rule too —
    a control that opens onto a refusal is worse than no control.
  */
  const pills = [
    onReply && {
      label: "Reply",
      accessibilityLabel: "Reply",
      Icon: Reply,
      onPress: () => {
        onReply();
      },
    },
    onEdit && {
      label: "Edit",
      accessibilityLabel: "Edit message",
      Icon: Pencil,
      onPress: () => {
        onEdit();
      },
    },
    onInfo && {
      label: "Info",
      accessibilityLabel: "Message info",
      Icon: Info,
      onPress: () => {
        onInfo();
      },
    },
  ].filter((pill): pill is Exclude<typeof pill, false | undefined> => Boolean(pill));

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

      {/*
          The pills, stacked under the bubble in the order they are most often
          wanted. Which ones are present varies — a read-only thread has no
          Reply, somebody else's message has no Edit or Info — so the offset is
          the pill's index in what is actually drawn rather than a constant per
          pill. A fixed offset per pill would leave a gap where a missing one
          used to be, and on a bubble near the bottom of the screen that gap is
          the difference between the last pill being reachable and being off it.
      */}
      {pills.map((pill, index) => (
        <Animated.View
          key={pill.label}
          pointerEvents="auto"
          style={[
            {
              position: "absolute",
              elevation: 24,
              zIndex: 30,
              ...replyPos,
              top: replyPos.top + index * PILL_OFFSET,
            },
            replyAnim,
          ]}
        >
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel={pill.accessibilityLabel}
            onPress={pill.onPress}
            className="mt-2 min-h-11 flex-row items-center gap-2 rounded-full border border-line/80 bg-surface px-5 py-2 shadow-2xl shadow-black/20"
          >
            <pill.Icon color={colors.primary} size={18} />
            <Text variant="meta" className="font-semibold text-primary">
              {pill.label}
            </Text>
          </TactilePressable>
        </Animated.View>
      ))}
    </View>
  );
}
