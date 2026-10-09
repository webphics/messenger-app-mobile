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
  /** The keyboard's return key, for a search that acts on submit (the saved-response picker). */
  onSubmitEditing?: () => void;
  returnKeyType?: "search" | "done" | "go";
};

/** Bordered list search (inbox / users / new-chat). Not the help-header field. */
export function SearchFieldWithClear({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  onSubmitEditing,
  returnKeyType,
}: SearchFieldWithClearProps) {
  return (
    <View className="relative flex-row items-center">
      <Input
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        accessibilityLabel={accessibilityLabel}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
        submitBehavior={onSubmitEditing ? "submit" : undefined}
        className="h-11 flex-1 rounded-2xl border-line/80 bg-line/35 pl-10 pr-10 font-sans text-base text-ink"
      />
      <View className="pointer-events-none absolute left-3.5">
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
