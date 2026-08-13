import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, screenTopPad } from "@/lib/tokens";

type InScreenHeaderProps = {
  children: ReactNode;
};

export function InScreenHeader({ children }: InScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="bg-surface"
      style={{ paddingTop: screenTopPad(insets.top) }}
    >
      <View className="h-12 flex-row items-center px-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="size-11 items-center justify-center"
        >
          <ChevronLeft color={colors.ink} size={26} />
        </Pressable>
        {children}
      </View>
    </View>
  );
}
