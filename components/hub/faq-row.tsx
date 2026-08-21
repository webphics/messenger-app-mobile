import { ChevronDown, ChevronUp } from "@/components/icons";
import { memo, useCallback } from "react";
import { View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { settleEnter } from "@/lib/motion-enter";
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
        "border border-line bg-surface p-4",
        chrome === "card"
          ? "rounded-3xl shadow-md shadow-black/5"
          : "rounded-2xl shadow-sm shadow-black/5",
      )}
    >
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 font-sans text-base font-semibold text-ink">
          {item.question}
        </Text>
        {open ? (
          <ChevronUp color={colors.primary} size={20} />
        ) : (
          <ChevronDown color={colors.muted} size={20} />
        )}
      </View>
      {open ? (
        <Animated.View entering={settleEnter(!!reduceMotion)}>
          <Text
            className={cn(
              "mt-2.5 border-t border-line/60 pt-2.5 font-sans text-sm font-normal text-ink-soft",
              chrome === "card" ? "leading-6" : "leading-5",
            )}
          >
            {item.answer}
          </Text>
        </Animated.View>
      ) : null}
    </TactilePressable>
  );
});
