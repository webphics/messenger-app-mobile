import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { HelpSearchField } from "@/components/hub/help-search-field";
import { InScreenHeader } from "@/components/in-screen-header";
import { Text } from "@/components/ui/text";
import { knowledgeHref } from "@/lib/hub-routes";
import { filterKnowledge } from "@/lib/knowledge-filter";
import { listKnowledge } from "@/lib/mock-catalog";
import type { KnowledgeArticle } from "@/lib/types";

type KnowledgeSearchScreenProps = {
  group: "agent" | "admin";
};

export function KnowledgeSearchScreen({ group }: KnowledgeSearchScreenProps) {
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<KnowledgeArticle[]>(listKnowledge);
  const results = useMemo(() => filterKnowledge(items, query), [items, query]);

  useFocusEffect(
    useCallback(() => {
      setItems(listKnowledge());
    }, []),
  );

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, []);

  return (
    <View className="flex-1 bg-bg">
      <InScreenHeader>
        <HelpSearchField
          ref={inputRef}
          onQuery={setQuery}
          placeholder="Search knowledge"
        />
      </InScreenHeader>
      <FlatList
        className="flex-1 bg-bg"
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
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.title}
            onPress={() => router.push(knowledgeHref(group, item.id))}
            className="border-b border-line py-3"
          >
            <Text className="font-sans text-base font-medium text-ink">{item.title}</Text>
            <Animated.View entering={FadeIn.springify().damping(20).stiffness(220)}>
              <Text className="mt-1 font-sans text-sm font-normal text-muted" numberOfLines={2}>
                {item.body}
              </Text>
            </Animated.View>
          </Pressable>
        )}
      />
    </View>
  );
}
