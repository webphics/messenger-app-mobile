import { ChevronDown, ChevronUp } from "@/components/icons";
import { memo, useCallback } from "react";
import { View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { disclosureEnter } from "@/lib/motion-enter";
import { colors } from "@/lib/tokens";
import type { FaqItem } from "@/lib/types";

type FaqRowProps = {
  item: FaqItem;
  open: boolean;
  onToggle: (id: string) => void;
  /** Hub FAQ cards vs help-search denser chrome. */
  chrome?: "card" | "search";
};

export const FaqRow = memo(function FaqRow({
  item,
  open,
  onToggle,
  chrome = "card",
}: FaqRowProps) {
  const reduceMotion = useReducedMotion();

  const handlePress = useCallback(() => {
    onToggle(item.id);
  }, [item.id, onToggle]);

  return (
    <TactilePressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={handlePress}
      className={cn(
        "border border-line/70 bg-surface p-4",
        chrome === "card"
          ? "rounded-3xl shadow-md shadow-black/8"
          : "rounded-2xl shadow-sm shadow-black/8",
      )}
    >
      <View className="flex-row items-start justify-between gap-3">
        <Text variant="title" className="flex-1 text-ink">
          {item.question}
        </Text>
        {open ? (
          <ChevronUp color={colors.primary} size={20} />
        ) : (
          <ChevronDown color={colors.muted} size={20} />
        )}
      </View>
      {open ? (
        <Animated.View entering={disclosureEnter(!!reduceMotion)}>
          <Text
            variant="meta"
            className="mt-2.5 border-t border-line/60 pt-2.5 text-ink-soft"
          >
            {item.answer}
          </Text>
        </Animated.View>
      ) : null}
    </TactilePressable>
  );
});
