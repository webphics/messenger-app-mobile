import { Reply } from "lucide-react-native";
import { Modal, Pressable, useWindowDimensions, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { REACT_EMOJIS } from "@/lib/message-react";
import { colors } from "@/lib/tokens";

export type BubbleAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
  outgoing: boolean;
};

type MessageActionsProps = {
  anchor: BubbleAnchor;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onDismiss: () => void;
};

const PILL_H = 48;
const REPLY_H = 40;
const GAP = 8;

export function MessageActions({
  anchor,
  onReact,
  onReply,
  onDismiss,
}: MessageActionsProps) {
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pillW = Math.min(252, winW - 24);

  let left = anchor.outgoing ? anchor.x + anchor.width - pillW : anchor.x;
  left = Math.max(12, Math.min(left, winW - pillW - 12));

  const menuH = PILL_H + GAP + REPLY_H;
  let top = anchor.y - menuH - GAP;
  if (top < insets.top + 8) {
    top = Math.min(anchor.y + anchor.height + GAP, winH - menuH - insets.bottom - 12);
  }

  return (
    <Modal
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss reactions"
            className="absolute inset-0 bg-ink/20"
            onPress={onDismiss}
          />
          <View className="absolute" style={{ top, left, width: pillW }}>
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reply"
              onPress={onReply}
              className={cn(
                "mt-2 min-h-10 flex-row items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 shadow-md shadow-black/15",
                anchor.outgoing ? "self-end" : "self-start",
              )}
            >
              <Reply color={colors.primary} size={18} />
              <Text className="font-sans text-sm font-medium text-primary">
                Reply
              </Text>
            </Pressable>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
