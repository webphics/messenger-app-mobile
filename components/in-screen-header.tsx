import { router } from "expo-router";
import { ChevronLeft } from "@/components/icons";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TactilePressable } from "@/components/ui/tactile-pressable";
import { colors, screenTopPad } from "@/lib/tokens";

type InScreenHeaderProps = {
  children: ReactNode;
  /**
   * What Back does, where leaving is not simply leaving.
   *
   * Only the screen knows it has something unsaved on it, so only the screen can
   * ask before it goes. Absent everywhere else, which is the common case: Back
   * goes back.
   */
  onBack?: () => void;
};

export function InScreenHeader({ children, onBack }: InScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="border-b border-line/40 bg-surface"
      style={{ paddingTop: screenTopPad(insets.top) }}
    >
      <View className="min-h-12 flex-row items-center px-1">
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (onBack ? onBack() : router.back())}
          className="size-11 items-center justify-center rounded-full"
        >
          <ChevronLeft color={colors.ink} size={24} />
        </TactilePressable>
        {children}
      </View>
    </View>
  );
}
