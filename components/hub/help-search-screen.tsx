import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { HelpSearchField } from "@/components/hub/help-search-field";
import { InScreenHeader } from "@/components/in-screen-header";
import { Text } from "@/components/ui/text";
import { filterFaq } from "@/lib/faq-filter";
import { FAQ_ITEMS } from "@/lib/mock-data";

export function HelpSearchScreen() {
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const results = useMemo(() => filterFaq(FAQ_ITEMS, query), [query]);

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, []);

  return (
    <View className="flex-1 bg-surface">
      <InScreenHeader>
        <HelpSearchField ref={inputRef} onQuery={setQuery} />
      </InScreenHeader>
      <FlatList
        className="flex-1 bg-surface"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-4 py-2"
        ListEmptyComponent={
          query.trim() ? (
            <Text className="px-1 py-8 text-center font-sans text-sm font-normal text-muted">
              No results
            </Text>
          ) : null
        }
        renderItem={({ item }) => {
          const open = item.id === openId;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              onPress={() => setOpenId(open ? null : item.id)}
              className="border-b border-line py-3"
            >
              <Text className="font-sans text-base font-medium text-ink">
                {item.question}
              </Text>
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
    </View>
  );
}
