import { router, useFocusEffect } from "expo-router";
import { BookOpen } from "@/components/icons";
import { useCallback, useState } from "react";
import { FlatList, View } from "react-native";

import { KnowledgeRow } from "@/components/hub/knowledge-row";
import { Text } from "@/components/ui/text";
import { knowledgeHref } from "@/lib/hub-routes";
import { listKnowledge } from "@/lib/mock-catalog";
import {
  makeRefreshControl,
  useSimulatedRefresh,
} from "@/lib/simulated-refresh";
import { colors } from "@/lib/tokens";
import type { KnowledgeArticle } from "@/lib/types";

type KnowledgeListProps = {
  group: "agent" | "admin";
};

function keyExtractor(item: KnowledgeArticle) {
  return item.id;
}

function KnowledgeItemSeparator() {
  return <View className="h-3" />;
}

export function KnowledgeList({ group }: KnowledgeListProps) {
  const [items, setItems] = useState<KnowledgeArticle[]>(listKnowledge);
  const { refreshing, onRefresh } = useSimulatedRefresh(() => {
    setItems(listKnowledge());
  });

  useFocusEffect(
    useCallback(() => {
      setItems(listKnowledge());
    }, []),
  );

  const openArticle = useCallback(
    (articleId: string) => {
      router.push(knowledgeHref(group, articleId));
    },
    [group],
  );

  const renderItem = useCallback(
    ({ item }: { item: KnowledgeArticle }) => (
      <KnowledgeRow article={item} onPress={openArticle} />
    ),
    [openArticle],
  );

  return (
    <FlatList
      className="flex-1 bg-bg"
      data={items}
      keyExtractor={keyExtractor}
      initialNumToRender={10}
      maxToRenderPerBatch={8}
      windowSize={5}
      showsVerticalScrollIndicator={false}
      contentContainerClassName="px-4 py-4"
      ItemSeparatorComponent={KnowledgeItemSeparator}
      ListEmptyComponent={
        <View className="items-center px-4 py-16">
          <View className="size-14 items-center justify-center rounded-full bg-primary-soft">
            <BookOpen color={colors.primary} size={26} />
          </View>
          <Text variant="title" className="mt-4 text-ink">
            No articles available
          </Text>
          <Text variant="meta" className="mt-1 text-center text-muted">
            Knowledge base articles will appear here once published.
          </Text>
        </View>
      }
      renderItem={renderItem}
      refreshControl={makeRefreshControl(refreshing, onRefresh)}
    />
  );
}
