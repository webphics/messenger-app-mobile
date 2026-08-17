import { View } from "react-native";

import type { IconComponent } from "@/components/icons";
import { cn } from "@/lib/cn";
import { colors } from "@/lib/tokens";

/**
 * Tone → chip background + icon colour. Class strings stay literal so Tailwind
 * can see them when it scans this file.
 */
const TONE = {
  primary: { chip: "bg-primary-soft", icon: colors.primary },
  primaryFilled: { chip: "bg-primary", icon: colors.primaryForeground },
  amber: { chip: "bg-amber/15", icon: colors.amber },
  neutral: { chip: "bg-bg", icon: colors.muted },
} as const;

export type IconChipTone = keyof typeof TONE;

type IconChipProps = {
  icon: IconComponent;
  tone?: IconChipTone;
  /** Chip edge length in px; the glyph is sized to match. */
  size?: 32 | 44;
  className?: string;
};

const BOX = { 32: "size-8 rounded-xl", 44: "size-11 rounded-2xl" } as const;
const GLYPH = { 32: 18, 44: 22 } as const;

/** The rounded icon square shared by every hub tile and row. */
export function IconChip({
  icon: Icon,
  tone = "primary",
  size = 44,
  className,
}: IconChipProps) {
  return (
    <View
      className={cn(
        "items-center justify-center",
        BOX[size],
        TONE[tone].chip,
        className,
      )}
    >
      <Icon color={TONE[tone].icon} size={GLYPH[size]} />
    </View>
  );
}
