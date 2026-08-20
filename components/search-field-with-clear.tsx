import { Search, X } from "@/components/icons";
import { View } from "react-native";

import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { colors } from "@/lib/tokens";

type SearchFieldWithClearProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  accessibilityLabel: string;
};

/** Bordered list search (inbox / users / new-chat). Not the help-header field. */
export function SearchFieldWithClear({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
}: SearchFieldWithClearProps) {
  return (
    <View className="relative flex-row items-center">
      <Input
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        accessibilityLabel={accessibilityLabel}
        className="h-11 flex-1 rounded-2xl border-line bg-bg pl-10 pr-10 shadow-none font-sans text-sm"
      />
      <View className="pointer-events-none absolute left-3">
        <Search color={colors.muted} size={18} />
      </View>
      {value.length > 0 ? (
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => onChangeText("")}
          className="absolute right-2 size-7 items-center justify-center rounded-full bg-line/80"
        >
          <X color={colors.inkSoft} size={14} />
        </TactilePressable>
      ) : null}
    </View>
  );
}
