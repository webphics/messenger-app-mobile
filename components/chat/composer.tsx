import { Plus, Send, X } from "@/components/icons";
import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AttachmentSheet } from "@/components/chat/attachment-sheet";
import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { colors, screenBottomPad } from "@/lib/tokens";

type ComposerProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  replyTo?: { name: string; body: string } | null;
  onCancelReply?: () => void;
  /** Overlap the thread already lifted the composer by; see lib/keyboard-inset.ts. */
  keyboardInset?: number;
};

export function Composer({
  value,
  onChangeText,
  onSend,
  replyTo,
  onCancelReply,
  keyboardInset = 0,
}: ComposerProps) {
  const insets = useSafeAreaInsets();
  const [attachOpen, setAttachOpen] = useState(false);
  const canSend = value.trim().length > 0;
  // The keyboard covers the home indicator / nav bar, so once the thread has
  // lifted the composer by that much, its own safe-area gap is redundant.
  const bottom = Math.max(0, screenBottomPad(insets.bottom) - keyboardInset);

  function handleAttach(text: string) {
    if (!value.trim()) {
      onChangeText(text);
    } else {
      onChangeText(`${value} ${text}`);
    }
  }

  return (
    <View
      className="border-t border-line bg-surface"
      style={{ paddingBottom: bottom }}
    >
      {replyTo ? (
        <View className="flex-row items-center gap-2 border-b border-line/40 px-4 py-2 bg-primary-soft/40">
          <View className="w-1 self-stretch rounded-full bg-primary" />
          <View className="min-w-0 flex-1 pl-1">
            <Text className="font-sans text-xs font-bold text-primary" numberOfLines={1}>
              Replying to {replyTo.name}
            </Text>
            <Text className="font-sans text-xs font-normal text-ink-soft" numberOfLines={1}>
              {replyTo.body}
            </Text>
          </View>
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Cancel reply"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={onCancelReply}
            className="size-8 items-center justify-center rounded-full bg-surface"
          >
            <X color={colors.muted} size={16} />
          </TactilePressable>
        </View>
      ) : null}

      <View className="flex-row items-end gap-2 px-3 py-2.5">
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Attach"
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          onPress={() => setAttachOpen(true)}
          className="mb-0.5 size-11 items-center justify-center rounded-full bg-bg border border-line/60"
        >
          <Plus color={colors.inkSoft} size={20} />
        </TactilePressable>

        <Input
          value={value}
          onChangeText={onChangeText}
          placeholder={replyTo ? "Write a reply…" : "Type a message…"}
          accessibilityLabel="Message"
          multiline
          className="max-h-28 min-h-11 flex-1 rounded-3xl border-line bg-bg px-4 py-2.5 shadow-none font-sans text-sm text-ink"
        />

        <TactilePressable
          haptic="medium"
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={!canSend}
          onPress={onSend}
          className={`mb-0.5 size-11 items-center justify-center rounded-full bg-primary shadow-sm shadow-black/10 ${
            canSend ? "opacity-100" : "opacity-40"
          }`}
        >
          <Send color={colors.primaryForeground} size={17} />
        </TactilePressable>
      </View>

      <AttachmentSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        onSelectAction={handleAttach}
      />
    </View>
  );
}
