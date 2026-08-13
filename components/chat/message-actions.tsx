import { Reply } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { REACT_EMOJIS } from "@/lib/message-react";
import { colors } from "@/lib/tokens";

type MessageActionsProps = {
  outgoing: boolean;
  onReact: (emoji: string) => void;
  onReply: () => void;
};

/** Toward center: incoming right, outgoing left. */
const X_INSET = 12;

export function MessageActions({
  outgoing,
  onReact,
  onReply,
}: MessageActionsProps) {
  return (
    <>
      <View
        className="absolute z-20 flex-row rounded-full border border-line bg-surface px-1.5 py-1 shadow-md shadow-black/15"
        style={{
          top: "50%",
          transform: [{ translateY: -24 }],
          elevation: 24,
          zIndex: 30,
          ...(outgoing ? { right: X_INSET } : { left: X_INSET }),
        }}
      >
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
        className="absolute z-20 mt-2 min-h-10 flex-row items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 shadow-md shadow-black/15"
        style={{
          top: "100%",
          elevation: 24,
          zIndex: 30,
          ...(outgoing ? { right: X_INSET } : { left: X_INSET }),
        }}
      >
        <Reply color={colors.primary} size={18} />
        <Text className="font-sans text-sm font-medium text-primary">Reply</Text>
      </Pressable>
    </>
  );
}
