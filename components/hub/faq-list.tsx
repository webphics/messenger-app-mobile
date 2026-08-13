import { useFocusEffect } from "expo-router";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useCallback, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

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
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            onPress={() => setOpenId(open ? null : item.id)}
            className="rounded-2xl border border-line bg-surface p-4 shadow-md shadow-black/10"
          >
            <View className="flex-row items-start justify-between gap-3">
              <Text className="flex-1 font-sans text-base font-medium text-ink">
                {item.question}
              </Text>
              {open ? (
                <ChevronUp color={colors.muted} size={20} />
              ) : (
                <ChevronDown color={colors.muted} size={20} />
              )}
            </View>
            {open ? (
              <Animated.View
                entering={FadeIn.springify().damping(20).stiffness(220)}
              >
                <Text className="mt-2 font-sans text-sm font-normal leading-5 text-ink-soft">
                  {item.answer}
                </Text>
              </Animated.View>
            ) : null}
          </Pressable>
        );
      }}
    />
  );
}
