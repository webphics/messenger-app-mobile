import { Search } from "@/components/icons";
import { View } from "react-native";

import { SearchClearButton } from "@/components/search-clear-button";
import { Input } from "@/components/ui/input";
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
        className="h-11 flex-1 rounded-2xl border-line bg-bg pl-10 pr-10 shadow-none font-sans text-base"
      />
      <View className="pointer-events-none absolute left-3">
        <Search color={colors.muted} size={18} />
      </View>
      {value.length > 0 ? (
        <SearchClearButton
          onPress={() => onChangeText("")}
          className="absolute right-2"
        />
      ) : null}
    </View>
  );
}
