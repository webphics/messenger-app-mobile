import type { ReactNode } from "react";
import { View } from "react-native";

import { ChevronRight, type IconComponent } from "@/components/icons";
import { IconChip, type IconChipTone } from "@/components/hub/icon-chip";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { colors } from "@/lib/tokens";

type ActionRowProps = {
  title: string;
  hint: string;
  onPress: () => void;
  accessibilityLabel?: string;
  /** Omit for a text-only row. */
  icon?: IconComponent;
  tone?: IconChipTone;
  /** Trailing content before the chevron, e.g. a `<Pill />` count. */
  trailing?: ReactNode;
  chevron?: boolean;
  /** Clamp the hint to one line where the row must not grow. */
  hintLines?: number;
  className?: string;
};

/**
 * Full-width navigation row — optional icon chip, title and hint, optional
 * trailing content, optional chevron. The hub list-item counterpart to
 * `ActionTile`.
 */
export function ActionRow({
  title,
  hint,
  onPress,
  accessibilityLabel,
  icon,
  tone = "primary",
  trailing,
  chevron = true,
  hintLines,
  className,
}: ActionRowProps) {
  return (
    <TactilePressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      className={cn(
        "flex-row items-center gap-3.5 rounded-2xl border border-line bg-surface p-4 shadow-md shadow-black/5",
        className,
      )}
    >
      {icon ? <IconChip icon={icon} tone={tone} /> : null}
      <View className="min-w-0 flex-1">
        <Text className="font-sans text-base font-semibold text-ink">{title}</Text>
        <Text
          className="mt-0.5 font-sans text-xs font-normal text-muted"
          numberOfLines={hintLines}
        >
          {hint}
        </Text>
      </View>
      {trailing}
      {chevron ? <ChevronRight color={colors.muted} size={18} /> : null}
    </TactilePressable>
  );
}
