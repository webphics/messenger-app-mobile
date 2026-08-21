import { forwardRef, useState, type Ref } from "react";
import { TextInput, View } from "react-native";

import { SearchClearButton } from "@/components/search-clear-button";
import { Input } from "@/components/ui/input";

type HelpSearchFieldProps = {
  onQuery: (query: string) => void;
  placeholder?: string;
};

export const HelpSearchField = forwardRef(function HelpSearchField(
  { onQuery, placeholder = "Search for help" }: HelpSearchFieldProps,
  ref: Ref<TextInput>,
) {
  const [value, setValue] = useState("");

  const handleClear = () => {
    setValue("");
    onQuery("");
  };

  return (
    <View className="h-11 min-w-0 flex-1 flex-row items-center rounded-2xl border border-line/80 bg-line/35 pl-3 pr-2">
      <Input
        ref={ref}
        autoFocus
        showSoftInputOnFocus
        value={value}
        onChangeText={(text) => {
          setValue(text);
          onQuery(text);
        }}
        placeholder={placeholder}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        className="h-11 min-w-0 flex-1 border-0 bg-transparent px-1 font-sans text-base text-ink"
      />
      {value.length > 0 ? <SearchClearButton onPress={handleClear} /> : null}
    </View>
  );
});
