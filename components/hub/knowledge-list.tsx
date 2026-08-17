import { router, useFocusEffect } from "expo-router";
import { BookOpen } from "@/components/icons";
import { useCallback, useState } from "react";
import { FlatList, View } from "react-native";

import { KnowledgeRow } from "@/components/hub/knowledge-row";
import { Text } from "@/components/ui/text";
import { knowledgeHref } from "@/lib/hub-routes";
import { listKnowledge } from "@/lib/mock-catalog";
import { colors } from "@/lib/tokens";
import type { KnowledgeArticle } from "@/lib/types";

type KnowledgeListProps = {
  group: "agent" | "admin";
};

export function KnowledgeList({ group }: KnowledgeListProps) {
  const [items, setItems] = useState<KnowledgeArticle[]>(listKnowledge);

  useFocusEffect(
    useCallback(() => {
      setItems(listKnowledge());
    }, []),
  );

  return (
    <FlatList
      className="flex-1 bg-bg"
      data={items}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      contentContainerClassName="px-4 py-4"
      ItemSeparatorComponent={() => <View className="h-3" />}
      ListEmptyComponent={
        <View className="items-center px-4 py-16">
          <View className="size-14 items-center justify-center rounded-full bg-primary-soft">
            <BookOpen color={colors.primary} size={26} />
          </View>
          <Text className="mt-4 font-sans text-base font-semibold text-ink">
            No articles available
          </Text>
          <Text className="mt-1 text-center font-sans text-sm font-normal text-muted">
            Knowledge base articles will appear here once published.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <KnowledgeRow
          article={item}
          onPress={() => router.push(knowledgeHref(group, item.id))}
        />
      )}
    />
  );
}
