import { useFocusEffect } from "expo-router";
import { ChevronDown, ChevronUp } from "@/components/icons";
import { useCallback, useState } from "react";
import { FlatList, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { listFaqs } from "@/lib/mock-catalog";
import { colors } from "@/lib/tokens";
import type { FaqItem } from "@/lib/types";

function FaqSeparator() {
  return <View className="h-3" />;
}

export function FaqList() {
  const [items, setItems] = useState<FaqItem[]>(listFaqs);
  const [openId, setOpenId] = useState<string | null>(listFaqs()[0]?.id ?? null);

  useFocusEffect(
    useCallback(() => {
      const next = listFaqs();
      setItems(next);
      setOpenId((id) => (id && next.some((item) => item.id === id) ? id : next[0]?.id ?? null));
    }, []),
  );

  return (
    <FlatList
      className="flex-1 bg-bg"
      extraData={openId}
      showsVerticalScrollIndicator={false}
      contentContainerClassName="px-4 py-4"
      data={items}
      keyExtractor={(item) => item.id}
      ItemSeparatorComponent={FaqSeparator}
      renderItem={({ item }) => {
        const open = item.id === openId;
        return (
          <TactilePressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            onPress={() => setOpenId(open ? null : item.id)}
            className="rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5"
          >
            <View className="flex-row items-start justify-between gap-3">
              <Text className="flex-1 font-sans text-base font-semibold text-ink">
                {item.question}
              </Text>
              {open ? (
                <ChevronUp color={colors.primary} size={20} />
              ) : (
                <ChevronDown color={colors.muted} size={20} />
              )}
            </View>
            {open ? (
              <Animated.View
                entering={FadeIn.springify().damping(20).stiffness(220)}
              >
                <Text className="mt-2.5 border-t border-line/60 pt-2.5 font-sans text-sm font-normal leading-6 text-ink-soft">
                  {item.answer}
                </Text>
              </Animated.View>
            ) : null}
          </TactilePressable>
        );
      }}
    />
  );
}
