import { router, useFocusEffect } from "expo-router";
import { BookOpen, Search } from "@/components/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, TextInput, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { HelpSearchField } from "@/components/hub/help-search-field";
import { InScreenHeader } from "@/components/in-screen-header";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { knowledgeHref } from "@/lib/hub-routes";
import { filterKnowledge } from "@/lib/knowledge-filter";
import { listKnowledge } from "@/lib/mock-catalog";
import { settleEnter } from "@/lib/motion-enter";
import {
  makeRefreshControl,
  useSimulatedRefresh,
} from "@/lib/simulated-refresh";
import { colors } from "@/lib/tokens";
import type { KnowledgeArticle } from "@/lib/types";

type KnowledgeSearchScreenProps = {
  group: "agent" | "admin";
};

export function KnowledgeSearchScreen({ group }: KnowledgeSearchScreenProps) {
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<KnowledgeArticle[]>(listKnowledge);
  const results = useMemo(() => filterKnowledge(items, query), [items, query]);
  const { refreshing, onRefresh } = useSimulatedRefresh(() => {
    setItems(listKnowledge());
  });

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
          placeholder="Search knowledge base…"
        />
      </InScreenHeader>
      <FlatList
        className="flex-1 bg-bg"
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
              <Text variant="title" className="mt-4 text-ink">
                No matching articles
              </Text>
              <Text variant="meta" className="mt-1 text-center text-muted">
                Try searching for general keywords like "password", "billing", or "account".
              </Text>
            </View>
          ) : (
            <View className="items-center px-4 py-12">
              <View className="size-14 items-center justify-center rounded-full bg-primary-soft">
                <BookOpen color={colors.primary} size={26} />
              </View>
              <Text variant="title" className="mt-4 text-ink">
                Search the Knowledge Base
              </Text>
              <Text variant="meta" className="mt-1 text-center text-muted">
                Quickly look up guides, troubleshooting steps, and answers.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel={item.title}
            onPress={() => router.push(knowledgeHref(group, item.id))}
            className="rounded-2xl border border-line bg-surface p-4 shadow-sm shadow-black/5"
          >
            <Text variant="title" className="text-ink">
              {item.title}
            </Text>
            <Animated.View entering={settleEnter(!!reduceMotion)}>
              <Text
                variant="meta"
                className="mt-1.5 text-ink-soft"
                numberOfLines={2}
              >
                {item.body}
              </Text>
            </Animated.View>
            {item.tags.length > 0 ? (
              <View className="mt-3 flex-row flex-wrap gap-1.5">
                {item.tags.map((tag) => (
                  <View
                    key={tag}
                    className="rounded-md bg-bg px-2 py-0.5 border border-line/60"
                  >
                    <Text variant="label" className="text-muted">
                      #{tag}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </TactilePressable>
        )}
        refreshControl={makeRefreshControl(refreshing, onRefresh)}
      />
    </View>
  );
}
