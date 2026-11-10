import { useLayoutEffect, useState } from "react";
import {
  Clock,
  Copy,
  FileText,
  Flag,
  Info,
  Menu,
  Pencil,
  Plus,
  Reply,
  Trash2,
  UserX,
} from "@/components/icons";
import { Modal, Pressable, View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmojiPanel } from "@/components/chat/emoji-panel";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { easing } from "@/lib/motion-easing";
import { motion } from "@/lib/motion";
import { REACT_EMOJIS } from "@/lib/message-react";
import { reactionBarStyle, type ReactionAnchor } from "@/lib/overlay-frame";
import { colors } from "@/lib/tokens";

export type { ReactionAnchor };

/** The reaction bar's drawn height: a 48pt emoji cell plus its padding. */
const BAR_HEIGHT = 60;
/** Six 48pt cells, five 4pt gaps, 6pt padding each side, the hairline border. */
const BAR_WIDTH = 6 * 48 + 5 * 4 + 12 + 2;
/** The action bar's height above the safe-area inset. */
const ACTION_BAR_HEIGHT = 76;
/** The full emoji picker the bar's + opens. */
const PICKER_HEIGHT = 380;

type MessageActionsProps = {
  anchor: ReactionAnchor;
  onDismiss: () => void;
  /** Absent where the message cannot be reacted to — see `MessageBubble`. */
  onReact?: (emoji: string) => void;
  /** Absent where the thread has no composer to open a reply in. */
  onReply?: () => void;
  /**
   * Copy the message's words. Absent where there are none to copy, such as an
   * attachment sent without a caption.
   */
  onCopy?: () => void;
  /**
   * Message info. Absent on anybody else's message and on one this device is
   * still carrying — the API answers 403 for the first and knows nothing of the
   * second, so neither is offered rather than offered and refused.
   */
  onInfo?: () => void;
  /**
   * Rewrite the message. Absent on anybody else's, on one still being carried,
   * on anything that is not text, where the conversation's access turns editing
   * off, and once the API's edit window has closed. `messageActions` in
   * `lib/conversation-access` decides, so this is offered only where it works.
   */
  onEdit?: () => void;
  /**
   * The message's edit history. Present on any edited message the server holds,
   * whoever sent it: every reader may check what a message used to say.
   */
  onHistory?: () => void;
  /**
   * Report the message. Absent on the viewer's own, on one still being carried
   * and on a System notice — `messageModeration` decides.
   */
  onReport?: () => void;
  /**
   * Block whoever sent it. Absent where the message names no sender person,
   * which a Customer's Support DM never does. `blockLabel` names them.
   */
  onBlock?: () => void;
  blockLabel?: string;
  /**
   * Delete the message for everyone. Absent unless the API marked it
   * `deletable` and the conversation's `access` offers `deleteMessages`;
   * `messageActions` in `lib/conversation-access` decides.
   */
  onDelete?: () => void;
  /**
   * Write an internal note about this message. Absent unless the
   * conversation's `access` offers `writeNotes`; `messageNoteOffered` in
   * `lib/conversation-access` decides.
   */
  onAddNote?: () => void;
};

type Action = {
  label: string;
  accessibilityLabel: string;
  Icon: typeof Reply;
  danger?: boolean;
  onPress: () => void;
};

function present(action: Action | false | undefined): action is Action {
  return Boolean(action);
}

export function MessageActions({
  anchor,
  onDismiss,
  onReact,
  onReply,
  onCopy,
  onInfo,
  onEdit,
  onHistory,
  onReport,
  onBlock,
  blockLabel = "Block",
  onDelete,
  onAddNote,
}: MessageActionsProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [hostHeight, setHostHeight] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // The bar appears where a finger just was, so Reduce Motion keeps the fade
  // — it is what says something opened — and drops only the scale and slide.
  const scale = useSharedValue(reduceMotion ? 1 : 0.85);
  const opacity = useSharedValue(0);
  const slide = useSharedValue(reduceMotion ? 0 : ACTION_BAR_HEIGHT);

  useLayoutEffect(() => {
    scale.set(
      withSpring(1, { ...motion.springs.tray, reduceMotion: ReduceMotion.System }),
    );
    opacity.set(
      withTiming(1, { duration: motion.durations.flash, easing: easing.out }),
    );
    slide.set(
      withTiming(0, { duration: motion.durations.flash, easing: easing.out }),
    );
  }, [opacity, scale, slide]);

  const trayAnim = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ scale: scale.get() }],
  }));
  const barAnim = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: slide.get() }],
  }));

  /*
    The bottom bar holds the four most wanted: Reply, Copy, Delete and More.
    Everything else goes under More, in the order the old pill stack used:
    Edit, History, Add note, Info, then Report and Block in the danger colour.
    Each is absent rather than disabled where it does not apply, which is
    `wall-post-actions`' rule too — a control that opens onto a refusal is worse
    than no control.
  */
  const primary = [
    onReply && {
      label: "Reply",
      accessibilityLabel: "Reply",
      Icon: Reply,
      onPress: onReply,
    },
    onCopy && {
      label: "Copy",
      accessibilityLabel: "Copy message",
      Icon: Copy,
      onPress: onCopy,
    },
    onDelete && {
      label: "Delete",
      accessibilityLabel: "Delete message",
      Icon: Trash2,
      danger: true,
      onPress: onDelete,
    },
  ].filter(present);

  const more = [
    onEdit && {
      label: "Edit",
      accessibilityLabel: "Edit message",
      Icon: Pencil,
      onPress: onEdit,
    },
    onHistory && {
      label: "Edit history",
      accessibilityLabel: "Edit history",
      Icon: Clock,
      onPress: onHistory,
    },
    onAddNote && {
      label: "Add note",
      accessibilityLabel: "Add an internal note about this message",
      Icon: FileText,
      onPress: onAddNote,
    },
    onInfo && {
      label: "Message info",
      accessibilityLabel: "Message info",
      Icon: Info,
      onPress: onInfo,
    },
    onReport && {
      label: "Report…",
      accessibilityLabel: "Report message",
      Icon: Flag,
      danger: true,
      onPress: onReport,
    },
    onBlock && {
      label: `${blockLabel}…`,
      accessibilityLabel: blockLabel,
      Icon: UserX,
      danger: true,
      onPress: onBlock,
    },
  ].filter(present);

  const bar: Action[] = more.length
    ? [
        ...primary,
        {
          label: "More",
          accessibilityLabel: "More actions",
          Icon: Menu,
          onPress: () => setMoreOpen(true),
        },
      ]
    : primary;

  const bottomReserve = bar.length ? ACTION_BAR_HEIGHT + insets.bottom : 0;
  const trayPos = reactionBarStyle(
    anchor,
    anchor.outgoing,
    { width: anchor.hostWidth, height: hostHeight || Number.MAX_SAFE_INTEGER },
    BAR_HEIGHT,
    bottomReserve,
    BAR_WIDTH,
  );

  /*
    No `elevation` on any layer here. Android draws an elevation shadow under
    the view's outline, and under the translucent dim that shadow shows through
    as a grey box. It also lifts a view above later siblings, so the dim would
    not cover the bars. Render order stacks the layers instead, later on top.
  */
  return (
    <View
      className="absolute inset-0"
      onLayout={(e) => setHostHeight(e.nativeEvent.layout.height)}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss message actions"
        onPressIn={onDismiss}
        className="absolute inset-0"
      />

      {/* Absent where nothing can come of a tap: a message the server has never
          seen has no id to react to, and a thread this person may only read is
          one the API refuses a reaction in. */}
      {onReact && hostHeight > 0 ? (
        <Animated.View
          pointerEvents="auto"
          style={[
            {
              position: "absolute",
              zIndex: 30,
              transformOrigin: anchor.outgoing ? "right bottom" : "left bottom",
              ...trayPos,
            },
            trayAnim,
          ]}
          className="flex-row items-center gap-1 rounded-full border border-line/80 bg-surface px-1.5 py-1.5 shadow-2xl shadow-black/25"
        >
          {REACT_EMOJIS.map((emoji) => (
            <TactilePressable
              key={emoji}
              accessibilityRole="button"
              accessibilityLabel={`React ${emoji}`}
              onPress={() => {
                onReact(emoji);
              }}
              className="size-12 items-center justify-center rounded-full"
            >
              <Text className="text-[30px] leading-[38px]">{emoji}</Text>
            </TactilePressable>
          ))}
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="More reactions"
            onPress={() => setPickerOpen(true)}
            className="size-12 items-center justify-center rounded-full bg-line/60"
          >
            <Plus color={colors.inkSoft} size={24} />
          </TactilePressable>
        </Animated.View>
      ) : null}

      {bar.length ? (
        <Animated.View
          pointerEvents="auto"
          style={[
            {
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 30,
              paddingBottom: insets.bottom,
            },
            barAnim,
          ]}
          className="flex-row border-t border-line/80 bg-surface shadow-2xl shadow-black/20"
        >
          {bar.map((action) => (
            <TactilePressable
              key={action.label}
              accessibilityRole="button"
              accessibilityLabel={action.accessibilityLabel}
              onPress={action.onPress}
              style={{ height: ACTION_BAR_HEIGHT }}
              className="flex-1 items-center justify-center gap-1.5"
            >
              <action.Icon
                color={action.danger ? colors.danger : colors.primary}
                size={24}
              />
              <Text variant="meta" className="text-ink">
                {action.label}
              </Text>
            </TactilePressable>
          ))}
        </Animated.View>
      ) : null}

      {/*
        The picker and the More card are Modals: a Modal is a window of its own,
        so the dim covers the whole screen, header and status bar included,
        rather than stopping at the thread's edge.
      */}
      <Modal
        visible={pickerOpen && Boolean(onReact)}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setPickerOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/45">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close emoji picker"
            onPress={() => setPickerOpen(false)}
            className="absolute inset-0"
          />
          <View
            style={{ paddingBottom: insets.bottom }}
            className="overflow-hidden rounded-t-3xl bg-surface"
          >
            <EmojiPanel
              height={PICKER_HEIGHT}
              onEmojiSelected={(emoji) => {
                setPickerOpen(false);
                onReact?.(emoji);
              }}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={moreOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setMoreOpen(false)}
      >
        <View className="flex-1 items-center justify-center bg-black/45 px-8">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close more actions"
            onPress={() => setMoreOpen(false)}
            className="absolute inset-0"
          />
          <View
            accessibilityRole="menu"
            className="w-full max-w-sm rounded-3xl bg-surface px-2 pb-3 pt-5 shadow-2xl shadow-black/30"
          >
            <Text variant="headline" className="mb-2 px-5 text-ink">
              More
            </Text>
            {more.map((action) => (
              <TactilePressable
                key={action.label}
                accessibilityRole="menuitem"
                accessibilityLabel={action.accessibilityLabel}
                onPress={() => {
                  setMoreOpen(false);
                  action.onPress();
                }}
                className="min-h-12 flex-row items-center gap-4 rounded-2xl px-5 py-3"
              >
                <action.Icon
                  color={action.danger ? colors.danger : colors.inkSoft}
                  size={20}
                />
                <Text
                  variant="body"
                  className={action.danger ? "text-danger" : "text-ink"}
                >
                  {action.label}
                </Text>
              </TactilePressable>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}
