import { X } from "@/components/icons";

import { TactilePressable } from "@/components/ui/tactile-pressable";
import { cn } from "@/lib/cn";
import { colors } from "@/lib/tokens";

type SearchClearButtonProps = {
  onPress: () => void;
  className?: string;
};

/** Shared clear affordance for list + help search fields. */
export function SearchClearButton({ onPress, className }: SearchClearButtonProps) {
  return (
    <TactilePressable
      accessibilityRole="button"
      accessibilityLabel="Clear search"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      onPress={onPress}
      className={cn(
        "size-8 items-center justify-center rounded-full bg-line/80",
        className,
      )}
    >
      <X color={colors.inkSoft} size={16} />
    </TactilePressable>
  );
}
