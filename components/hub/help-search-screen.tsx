import { useFocusEffect } from "expo-router";
import { ChevronDown, ChevronUp, HelpCircle, Search } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { HelpSearchField } from "@/components/hub/help-search-field";
import { InScreenHeader } from "@/components/in-screen-header";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { filterFaq } from "@/lib/faq-filter";
import { listFaqs } from "@/lib/mock-catalog";
import { colors } from "@/lib/tokens";
import type { FaqItem } from "@/lib/types";

export function HelpSearchScreen() {
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [faqs, setFaqs] = useState<FaqItem[]>(listFaqs);
  const results = useMemo(() => filterFaq(faqs, query), [faqs, query]);

  useFocusEffect(
    useCallback(() => {
      setFaqs(listFaqs());
    }, []),
  );

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, []);

  return (
    <View className="flex-1 bg-bg">
      <InScreenHeader>
        <HelpSearchField ref={inputRef} onQuery={setQuery} placeholder="Search help & FAQs…" />
      </InScreenHeader>
      <FlatList
        className="flex-1 bg-bg"
        extraData={openId}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-4 py-3 gap-3"
        ListEmptyComponent={
          query.trim() ? (
            <View className="items-center px-4 py-12">
              <View className="size-14 items-center justify-center rounded-full bg-primary-soft">
                <Search color={colors.primary} size={26} />
              </View>
              <Text className="mt-4 font-sans text-base font-semibold text-ink">
                No matching answers
              </Text>
              <Text className="mt-1 text-center font-sans text-sm font-normal text-muted">
                Try different keywords or browse our FAQ section.
              </Text>
            </View>
          ) : (
            <View className="items-center px-4 py-12">
              <View className="size-14 items-center justify-center rounded-full bg-primary-soft">
                <HelpCircle color={colors.primary} size={26} />
              </View>
              <Text className="mt-4 font-sans text-base font-semibold text-ink">
                Search Help & FAQs
              </Text>
              <Text className="mt-1 text-center font-sans text-sm font-normal text-muted">
                Find quick answers to common questions.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const open = item.id === openId;
          return (
            <TactilePressable
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              onPress={() => setOpenId(open ? null : item.id)}
              className="rounded-2xl border border-line bg-surface p-4 shadow-sm shadow-black/5"
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
                  <Text className="mt-2.5 border-t border-line/60 pt-2.5 font-sans text-sm font-normal leading-5 text-ink-soft">
                    {item.answer}
                  </Text>
                </Animated.View>
              ) : null}
            </TactilePressable>
          );
        }}
      />
    </View>
  );
}
