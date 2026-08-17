import { router } from "expo-router";
import { ChevronLeft } from "@/components/icons";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TactilePressable } from "@/components/ui/tactile-pressable";
import { colors, screenTopPad } from "@/lib/tokens";

type InScreenHeaderProps = {
  children: ReactNode;
};

export function InScreenHeader({ children }: InScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="border-b border-line/40 bg-surface"
      style={{ paddingTop: screenTopPad(insets.top) }}
    >
      <View className="h-12 flex-row items-center px-1">
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="size-11 items-center justify-center rounded-full"
        >
          <ChevronLeft color={colors.ink} size={24} />
        </TactilePressable>
        {children}
      </View>
    </View>
  );
}
