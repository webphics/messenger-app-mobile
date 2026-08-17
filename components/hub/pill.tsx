import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";

/** Every class here is a literal so Tailwind picks it up when scanning this file. */
const TONE = {
  primary: { bg: "bg-primary-soft", text: "text-primary", dot: "bg-primary" },
  success: { bg: "bg-success/15", text: "text-success", dot: "bg-success" },
  amber: { bg: "bg-amber/20", text: "text-amber", dot: "bg-amber" },
} as const;

type PillProps = {
  label: string;
  tone?: keyof typeof TONE;
  /** Renders the small status dot ahead of the label. */
  dot?: boolean;
  className?: string;
};

/** Small rounded-full status/count label used across the hubs. */
export function Pill({ label, tone = "primary", dot = false, className }: PillProps) {
  const style = TONE[tone];

  return (
    <View
      className={cn(
        "flex-row items-center gap-1.5 rounded-full px-2.5 py-0.5",
        style.bg,
        className,
      )}
    >
      {dot ? <View className={cn("size-2 rounded-full", style.dot)} /> : null}
      <Text className={cn("font-sans text-xs font-semibold", style.text)}>{label}</Text>
    </View>
  );
}
