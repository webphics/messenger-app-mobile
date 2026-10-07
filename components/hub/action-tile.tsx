import { View } from "react-native";

import type { IconComponent } from "@/components/icons";
import { IconChip, type IconChipTone } from "@/components/hub/icon-chip";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";

type ActionTileProps = {
  icon: IconComponent;
  title: string;
  hint: string;
  onPress: () => void;
  /** Defaults to `title`; set when the spoken label should differ. */
  accessibilityLabel?: string;
  tone?: IconChipTone;
  className?: string;
};

/**
 * Square navigation tile — icon chip over a title and hint. Sits in a
 * `flex-row gap-3` pair; `flex-1` here makes the pair split the row evenly.
 */
export function ActionTile({
  icon,
  title,
  hint,
  onPress,
  accessibilityLabel,
  tone = "primary",
  className,
}: ActionTileProps) {
  return (
    <TactilePressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      className={cn(
        "flex-1 rounded-3xl border border-line/70 bg-surface p-4 shadow-md shadow-black/8",
        className,
      )}
    >
      <IconChip icon={icon} tone={tone} />
      <Text variant="title" className="mt-3 text-ink">{title}</Text>
      <Text variant="meta" className="mt-0.5 text-muted">{hint}</Text>
    </TactilePressable>
  );
}

type StatTileProps = {
  value: string;
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  /** Tints the value; `primary` marks the actionable half of a pair. */
  tone?: "ink" | "primary";
  /** Suffix rendered inside the value, e.g. the `/24` in `18/24`. */
  suffix?: string;
  /** Amber dot beside the value, for "needs attention" counts. */
  alert?: boolean;
};

const VALUE_TONE = { ink: "text-ink", primary: "text-primary" } as const;

/** Counter tile used inside the hub overview cards. */
export function StatTile({
  value,
  label,
  onPress,
  accessibilityLabel,
  tone = "ink",
  suffix,
  alert = false,
}: StatTileProps) {
  return (
    <TactilePressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      className="flex-1 rounded-2xl border border-line/80 bg-line/35 p-3"
    >
      <View className="flex-row items-center gap-1.5">
        <Text variant="display" className={VALUE_TONE[tone]}>
          {value}
          {suffix ? (
            <Text variant="meta" className="text-muted">{suffix}</Text>
          ) : null}
        </Text>
        {alert ? <View className="size-2 rounded-full bg-amber" /> : null}
      </View>
      {/* Three tiles share one row on a 360dp phone, where "Conversations"
          is one letter too wide for the 12px label and broke as "Conversation / s".
          Shrinking the label a step beats a second line that misaligns the row. */}
      <Text
        variant="label"
        className="mt-0.5 text-muted"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {label}
      </Text>
    </TactilePressable>
  );
}
