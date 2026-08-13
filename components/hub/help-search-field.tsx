import { forwardRef, useState, type Ref } from "react";
import { X } from "lucide-react-native";
import { TextInput, View } from "react-native";

import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { colors } from "@/lib/tokens";

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
    <View className="h-11 min-w-0 flex-1 flex-row items-center pr-2">
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
        className="h-11 min-w-0 flex-1 border-0 bg-transparent px-2 shadow-none font-sans text-base text-ink"
      />
      {value.length > 0 ? (
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={handleClear}
          className="size-8 items-center justify-center rounded-full bg-line/80"
        >
          <X color={colors.inkSoft} size={16} />
        </TactilePressable>
      ) : null}
    </View>
  );
});
