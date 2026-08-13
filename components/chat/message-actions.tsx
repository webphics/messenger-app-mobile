import { Reply } from "lucide-react-native";
import { Pressable, View } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";

import { Text } from "@/components/ui/text";
import { REACT_EMOJIS } from "@/lib/message-react";
import { colors } from "@/lib/tokens";

type MessageActionsProps = {
  outgoing: boolean;
  onReact: (emoji: string) => void;
  onReply: () => void;
};

/** Incoming → right, outgoing → left (toward bubble center). */
const X_INSET = 22;

export function MessageActions({
  outgoing,
  onReact,
  onReply,
}: MessageActionsProps) {
  const xStyle = outgoing ? { right: X_INSET } : { left: X_INSET };

  return (
    <>
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: "50%",
          transform: [{ translateY: -24 }],
          elevation: 24,
          zIndex: 30,
          ...xStyle,
        }}
      >
        <Animated.View
          entering={ZoomIn.springify().damping(15).stiffness(260).mass(0.55)}
          className="flex-row rounded-full border border-line bg-surface px-1.5 py-1 shadow-md shadow-black/15"
        >
          {REACT_EMOJIS.map((emoji, i) => (
            <Animated.View
              key={emoji}
              entering={ZoomIn.springify()
                .damping(12)
                .stiffness(320)
                .mass(0.4)
                .delay(30 + i * 28)}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`React ${emoji}`}
                onPress={() => onReact(emoji)}
                className="size-9 items-center justify-center"
              >
                <Text className="font-sans text-xl leading-6">{emoji}</Text>
              </Pressable>
            </Animated.View>
          ))}
        </Animated.View>
      </View>
      <Animated.View
        entering={FadeIn.delay(90).springify().damping(18).stiffness(240)}
        style={{
          position: "absolute",
          top: "100%",
          elevation: 24,
          zIndex: 30,
          ...xStyle,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reply"
          onPress={onReply}
          className="mt-2 min-h-10 flex-row items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 shadow-md shadow-black/15"
        >
          <Reply color={colors.primary} size={18} />
          <Text className="font-sans text-sm font-medium text-primary">
            Reply
          </Text>
        </Pressable>
      </Animated.View>
    </>
  );
}
